# ZERA SDK Quickstart

Get from zero to a shielded deposit in under 5 minutes.

The ZERA SDK lets you build privacy-preserving transactions on Solana using Groth16 zero-knowledge proofs, Poseidon hashing, and an on-chain shielded pool. This guide gets you running fast.

---

## Try It Now (2 Minutes)

A hosted devnet is already running. No local setup required.

| | |
|---|---|
| **RPC** | `http://64.34.82.145:18899` |
| **WebSocket** | `ws://64.34.82.145:18900` |
| **Program ID** | `B83jSQx1CT1hPRBupinaJaEkCjrfeo6Ktncu31q3ZNeX` |

This is a 1:1 Solana mainnet fork via [Surfpool](https://surfpool.run) with the ZERA Shielded Pool program pre-deployed. All mainnet tokens are available (USDC, USDT, ZERA, SOL). Surfpool includes a built-in universal faucet — wallets get SOL and tokens automatically.

### Point the Solana CLI at the devnet

```bash
solana config set --url http://64.34.82.145:18899
solana balance   # Check SOL balance (auto-funded by faucet)
```

### Install the SDK

```bash
npm install @zera-labs/sdk @solana/web3.js
```

### Create a shielded note (5 lines of code)

```typescript
import {
  createNote, computeCommitment, hashPubkeyToField,
  USDC_MINT, SHIELDED_POOL_PROGRAM_ID,
} from "@zera-labs/sdk";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";

const connection = new Connection("http://64.34.82.145:18899", "confirmed");
const wallet = Keypair.generate();

// Create a shielded note (1 USDC = 1,000,000 base units)
const mint = new PublicKey(USDC_MINT);
const assetHash = await hashPubkeyToField(mint.toBytes());
const note = createNote(1_000_000n, assetHash);
const commitment = await computeCommitment(note);

console.log("Commitment:", commitment.toString(16));
// The note's secret and blinding are private — only you can spend it
```

That's it. You just created a cryptographic commitment that can be deposited into the shielded pool. The `note.secret` and `note.blinding` fields are the spending keys — keep them safe.

---

## Run the Demos

The repo includes runnable demos so you can see the SDK in action before writing your own code.

```bash
git clone https://github.com/Zera-Labs/zera-sdk.git
cd zera-sdk
pnpm install
```

### CLI Demos (`demos/solana-basic`)

**Offline crypto demo** — runs locally, no network needed:

```bash
pnpm --filter zera-solana-basic demo
```

This walks through note creation, Poseidon commitments, nullifier derivation, Merkle tree operations, and PDA derivation. Good for understanding the cryptographic primitives.

**Pool status reader** — reads live on-chain state from the devnet:

```bash
RPC_URL=http://64.34.82.145:18899 pnpm --filter zera-solana-basic status
```

Queries all pool PDAs (config, Merkle tree, vault, fee vault) and displays account status and token balances.

**Deposit flow** — shows full deposit transaction construction:

```bash
pnpm --filter zera-solana-basic deposit
```

Walks through the complete deposit pipeline: connection, note creation, PDA derivation, commitment computation, and transaction building. The transaction is constructed but not submitted (proof generation requires circuit files — see below).

### React Demo (`demos/react-demo`)

A full React privacy wallet UI with Solana wallet adapter integration:

```bash
pnpm --filter zera-react-demo dev
```

Opens at `http://localhost:5173`. Connect a browser wallet and interact with the shielded pool through a web UI.

---

## Run Your Own Devnet

If you need a local instance (faster iteration, offline work, custom state), you can run your own Surfpool devnet. Surfpool forks Solana mainnet so the ZERA program and all token mints are available instantly.

### Install Surfpool

macOS:

```bash
brew install txtx/taps/surfpool
```

Linux / other:

```bash
curl -sL https://run.surfpool.run/ | bash
```

### Start the devnet

From the repo root:

```bash
cd devnet && surfpool start \
  --manifest-file-path ./txtx.yml \
  --rpc-url "https://api.mainnet-beta.solana.com"
```

The `--rpc-url` flag specifies which mainnet RPC to fork from. Replace with your own RPC endpoint (e.g., Helius, Triton) for better rate limits:

```bash
cd devnet && surfpool start \
  --manifest-file-path ./txtx.yml \
  --rpc-url "https://mainnet.helius-rpc.com/?api-key=YOUR_KEY"
```

Once running, your local devnet is available at `http://127.0.0.1:8899` (RPC) and `ws://127.0.0.1:8900` (WebSocket). Point the demos and your own code at this URL instead of the hosted devnet:

```bash
RPC_URL=http://127.0.0.1:8899 pnpm --filter zera-solana-basic status
```

---

## Build With the SDK

Here is the complete deposit flow, broken down step by step.

### 1. Connect and derive accounts

```typescript
import {
  createNote, computeCommitment, hashPubkeyToField,
  buildDepositTransaction,
  derivePoolConfig, deriveVault,
  USDC_MINT, SHIELDED_POOL_PROGRAM_ID,
} from "@zera-labs/sdk";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";

const connection = new Connection("http://64.34.82.145:18899", "confirmed");
const payer = Keypair.generate();
const programId = new PublicKey(SHIELDED_POOL_PROGRAM_ID);
const mint = new PublicKey(USDC_MINT);

const [poolConfig] = derivePoolConfig(mint, programId);
const [vault] = deriveVault(mint, programId);
```

### 2. Create a shielded note

```typescript
const assetHash = await hashPubkeyToField(mint.toBytes());
const note = createNote(1_000_000n, assetHash); // 1 USDC
const commitment = await computeCommitment(note);

// IMPORTANT: Store note.secret and note.blinding securely.
// You need them to withdraw or transfer the shielded funds.
```

### 3. Generate a proof and build the transaction

```typescript
import { generateDepositProof } from "@zera-labs/sdk";

// Proof generation requires circuit files (see "Circuit Files" section below)
const { proof, publicInputs } = await generateDepositProof(
  note,
  "./circuits/deposit/deposit.wasm",
  "./circuits/deposit/deposit.zkey",
);

const tx = buildDepositTransaction({
  payer: payer.publicKey,
  mint,
  amount: 1_000_000n,
  commitment,
  proof,
  publicInputs,
  programId,
});
```

### 4. Sign and send

```typescript
const { blockhash } = await connection.getLatestBlockhash();
tx.recentBlockhash = blockhash;
tx.feePayer = payer.publicKey;
tx.sign(payer);

const sig = await connection.sendRawTransaction(tx.serialize());
console.log("Deposit tx:", sig);
```

### What happens on-chain

1. SPL tokens transfer from the payer's associated token account to the pool vault
2. The Groth16 proof is verified on-chain (deposit circuit)
3. The commitment is appended to the on-chain Merkle tree
4. A `DepositEvent` is emitted containing the commitment

The note contents (amount, asset, secret, blinding) are never revealed. Only the commitment appears on-chain.

---

## Circuit Files

Most SDK operations work without any circuit files:

- Note creation (`createNote`)
- Commitment computation (`computeCommitment`)
- Nullifier derivation (`computeNullifier`)
- Merkle tree operations (`MerkleTree`)
- PDA derivation (`derivePoolConfig`, `deriveVault`, etc.)
- Transaction building (`buildDepositTransaction`, etc.)

**Proof generation** (`generateDepositProof`, `generateWithdrawProof`, `generateTransferProof`) requires Groth16 circuit files (`.wasm` + `.zkey`). These are available on request — contact the team or check the **#dev** channel.

The circuits cover three operations:

| Circuit | Purpose |
|---|---|
| `deposit` | Proves a commitment matches a valid note |
| `withdraw` | Proves knowledge of a note in the tree + valid nullifier |
| `transfer` | Proves a valid spend of one note into two new notes |

---

## Next Steps

| Guide | What it covers |
|---|---|
| [Integration Guide](INTEGRATION_GUIDE.md) | Full deposit, withdraw, and transfer flows with error handling |
| [Use Cases](USE_CASES.md) | Real-world integration patterns: AI agent payments, x402, MCP |
| [Agentic Integration](AGENTIC_INTEGRATION.md) | AI-specific payment flows and the MCP server |
| [API Reference](API_REFERENCE.md) | Complete SDK surface: every export, type, and constant |
| [Architecture](ARCHITECTURE.md) | System design, on-chain program structure, crypto internals |
| [Security](SECURITY.md) | Threat model, key management, audit status |
