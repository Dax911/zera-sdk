# ZERA SDK Use Cases

Concrete use cases for private payments with the ZERA shielded pool on Solana.

---

## 1. Private API Payments

Agents paying for data feeds, ML inference, and compute services create usage fingerprints that reveal strategy, priorities, and operational dependencies. With ZERA, the agent deposits USDC once and pays from the shielded pool -- no on-chain observer can determine which APIs the agent uses, how frequently, or what it pays. This eliminates the competitive intelligence leak that transparent x402 or direct on-chain payments create.

```typescript
import {
  createNote, generateDepositProof, buildDepositTransaction,
  hashPubkeyToField, formatPublicInputsForSolana, USDC_MINT,
} from "@zera-labs/sdk";

// Pre-fund the shielded pool for private API payments
const assetHash = await hashPubkeyToField(new PublicKey(USDC_MINT).toBytes());
const note = createNote(50_000_000n, assetHash); // 50 USDC operating budget
const proofResult = await generateDepositProof(note, WASM_PATH, ZKEY_PATH);

const tx = buildDepositTransaction({
  payer: agentWallet.publicKey,
  mint: new PublicKey(USDC_MINT),
  amount: note.amount,
  commitment: proofResult.commitment,
  proof: proofResult.proof,
  publicInputs: formatPublicInputsForSolana(proofResult.publicSignals),
});
await sendAndConfirmTransaction(connection, tx, [agentWallet]);
// Agent now pays for APIs via shielded withdrawals to ephemeral wallets
```

---

## 2. Trading Agent Privacy

DeFi trading agents are prime targets for MEV bots and competitor surveillance. On-chain payment patterns reveal which data sources the agent consumes, when it scales up activity, and which assets it is researching. AI-on-AI MEV warfare means autonomous bots hunt other bots by analyzing their transaction histories. A trading agent whose financial activity is shielded cannot be profiled, front-run, or reverse-engineered from its spending behavior.

```typescript
import {
  generateWithdrawProof, buildWithdrawTransaction,
  hashPubkeyToField, formatPublicInputsForSolana, USDC_MINT,
} from "@zera-labs/sdk";
import { Keypair, PublicKey } from "@solana/web3.js";

// Withdraw to an ephemeral wallet before executing a trade
const ephemeral = Keypair.generate();
const recipientHash = await hashPubkeyToField(ephemeral.publicKey.toBytes());

const proofResult = await generateWithdrawProof(
  tradeNote, tradeNote.leafIndex, tree, recipientHash, WASM_PATH, ZKEY_PATH,
);

const tx = buildWithdrawTransaction({
  payer: agentWallet.publicKey,
  recipient: ephemeral.publicKey,
  mint: new PublicKey(USDC_MINT),
  amount: tradeNote.amount,
  nullifierHash: proofResult.nullifierHash,
  root: tree.root,
  proof: proofResult.proof,
  publicInputs: formatPublicInputsForSolana(proofResult.publicSignals),
});
await sendAndConfirmTransaction(connection, tx, [agentWallet]);
// Execute the trade from the ephemeral wallet -- no link to the agent's identity
```

---

## 3. Research Agent Data Purchasing

A research agent purchasing genomics datasets, patent filings, or clinical trial data creates a trail that reveals which diseases, compounds, or markets are being investigated. Competitors monitoring the agent's wallet can deduce the research thesis months before any public disclosure. Paying from the shielded pool keeps the combination of data sources acquired private.

```typescript
import {
  generateWithdrawProof, buildWithdrawTransaction,
  hashPubkeyToField, formatPublicInputsForSolana, USDC_MINT,
} from "@zera-labs/sdk";

// Pay a data provider privately
const dataProviderAddress = new PublicKey("DataProvider111...");
const recipientHash = await hashPubkeyToField(dataProviderAddress.toBytes());

const proofResult = await generateWithdrawProof(
  dataNote, dataNote.leafIndex, tree, recipientHash, WASM_PATH, ZKEY_PATH,
);

const tx = buildWithdrawTransaction({
  payer: agentWallet.publicKey,
  recipient: dataProviderAddress,
  mint: new PublicKey(USDC_MINT),
  amount: dataNote.amount,
  nullifierHash: proofResult.nullifierHash,
  root: tree.root,
  proof: proofResult.proof,
  publicInputs: formatPublicInputsForSolana(proofResult.publicSignals),
});
await sendAndConfirmTransaction(connection, tx, [agentWallet]);
```

---

## 4. Personal AI Assistant Privacy

A personal AI assistant that books flights, orders food, pays subscriptions, and tips creators builds a comprehensive profile of its user's life. On a public blockchain, this profile is available to anyone with a block explorer. Shielded payments ensure that purchases are unlinkable -- no unified behavioral profile can be constructed from on-chain data.

```typescript
import {
  createNote, generateDepositProof, buildDepositTransaction,
  hashPubkeyToField, formatPublicInputsForSolana, USDC_MINT,
} from "@zera-labs/sdk";

// User tops up their assistant's shielded balance
const assetHash = await hashPubkeyToField(new PublicKey(USDC_MINT).toBytes());
const note = createNote(200_000_000n, assetHash); // 200 USDC monthly budget
const proofResult = await generateDepositProof(note, WASM_PATH, ZKEY_PATH);

const tx = buildDepositTransaction({
  payer: userWallet.publicKey,
  mint: new PublicKey(USDC_MINT),
  amount: note.amount,
  commitment: proofResult.commitment,
  proof: proofResult.proof,
  publicInputs: formatPublicInputsForSolana(proofResult.publicSignals),
});
await sendAndConfirmTransaction(connection, tx, [userWallet]);
// All subsequent purchases by the assistant happen via shielded withdrawals
```

---

## 5. Agent-to-Agent Payments in Multi-Agent Swarms

In multi-agent systems (ElizaOS, AutoGPT swarms), agents hire other agents for specialized tasks -- data scraping, code review, content generation. Each inter-agent payment on a public ledger reveals the system's internal architecture, decision hierarchy, and resource allocation. ZERA's in-pool transfers keep these payments invisible: external observers see nullifiers and commitments but cannot reconstruct the agent graph or payment flows.

```typescript
import {
  createNote, generateTransferProof, buildTransferTransaction,
  formatPublicInputsForSolana, MerkleTree, TreeStateClient, USDC_MINT,
} from "@zera-labs/sdk";

// Agent A pays Agent B for a completed task (in-pool, zero trace)
const paymentToB = createNote(2_000_000n, inputNote.asset); // 2 USDC
const changeToA = createNote(8_000_000n, inputNote.asset);  // 8 USDC change

const proofResult = await generateTransferProof(
  inputNote, inputNote.leafIndex, tree,
  paymentToB, changeToA, WASM_PATH, ZKEY_PATH,
);

const tx = buildTransferTransaction({
  payer: agentAWallet.publicKey,
  mint: new PublicKey(USDC_MINT),
  nullifierHash: proofResult.nullifierHash,
  outputCommitment1: proofResult.outputCommitment1,
  outputCommitment2: proofResult.outputCommitment2,
  root: tree.root,
  proof: proofResult.proof,
  publicInputs: formatPublicInputsForSolana(proofResult.publicSignals),
});
await sendAndConfirmTransaction(connection, tx, [agentAWallet]);

// Deliver paymentToB's secret + blinding to Agent B over encrypted channel
await deliverNote(agentBEndpoint, paymentToB);
```

---

## 6. Anonymous Donations

Organizations and individuals can receive donations without donors being identifiable on-chain. The recipient receives USDC from the shielded pool -- the ZK proof guarantees the funds are valid, but the donor's identity, prior transaction history, and funding source are cryptographically hidden. This protects donors to politically sensitive causes, whistleblower funds, or humanitarian organizations operating in hostile jurisdictions.

```typescript
import {
  generateWithdrawProof, buildWithdrawTransaction,
  hashPubkeyToField, formatPublicInputsForSolana, USDC_MINT,
} from "@zera-labs/sdk";

// Anonymous donation to a registered cause
const effAddress = new PublicKey("EFF1111111111111111111111111111111111111111");
const recipientHash = await hashPubkeyToField(effAddress.toBytes());

const proofResult = await generateWithdrawProof(
  donationNote, donationNote.leafIndex, tree, recipientHash, WASM_PATH, ZKEY_PATH,
);

const tx = buildWithdrawTransaction({
  payer: donorWallet.publicKey,
  recipient: effAddress,
  mint: new PublicKey(USDC_MINT),
  amount: donationNote.amount, // 25 USDC
  nullifierHash: proofResult.nullifierHash,
  root: tree.root,
  proof: proofResult.proof,
  publicInputs: formatPublicInputsForSolana(proofResult.publicSignals),
});
await sendAndConfirmTransaction(connection, tx, [donorWallet]);
// EFF receives 25 USDC -- no on-chain link to the donor
```

---

## 7. Private Micropayments and Tipping

Content platforms powered by AI agents generate thousands of small payments -- tips to creators, pay-per-article fees, micropayment-funded API calls. Public micropayment patterns reveal the agent's content preferences, which creators it values, and by extension its operator's interests. With ZERA, an agent deposits a lump sum into the pool and makes individual tips as shielded withdrawals or in-pool transfers. The tipping pattern is invisible.

```typescript
import {
  createNote, generateTransferProof, buildTransferTransaction,
  formatPublicInputsForSolana, USDC_MINT,
} from "@zera-labs/sdk";

// Tip a content creator 0.10 USDC (in-pool transfer)
const tipNote = createNote(100_000n, inputNote.asset);      // 0.10 USDC tip
const changeNote = createNote(9_900_000n, inputNote.asset);  // 9.90 USDC change

const proofResult = await generateTransferProof(
  inputNote, inputNote.leafIndex, tree,
  tipNote, changeNote, WASM_PATH, ZKEY_PATH,
);

const tx = buildTransferTransaction({
  payer: agentWallet.publicKey,
  mint: new PublicKey(USDC_MINT),
  nullifierHash: proofResult.nullifierHash,
  outputCommitment1: proofResult.outputCommitment1,
  outputCommitment2: proofResult.outputCommitment2,
  root: tree.root,
  proof: proofResult.proof,
  publicInputs: formatPublicInputsForSolana(proofResult.publicSignals),
});
await sendAndConfirmTransaction(connection, tx, [agentWallet]);

// Deliver tip note to creator's agent
await deliverNote(creatorEndpoint, tipNote);
```

---

## 8. x402 Shielded Payments

The x402 protocol (Coinbase) enables HTTP-native micropayments -- agents pay for API access by responding to `402 Payment Required` with on-chain USDC transfers. The privacy problem: every x402 payment is transparent, linking the agent's identity to every service it consumes. ZERA sits underneath x402 as a privacy layer: the agent withdraws to an ephemeral wallet from the shielded pool, then makes a standard x402 payment. No protocol changes to x402 are needed. The API provider sees an ordinary payment from an unlinkable address.

```typescript
import { Keypair } from "@solana/web3.js";
import {
  generateWithdrawProof, buildWithdrawTransaction,
  hashPubkeyToField, formatPublicInputsForSolana, USDC_MINT,
} from "@zera-labs/sdk";

async function shieldedX402Payment(paymentAmount: bigint, apiRecipient: string) {
  // 1. Ephemeral wallet -- used once, then discarded
  const ephemeral = Keypair.generate();

  // 2. Withdraw from shielded pool to ephemeral
  const recipientHash = await hashPubkeyToField(ephemeral.publicKey.toBytes());
  const note = await noteStore.selectForAmount(paymentAmount);
  const proofResult = await generateWithdrawProof(
    note, note.leafIndex, tree, recipientHash, WASM_PATH, ZKEY_PATH,
  );
  const tx = buildWithdrawTransaction({
    payer: agentWallet.publicKey,
    recipient: ephemeral.publicKey,
    mint: new PublicKey(USDC_MINT),
    amount: note.amount,
    nullifierHash: proofResult.nullifierHash,
    root: tree.root,
    proof: proofResult.proof,
    publicInputs: formatPublicInputsForSolana(proofResult.publicSignals),
  });
  await sendAndConfirmTransaction(connection, tx, [agentWallet]);

  // 3. Standard x402 payment from ephemeral (no link to agent identity)
  return signX402Payment(ephemeral, paymentAmount, apiRecipient);
}
```

---

## 9. MCP Private Payment Tools

The Model Context Protocol (MCP) is the industry standard for connecting AI models to external tools. A ZERA MCP server gives any MCP-compatible AI (Claude, ChatGPT, Gemini) the ability to make private payments through natural language. The user says "pay $5 privately" and the AI calls `zera_transfer` or `zera_withdraw` behind the scenes. No blockchain knowledge required from the end user. The shielded pool handles all privacy guarantees transparently.

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  createNote, generateDepositProof, buildDepositTransaction,
  hashPubkeyToField, computeCommitment, computeNullifier,
  formatPublicInputsForSolana, USDC_MINT,
} from "@zera-labs/sdk";

const server = new McpServer({ name: "zera-protocol", version: "1.0.0" });

server.tool(
  "zera_deposit",
  "Deposit USDC into the ZERA shielded pool",
  { amount: z.number().positive() },
  async ({ amount }) => {
    const amountBase = BigInt(Math.round(amount * 1_000_000));
    const assetHash = await hashPubkeyToField(new PublicKey(USDC_MINT).toBytes());
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

    return {
      content: [{ type: "text", text: `Deposited ${amount} USDC into shielded pool. Tx: ${txSig}` }],
    };
  }
);
// zera_transfer, zera_withdraw, zera_balance tools follow the same pattern
```
