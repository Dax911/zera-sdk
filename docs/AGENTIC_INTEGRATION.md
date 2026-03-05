# Agentic Integration Guide

Integrating ZERA into AI agent systems for private, autonomous payments on Solana.

---

## Why Agents Need Private Payments

Autonomous AI agents transact at machine speed and machine scale -- thousands of API calls, data purchases, and inter-agent payments per day. Every one of these transactions on a public blockchain creates a behavioral fingerprint that reveals the agent's strategy, data sources, spending patterns, and operator identity. Competitors can reverse-engineer trading strategies from payment patterns, MEV bots can front-run predictable agents, and service providers can price-discriminate based on observed usage. ZERA's shielded pool gives agents cryptographic unlinkability: deposit USDC once, transact privately inside the pool, and withdraw to fresh addresses with no on-chain link between any two operations.

---

## Agent Payment Lifecycle

```
1. DEPOSIT    Agent deposits USDC into the shielded pool
              -> Receives a cryptographic note (commitment on-chain)
              -> USDC balance disappears from public view

2. TRANSFER   Agent-to-agent payments happen inside the pool
              -> Zero on-chain trace of sender, receiver, or amount
              -> Only nullifiers and new commitments are visible

3. WITHDRAW   Agent withdraws USDC to any Solana address
              -> Can use a relayer (no SOL needed for gas)
              -> Proof reveals nothing about the agent's pool history
```

---

## SDK Setup

```bash
npm install @zera-labs/sdk
```

All cryptographic primitives, transaction builders, and tree state management are exported from a single entry point:

```typescript
import {
  // Note management
  createNote,
  computeCommitment,
  computeNullifier,
  hashPubkeyToField,

  // Proof generation
  generateDepositProof,
  generateWithdrawProof,
  generateTransferProof,

  // Transaction builders
  buildDepositTransaction,
  buildWithdrawTransaction,
  buildTransferTransaction,

  // Tree state
  MerkleTree,
  TreeStateClient,

  // Utilities
  bigintToBytes32BE,
  formatProofForSolana,
  formatPublicInputsForSolana,

  // Constants
  USDC_MINT,
  USDC_DECIMALS,
  SHIELDED_POOL_PROGRAM_ID,

  // Types
  type Note,
  type StoredNote,
  type DepositParams,
  type WithdrawParams,
  type TransferParams,
} from "@zera-labs/sdk";
```

---

## Deposit: Funding the Shielded Pool

```typescript
import { Connection, Keypair, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import {
  createNote,
  computeCommitment,
  computeNullifier,
  hashPubkeyToField,
  generateDepositProof,
  buildDepositTransaction,
  formatPublicInputsForSolana,
  USDC_MINT,
} from "@zera-labs/sdk";

const connection = new Connection("https://api.mainnet-beta.solana.com");
const agentWallet = Keypair.fromSecretKey(/* agent's secret key */);
const mint = new PublicKey(USDC_MINT);

// 1. Create a shielded note for 10 USDC
const assetHash = await hashPubkeyToField(mint.toBytes());
const note = createNote(10_000_000n, assetHash); // 10 USDC in base units

// 2. Compute commitment and generate proof
const commitment = await computeCommitment(note);
const nullifier = await computeNullifier(note.secret, commitment);
const proofResult = await generateDepositProof(note, WASM_PATH, ZKEY_PATH);

// 3. Build and submit the deposit transaction
const tx = buildDepositTransaction({
  payer: agentWallet.publicKey,
  mint,
  amount: note.amount,
  commitment: proofResult.commitment,
  proof: proofResult.proof,
  publicInputs: formatPublicInputsForSolana(proofResult.publicSignals),
});

const txSig = await sendAndConfirmTransaction(connection, tx, [agentWallet]);

// 4. Persist the note -- the secret and blinding are the spending keys
const storedNote: StoredNote = {
  ...note,
  commitment,
  nullifier,
  leafIndex: /* read from DepositEvent logs */,
};
await noteStore.save(storedNote);
```

---

## Transfer: Private Agent-to-Agent Payment

```typescript
import {
  createNote,
  computeCommitment,
  generateTransferProof,
  buildTransferTransaction,
  formatPublicInputsForSolana,
  TreeStateClient,
  MerkleTree,
} from "@zera-labs/sdk";

// 1. Load input note and rebuild Merkle tree
const inputNote = await noteStore.getUnspent()[0]; // 10 USDC note
const treeClient = new TreeStateClient({ rpcUrl: "https://api.mainnet-beta.solana.com" });
const leaves = await treeClient.fetchAllLeaves();
const tree = await MerkleTree.create(24);
for (const leaf of leaves) {
  await tree.insert(leaf);
}

// 2. Create two output notes: payment + change
const paymentNote = createNote(3_000_000n, inputNote.asset);  // 3 USDC to recipient
const changeNote = createNote(7_000_000n, inputNote.asset);   // 7 USDC change

// 3. Generate transfer proof (1-input, 2-output)
const proofResult = await generateTransferProof(
  inputNote,
  inputNote.leafIndex,
  tree,
  paymentNote,
  changeNote,
  WASM_PATH,
  ZKEY_PATH,
);

// 4. Build and submit
const tx = buildTransferTransaction({
  payer: agentWallet.publicKey,
  mint,
  nullifierHash: proofResult.nullifierHash,
  outputCommitment1: proofResult.outputCommitment1,
  outputCommitment2: proofResult.outputCommitment2,
  root: tree.root,
  proof: proofResult.proof,
  publicInputs: formatPublicInputsForSolana(proofResult.publicSignals),
});
await sendAndConfirmTransaction(connection, tx, [agentWallet]);

// 5. Update local state
await noteStore.markSpent(inputNote.nullifier);
await noteStore.save({ ...changeNote, commitment: proofResult.outputCommitment2, /* ... */ });

// 6. Deliver paymentNote's secret + blinding to recipient agent (encrypted channel)
await deliverNoteToRecipient(recipientAgentEndpoint, paymentNote);
```

---

## Withdraw: Exiting the Pool

```typescript
import {
  generateWithdrawProof,
  buildWithdrawTransaction,
  hashPubkeyToField,
  formatPublicInputsForSolana,
} from "@zera-labs/sdk";

const recipient = new PublicKey("Recipient111...");
const recipientHash = await hashPubkeyToField(recipient.toBytes());

const proofResult = await generateWithdrawProof(
  storedNote,
  storedNote.leafIndex,
  tree,
  recipientHash,
  WASM_PATH,
  ZKEY_PATH,
);

const tx = buildWithdrawTransaction({
  payer: agentWallet.publicKey,
  recipient,
  mint,
  amount: storedNote.amount,
  nullifierHash: proofResult.nullifierHash,
  root: tree.root,
  proof: proofResult.proof,
  publicInputs: formatPublicInputsForSolana(proofResult.publicSignals),
});

await sendAndConfirmTransaction(connection, tx, [agentWallet]);
await noteStore.markSpent(storedNote.nullifier);
```

---

## x402 Integration: Shielded HTTP Payments

When an agent encounters an HTTP `402 Payment Required` response, it can pay from the shielded pool instead of a transparent wallet. This breaks the link between the agent's identity and its API consumption.

### Flow

```
Agent  --->  GET /api/data  --->  Server
       <---  402 + payment instructions (amount, recipient address)

Agent  --->  Withdraw from shielded pool to ephemeral wallet
       --->  Sign x402 payment from ephemeral wallet
       --->  Retry request with X-PAYMENT header  --->  Server
       <---  200 + data
```

### Implementation

```typescript
import { Keypair } from "@solana/web3.js";

async function handleX402(response: Response, noteStore: NoteStore, tree: MerkleTree) {
  if (response.status !== 402) return response;

  // Parse x402 payment requirements from response headers
  const paymentHeader = response.headers.get("PAYMENT-REQUIRED");
  const { amount, recipientAddress, network } = parseX402Header(paymentHeader);

  if (network !== "solana") throw new Error("Unsupported network");

  // Generate an ephemeral wallet (used once, then discarded)
  const ephemeralWallet = Keypair.generate();
  const recipient = ephemeralWallet.publicKey;

  // Withdraw from shielded pool to the ephemeral wallet
  const note = await noteStore.selectForAmount(BigInt(amount));
  const recipientHash = await hashPubkeyToField(recipient.toBytes());
  const proofResult = await generateWithdrawProof(
    note, note.leafIndex, tree, recipientHash, WASM_PATH, ZKEY_PATH,
  );

  const withdrawTx = buildWithdrawTransaction({
    payer: agentWallet.publicKey,
    recipient,
    mint,
    amount: note.amount,
    nullifierHash: proofResult.nullifierHash,
    root: tree.root,
    proof: proofResult.proof,
    publicInputs: formatPublicInputsForSolana(proofResult.publicSignals),
  });
  await sendAndConfirmTransaction(connection, withdrawTx, [agentWallet]);

  // Sign the x402 payment from the ephemeral wallet (standard x402 flow)
  const paymentSignature = await signX402Payment(ephemeralWallet, amount, recipientAddress);

  // Retry the original request with the payment signature
  return fetch(response.url, {
    headers: { "PAYMENT-SIGNATURE": paymentSignature },
  });
}
```

The API provider sees a payment from a fresh, unlinkable wallet. No on-chain observer can connect it to the agent's funding source.

---

## MCP Server Integration

A ZERA MCP server exposes shielded pool operations as tools that any MCP-compatible AI (Claude, ChatGPT, Gemini) can call.

### Tool Definitions

#### `zera_deposit`

```typescript
{
  name: "zera_deposit",
  description: "Deposit USDC into the ZERA shielded pool. Funds become private after deposit.",
  inputSchema: {
    type: "object",
    properties: {
      amount: { type: "number", description: "Amount of USDC to deposit (e.g., 100.50)" },
      memo: { type: "string", description: "Optional private memo (never stored on-chain)" }
    },
    required: ["amount"]
  }
}
```

#### `zera_transfer`

```typescript
{
  name: "zera_transfer",
  description: "Send shielded USDC to a recipient. Sender, recipient, and amount are hidden on-chain.",
  inputSchema: {
    type: "object",
    properties: {
      amount: { type: "number", description: "Amount of USDC to send" },
      recipient: { type: "string", description: "Recipient's ZERA shielded address or public key" },
      memo: { type: "string", description: "Optional private memo for the recipient" }
    },
    required: ["amount", "recipient"]
  }
}
```

#### `zera_withdraw`

```typescript
{
  name: "zera_withdraw",
  description: "Withdraw USDC from the shielded pool to a public Solana wallet.",
  inputSchema: {
    type: "object",
    properties: {
      amount: { type: "number", description: "Amount of USDC to withdraw" },
      destination: { type: "string", description: "Solana wallet address to receive the USDC" }
    },
    required: ["amount", "destination"]
  }
}
```

#### `zera_balance`

```typescript
{
  name: "zera_balance",
  description: "Check shielded USDC balance. Local operation only -- nothing revealed on-chain.",
  inputSchema: {
    type: "object",
    properties: {},
    required: []
  }
}
```

### MCP Server Implementation

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  createNote,
  computeCommitment,
  computeNullifier,
  generateDepositProof,
  generateWithdrawProof,
  generateTransferProof,
  hashPubkeyToField,
  buildDepositTransaction,
  buildWithdrawTransaction,
  buildTransferTransaction,
  formatPublicInputsForSolana,
  TreeStateClient,
  MerkleTree,
  USDC_MINT,
} from "@zera-labs/sdk";

const server = new McpServer({ name: "zera-protocol", version: "1.0.0" });

server.tool(
  "zera_deposit",
  "Deposit USDC into the ZERA shielded pool",
  {
    amount: z.number().positive().describe("Amount of USDC to deposit"),
    memo: z.string().optional().describe("Private memo"),
  },
  async ({ amount, memo }) => {
    const amountBase = BigInt(Math.round(amount * 1_000_000));
    const note = createNote(amountBase, assetHash);
    const commitment = await computeCommitment(note);
    const proofResult = await generateDepositProof(note, WASM_PATH, ZKEY_PATH);

    const tx = buildDepositTransaction({
      payer: wallet.publicKey,
      mint: new PublicKey(USDC_MINT),
      amount: amountBase,
      commitment: proofResult.commitment,
      proof: proofResult.proof,
      publicInputs: formatPublicInputsForSolana(proofResult.publicSignals),
    });
    const txSig = await sendAndConfirmTransaction(connection, tx, [wallet]);

    await noteStore.save({ ...note, commitment, nullifier: await computeNullifier(note.secret, commitment), leafIndex: /* from event */ });

    const balance = await noteStore.getBalance();
    return {
      content: [{ type: "text", text: `Deposited ${amount.toFixed(2)} USDC. Tx: ${txSig}. Balance: ${balance} USDC.` }],
    };
  }
);

server.tool(
  "zera_balance",
  "Check shielded USDC balance (local only)",
  {},
  async () => {
    const balance = await noteStore.getBalance();
    return {
      content: [{ type: "text", text: `Shielded balance: ${balance} USDC` }],
    };
  }
);

// zera_transfer and zera_withdraw follow the same pattern...

const transport = new StdioServerTransport();
await server.connect(transport);
```

### Claude Desktop Configuration

```json
{
  "mcpServers": {
    "zera-protocol": {
      "command": "npx",
      "args": ["-y", "@zera-protocol/mcp-server"],
      "env": {
        "ZERA_NOTE_STORE_PATH": "~/.zera/notes.enc",
        "ZERA_NOTE_STORE_PASSWORD": "prompt",
        "SOLANA_RPC_URL": "https://api.mainnet-beta.solana.com"
      }
    }
  }
}
```

---

## ElizaOS / Agent Framework Plugin Pattern

For agent frameworks that use a plugin/action architecture (ElizaOS, AutoGPT, etc.):

```typescript
// eliza-plugin-zera/src/actions/privatePayment.ts
import {
  createNote,
  generateWithdrawProof,
  buildWithdrawTransaction,
  hashPubkeyToField,
  formatPublicInputsForSolana,
  TreeStateClient,
  MerkleTree,
  USDC_MINT,
} from "@zera-labs/sdk";

export const privatePaymentAction: Action = {
  name: "PRIVATE_PAYMENT",
  description: "Send a private USDC payment using the ZERA shielded pool",
  similes: ["send private payment", "anonymous transfer", "shielded payment"],

  validate: async (runtime: IAgentRuntime, message: Memory) => {
    return !!runtime.getSetting("ZERA_MASTER_SEED");
  },

  handler: async (runtime: IAgentRuntime, message: Memory, state: State) => {
    const { amount, recipient } = parsePaymentIntent(message.content);

    // Load note store from agent runtime
    const noteStore = getZeraNoteStore(runtime);
    const unspent = await noteStore.getUnspent();
    const note = selectNoteForAmount(unspent, amount);

    // Sync tree and generate proof
    const treeClient = new TreeStateClient({
      rpcUrl: runtime.getSetting("SOLANA_RPC_URL"),
    });
    const leaves = await treeClient.fetchAllLeaves();
    const tree = await MerkleTree.create(24);
    for (const leaf of leaves) await tree.insert(leaf);

    const recipientHash = await hashPubkeyToField(
      new PublicKey(recipient).toBytes()
    );
    const proofResult = await generateWithdrawProof(
      note, note.leafIndex, tree, recipientHash, WASM_PATH, ZKEY_PATH,
    );

    const tx = buildWithdrawTransaction({
      payer: agentKeypair.publicKey,
      recipient: new PublicKey(recipient),
      mint: new PublicKey(USDC_MINT),
      amount: note.amount,
      nullifierHash: proofResult.nullifierHash,
      root: tree.root,
      proof: proofResult.proof,
      publicInputs: formatPublicInputsForSolana(proofResult.publicSignals),
    });

    const txSig = await sendAndConfirmTransaction(connection, tx, [agentKeypair]);
    await noteStore.markSpent(note.nullifier);

    return {
      text: `Private payment of ${Number(amount) / 1_000_000} USDC sent. Tx: ${txSig}`,
    };
  },
};
```

**Key considerations for agent frameworks:**
- Note storage maps to the agent's memory/persistence system but **must be encrypted** -- agent memories are typically plaintext.
- Proof generation is CPU-intensive (1-5s for withdraw, 3-10s for transfer). Run in a worker thread to avoid blocking the agent's event loop.
- The agent's Solana keypair should be stored in the framework's secrets/settings, never in conversation memory.

---

## Note Storage for Agents

Agents cannot use browser localStorage. They need a programmatic, encrypted storage backend for note secrets.

### NoteStore Interface

```typescript
interface NoteStore {
  // Persistence
  save(note: StoredNote): Promise<void>;
  markSpent(nullifier: bigint): Promise<void>;

  // Queries (all local, no on-chain reads)
  getUnspent(): Promise<StoredNote[]>;
  getBalance(): Promise<number>;
  selectForAmount(amount: bigint): Promise<StoredNote>;

  // Encryption
  encrypt(password: string): Promise<Uint8Array>;
  decrypt(password: string, data: Uint8Array): Promise<void>;

  // Sync (verify local state against on-chain Merkle tree)
  sync(tree: MerkleTree): Promise<void>;
}
```

### Storage Backend Options

| Backend | Use Case | Notes |
|---------|----------|-------|
| In-memory | Testing, short-lived agents | Data lost on restart |
| Encrypted JSON file | Personal agents, dev | Argon2id + AES-256-GCM |
| SQLite + SQLCipher | Single-node agents | Column-level encryption |
| PostgreSQL | Multi-agent deployments | Encrypt secret columns |
| HashiCorp Vault / AWS Secrets Manager | Enterprise | Hardware-backed key storage |

### Critical: Bigint Serialization

`JSON.stringify` does not handle `bigint` natively. Use a custom serializer:

```typescript
function serializeNote(note: StoredNote): string {
  return JSON.stringify(note, (_, v) => typeof v === "bigint" ? `0x${v.toString(16)}` : v);
}

function deserializeNote(json: string): StoredNote {
  return JSON.parse(json, (_, v) => typeof v === "string" && v.startsWith("0x") ? BigInt(v) : v);
}
```

**If the note store is lost, the shielded funds are unrecoverable.** Always maintain encrypted backups.

---

## Key Management Recommendations

An agent manages several types of secret material:

| Key | Purpose | Recommended Storage |
|-----|---------|---------------------|
| Solana keypair | Sign transactions, pay gas | Encrypted keystore or HSM |
| Note secrets (`secret`, `blinding`) | Spend shielded notes | Encrypted database, per-note |
| Viewing key | Scan for incoming transfers | Derived from master seed |
| Master seed | Derive all keys deterministically | Secure enclave / KMS |

### Hierarchical Key Derivation

A BIP-32-style derivation scheme eliminates the need to store individual note secrets:

```typescript
class AgentKeyManager {
  constructor(private masterSeed: Uint8Array) {}

  deriveNoteSecret(index: number): bigint {
    const path = `zera/note/${index}/secret`;
    return bigintFromHMAC(this.masterSeed, path);
  }

  deriveNoteBlinding(index: number): bigint {
    const path = `zera/note/${index}/blinding`;
    return bigintFromHMAC(this.masterSeed, path);
  }
}
```

If the agent knows its master seed and the leaf index, it can recompute the secret and blinding for any note -- no per-note secret storage needed.

### Security Tiers

| Tier | Approach | Appropriate For |
|------|----------|-----------------|
| 1 | Local encrypted file (Argon2id + AES-256-GCM) | Development, small balances |
| 2 | OS keychain + passkey/biometric unlock | Personal use, meaningful balances |
| 3 | TEE-hosted server (AWS Nitro, Phala Network) | Autonomous agents, enterprise |
| 4 | MPC + TEE (2-of-3 threshold signing) | High-value agents, treasury |

---

## Relayed Withdrawals: Gasless Agent Operation

Agents often operate without native SOL for gas. ZERA supports relayed withdrawals where a third-party relayer submits the transaction and is compensated from the withdrawn amount.

```typescript
// Agent generates the withdrawal proof (same as direct withdrawal)
const proofResult = await generateWithdrawProof(
  note, note.leafIndex, tree, recipientHash, WASM_PATH, ZKEY_PATH,
);

// Send proof to a relayer service instead of submitting directly
const relayerResponse = await fetch("https://relayer.zera.fi/relay", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    proof: proofResult.proof,
    nullifierHash: proofResult.nullifierHash.toString(),
    recipient: recipientAddress,
    amount: note.amount.toString(),
    maxFee: "100000", // max 0.10 USDC fee
  }),
});

const { txSig, feeCharged } = await relayerResponse.json();
```

The relayed withdrawal circuit commits the fee in the proof, so the relayer cannot change it after proof generation. The on-chain program verifies the proof and splits the withdrawal: `(amount - operatorFee - protocolFee)` goes to the recipient, and the fee goes to the relayer.

**The agent never needs SOL.** It never needs a publicly funded wallet. It operates entirely through the shielded pool and relayer infrastructure.

---

## Tree State Synchronization

The SDK provides `TreeStateClient` for syncing the local Merkle tree with on-chain state:

```typescript
import { TreeStateClient, MerkleTree } from "@zera-labs/sdk";

const treeClient = new TreeStateClient({
  rpcUrl: "https://api.mainnet-beta.solana.com",
  cacheEndpoint: "https://api.zera.fi",  // optional, faster
});

// Fetch all leaves and rebuild the tree
const leaves = await treeClient.fetchAllLeaves();
const tree = await MerkleTree.create(24);
for (const leaf of leaves) {
  await tree.insert(leaf);
}

// Use the tree for proof generation
const proof = tree.getProof(storedNote.leafIndex);
```

`TreeStateClient` supports incremental syncing -- it only fetches new leaves since the last sync, using either a cached API endpoint or direct on-chain event replay.
