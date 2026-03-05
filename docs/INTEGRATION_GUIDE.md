# ZERA Confidential SDK -- Integration Guide

A step-by-step guide for third-party developers integrating ZERA's privacy features into wallets, dApps, AI agents, and payment backends.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Initial Setup](#initial-setup)
4. [Deposit Flow](#deposit-flow)
5. [Withdrawal Flow](#withdrawal-flow)
6. [Shielded Transfer Flow](#shielded-transfer-flow)
7. [Relayed (Gasless) Withdrawal](#relayed-gasless-withdrawal)
8. [Private Cash Vouchers](#private-cash-vouchers)
9. [Agentic Payment Flows](#agentic-payment-flows)
10. [Rebuilding the Merkle Tree](#rebuilding-the-merkle-tree)
11. [PDA Derivation Reference](#pda-derivation-reference)
12. [Error Handling](#error-handling)
13. [Production Checklist](#production-checklist)

---

## Prerequisites

- **Node.js** >= 18
- **Solana CLI** >= 1.18 (for key management and RPC)
- **Circuit files**: Pre-compiled `.wasm` and `.zkey` files for each circuit (deposit, withdraw, transfer, relayed_withdraw). Contact the ZERA team or build from the Circom sources.
- **Anchor IDL**: The `zera_pool.json` IDL file for the Shielded Pool program.

## Installation

```bash
npm install @zera-labs/sdk @solana/web3.js @coral-xyz/anchor @solana/spl-token
```

The SDK has the following peer/transitive dependencies:
- `circomlibjs` ^0.1.7 -- Poseidon hashing (auto-installed)
- `snarkjs` ^0.7.5 -- Groth16 proof generation (auto-installed)
- `@noble/hashes` ^1.7.1 -- Keccak-256 for vouchers (auto-installed)

## Initial Setup

### Connecting to Solana

```typescript
import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor";

// Connect to your preferred RPC endpoint
const connection = new Connection("https://api.mainnet-beta.solana.com", "confirmed");

// Load your wallet (for signing transactions)
const wallet = new Wallet(Keypair.fromSecretKey(/* your secret key bytes */));
const provider = new AnchorProvider(connection, wallet, {
  commitment: "confirmed",
});

// Load the Shielded Pool program
import idl from "./idl/zera_pool.json";
const PROGRAM_ID = new PublicKey("B83jSQx1CT1hPRBupinaJaEkCjrfeo6Ktncu31q3ZNeX");
const program = new Program(idl as any, provider);
```

### Deriving PDAs

```typescript
const [poolConfig] = PublicKey.findProgramAddressSync(
  [Buffer.from("pool_config")], PROGRAM_ID
);
const [merkleTree] = PublicKey.findProgramAddressSync(
  [Buffer.from("merkle_tree")], PROGRAM_ID
);
const [vault] = PublicKey.findProgramAddressSync(
  [Buffer.from("vault")], PROGRAM_ID
);
const [feeVault] = PublicKey.findProgramAddressSync(
  [Buffer.from("fee_vault")], PROGRAM_ID
);
```

### Computing the Asset Hash

Every note includes an `asset` field that identifies the token mint. Compute it once and reuse:

```typescript
import { hashPubkeyToField } from "@zera-labs/sdk";

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const assetHash = await hashPubkeyToField(USDC_MINT.toBytes());
```

### Checking Pool State

Always check pool state before submitting transactions:

```typescript
const config = await program.account.poolConfig.fetch(poolConfig);

if (config.paused) {
  throw new Error("Pool is currently paused");
}

console.log("Fee BPS:", config.feeBps);
console.log("Burn BPS:", config.burnBps);
console.log("Total deposited:", config.totalDeposited.toString());
```

---

## Deposit Flow

A deposit transfers tokens from the user's wallet into the shielded pool and creates a private note.

### Step 1: Create a Note

```typescript
import { createNote, computeCommitment, fieldToBytes32BE } from "@zera-labs/sdk";

const amount = 1_000_000n; // 1 USDC (6 decimals)
const note = createNote(amount, assetHash);
const commitment = await computeCommitment(note);
```

### Step 2: Generate the Deposit Proof

```typescript
import { generateDepositProof } from "@zera-labs/sdk";

const { proof, commitment: proofCommitment } = await generateDepositProof(
  note,
  "./circuits/deposit/deposit.wasm",
  "./circuits/deposit/deposit_final.zkey",
);
```

### Step 3: Build and Send the Transaction

```typescript
import { BN } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { ComputeBudgetProgram, SystemProgram } from "@solana/web3.js";

const userTokenAccount = getAssociatedTokenAddressSync(USDC_MINT, wallet.publicKey);
const commitmentBytes = Array.from(fieldToBytes32BE(commitment));

const tx = await program.methods
  .deposit({
    amount: new BN(amount.toString()),
    outputCommitment: commitmentBytes,
    proof: {
      proofA: Array.from(proof.proofA),
      proofB: Array.from(proof.proofB),
      proofC: Array.from(proof.proofC),
    },
    encryptedNote: Buffer.from([]),
    solForBurn: new BN(0),       // Set > 0 if burn_bps > 0
    minimumZeraOut: new BN(0),   // Slippage protection for burn
  })
  .accounts({
    merkleTree,
    poolConfig,
    vault,
    tokenMint: USDC_MINT,
    userTokenAccount,
    depositor: wallet.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  })
  .preInstructions([
    ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }),
  ])
  .rpc();

console.log("Deposit tx:", tx);
```

### Step 4: Store the Note

After a successful deposit, store the note securely. You will need it to withdraw or transfer later.

```typescript
const storedNote = {
  ...note,
  commitment,
  nullifier: await computeNullifier(note.secret, commitment),
  leafIndex: /* read from DepositEvent or track locally */,
};

// Store securely -- NEVER expose the secret
saveNoteToSecureStorage(storedNote);
```

**Critical:** The `secret` and `blinding` values must be stored securely. If they are lost, the deposited funds cannot be recovered. If they are leaked, anyone can spend the note.

---

## Withdrawal Flow

A withdrawal spends a previously deposited note and transfers tokens to a recipient.

### Step 1: Rebuild the Merkle Tree

You must have a local Merkle tree that matches the on-chain state. See [Rebuilding the Merkle Tree](#rebuilding-the-merkle-tree) for details.

```typescript
import { MerkleTree } from "@zera-labs/sdk";

// Option A: Rebuild from DepositEvent / TransferEvent logs
const tree = await MerkleTree.create(24);
for (const event of depositEvents) {
  await tree.insert(event.commitment);
}
```

### Step 2: Compute the Recipient Hash

```typescript
const recipientPubkey = new PublicKey("RECIPIENT_ADDRESS_HERE");
const recipientHash = await hashPubkeyToField(recipientPubkey.toBytes());
```

### Step 3: Generate the Withdrawal Proof

```typescript
import { generateWithdrawProof } from "@zera-labs/sdk";

const { proof, nullifierHash } = await generateWithdrawProof(
  storedNote,             // The note to spend
  storedNote.leafIndex,   // Its position in the tree
  tree,                   // Local Merkle tree
  recipientHash,          // Recipient's pubkey as field element
  "./circuits/withdraw/withdraw.wasm",
  "./circuits/withdraw/withdraw_final.zkey",
);
```

### Step 4: Build and Send the Transaction

```typescript
const nullifierHashBytes = Array.from(fieldToBytes32BE(nullifierHash));
const [nullifierPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("nullifier"), Buffer.from(nullifierHashBytes)],
  PROGRAM_ID,
);

const recipientTokenAccount = getAssociatedTokenAddressSync(
  USDC_MINT, recipientPubkey,
);

const tx = await program.methods
  .withdraw({
    amount: new BN(storedNote.amount.toString()),
    nullifierHash: nullifierHashBytes,
    root: Array.from(fieldToBytes32BE(tree.root)),
    recipientHash: Array.from(fieldToBytes32BE(recipientHash)),
    proof: {
      proofA: Array.from(proof.proofA),
      proofB: Array.from(proof.proofB),
      proofC: Array.from(proof.proofC),
    },
  })
  .accounts({
    merkleTree,
    poolConfig,
    vault,
    feeVault,
    tokenMint: USDC_MINT,
    nullifierPda,
    recipientTokenAccount,
    withdrawer: wallet.publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  })
  .preInstructions([
    ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }),
  ])
  .rpc();

console.log("Withdraw tx:", tx);
```

### Step 5: Mark the Note as Spent

```typescript
markNoteAsSpent(storedNote.nullifier);
```

**Note on protocol fees:** If `fee_bps > 0`, the recipient receives `amount - (amount * fee_bps / 10000)`. The fee is sent to the `fee_vault` PDA. Your UI should display the expected net amount to the user.

---

## Shielded Transfer Flow

A shielded transfer spends one note and creates two new notes (recipient + change) without moving tokens in or out of the pool.

### Step 1: Create Output Notes

```typescript
const sendAmount = 700_000n; // 0.7 USDC to recipient
const changeAmount = storedNote.amount - sendAmount; // 0.3 USDC change

const recipientNote = createNote(sendAmount, assetHash);
const changeNote = createNote(changeAmount, assetHash);
```

**Important:** `sendAmount + changeAmount` must exactly equal the input note's amount. The circuit enforces this constraint.

### Step 2: Generate the Transfer Proof

```typescript
import { generateTransferProof } from "@zera-labs/sdk";

const { proof, nullifierHash, outputCommitment1, outputCommitment2 } =
  await generateTransferProof(
    storedNote,             // Input note to spend
    storedNote.leafIndex,   // Its tree position
    tree,                   // Local Merkle tree
    recipientNote,          // Output note 1 (recipient)
    changeNote,             // Output note 2 (change)
    "./circuits/transfer/transfer.wasm",
    "./circuits/transfer/transfer_final.zkey",
  );
```

### Step 3: Send the Transaction

```typescript
const nullifierHashBytes = Array.from(fieldToBytes32BE(nullifierHash));
const [nullifierPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("nullifier"), Buffer.from(nullifierHashBytes)],
  PROGRAM_ID,
);

const tx = await program.methods
  .shieldedTransfer({
    nullifierHash: nullifierHashBytes,
    root: Array.from(fieldToBytes32BE(tree.root)),
    outputCommitment1: Array.from(fieldToBytes32BE(outputCommitment1)),
    outputCommitment2: Array.from(fieldToBytes32BE(outputCommitment2)),
    proof: {
      proofA: Array.from(proof.proofA),
      proofB: Array.from(proof.proofB),
      proofC: Array.from(proof.proofC),
    },
    encryptedNote1: Buffer.from([]),
    encryptedNote2: Buffer.from([]),
  })
  .accounts({
    merkleTree,
    poolConfig,
    nullifierPda,
    sender: wallet.publicKey,
    systemProgram: SystemProgram.programId,
  })
  .preInstructions([
    ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }),
  ])
  .rpc();
```

### Step 4: Update Local State

```typescript
// Update local Merkle tree
const leafIndex1 = await tree.insert(outputCommitment1);
const leafIndex2 = await tree.insert(outputCommitment2);

// Store the change note for yourself
const storedChange = {
  ...changeNote,
  commitment: outputCommitment2,
  nullifier: await computeNullifier(changeNote.secret, outputCommitment2),
  leafIndex: leafIndex2,
};
saveNoteToSecureStorage(storedChange);

// Send the recipient note secret out-of-band
// The recipient needs: recipientNote.secret, recipientNote.blinding,
// recipientNote.amount, recipientNote.asset, recipientNote.memo, and leafIndex1
```

---

## Relayed (Gasless) Withdrawal

A relayed withdrawal allows a third-party operator to submit the transaction and pay gas fees. The user commits to an operator fee inside the ZK proof, preventing fee manipulation.

### User Side: Generate the Proof

```typescript
const operatorFee = 10_000n; // 0.01 USDC fee for the operator

// Use the relayed_withdraw circuit
const input = {
  root: tree.root.toString(),
  nullifierHash: nullifierHash.toString(),
  recipient: recipientHash.toString(),
  amount: storedNote.amount.toString(),
  asset: assetHash.toString(),
  fee: operatorFee.toString(),
  secret: storedNote.secret.toString(),
  blinding: storedNote.blinding.toString(),
  memo: storedNote.memo.map((m) => m.toString()),
  pathElements: merkleProof.pathElements.map((e) => e.toString()),
  pathIndices: merkleProof.pathIndices.map((i) => i.toString()),
};

const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  input,
  "./circuits/relayed_withdraw/relayed_withdraw.wasm",
  "./circuits/relayed_withdraw/relayed_withdraw_final.zkey",
);

const formattedProof = formatProofForSolana(proof);
```

The user sends the formatted proof, nullifier hash, root, recipient hash, amount, and fee to the operator.

### Operator Side: Submit the Transaction

```typescript
const tx = await program.methods
  .relayedWithdraw({
    amount: new BN(amount.toString()),
    fee: new BN(operatorFee.toString()),
    nullifierHash: nullifierHashBytes,
    root: rootBytes,
    recipientHash: recipientHashBytes,
    proof: {
      proofA: Array.from(formattedProof.proofA),
      proofB: Array.from(formattedProof.proofB),
      proofC: Array.from(formattedProof.proofC),
    },
  })
  .accounts({
    merkleTree,
    poolConfig,
    vault,
    feeVault,
    tokenMint: USDC_MINT,
    nullifierPda,
    recipientTokenAccount,
    operator: operatorWallet.publicKey,
    operatorTokenAccount: operatorUsdcAta,
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  })
  .preInstructions([
    ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }),
  ])
  .rpc();
```

**Distribution:** The vault sends:
- `amount - fee - protocolFee` to the recipient
- `fee` to the operator
- `protocolFee` to the fee vault

---

## Private Cash Vouchers

The Private Cash system provides a simpler privacy mechanism using Keccak-256 commitments instead of ZK proofs.

### Creating a Voucher

```typescript
import {
  generateRandomHex,
  computeKeccakCommitment,
  computeRecipientHash,
} from "@zera-labs/sdk";

// 1. Generate random secret and salt
const secret = generateRandomHex();
const salt = generateRandomHex();

// 2. Compute the commitment
const commitment = computeKeccakCommitment(secret);

// 3. Optionally bind to a recipient
const recipientHash = computeRecipientHash(recipientPubkey, salt);

// 4. Submit the create_voucher transaction (using the Private Cash program)
// ... (program-specific instruction building)

// 5. Store the voucher
const voucher = {
  voucherId: commitment,
  amount: 1_000_000,
  secret,
  salt,
  recipient: recipientPubkey,
  txSignature: tx,
  createdAt: new Date().toISOString(),
};
```

### Redeeming a Voucher

The recipient reveals the secret to claim the funds:

```typescript
// The recipient receives the voucher data out-of-band
// They submit a redeem transaction revealing the secret
// The program verifies keccak256(secret) matches the stored commitment
```

---

## Agentic Payment Flows

ZERA is designed for AI agent payment scenarios where an autonomous agent needs to make or receive private payments.

### Agent Receiving Private Payments

```typescript
// Agent creates notes and shares deposit addresses
const note = createNote(paymentAmount, assetHash);
const commitment = await computeCommitment(note);

// Agent generates the deposit proof
const { proof } = await generateDepositProof(note, wasmPath, zkeyPath);

// Agent submits the deposit transaction
// (using the agent's wallet to sign)

// Agent stores the note for later spending
```

### Agent Making Private Payments

```typescript
// Agent has a stored note from a previous deposit or transfer
// Agent creates a withdrawal to pay a service provider

const recipientHash = await hashPubkeyToField(serviceProvider.toBytes());
const { proof, nullifierHash } = await generateWithdrawProof(
  agentNote, leafIndex, tree, recipientHash,
  wasmPath, zkeyPath,
);

// Agent submits the withdrawal transaction
```

### Agent-to-Agent Shielded Transfer

```typescript
// Agent A wants to pay Agent B privately
// Agent A performs a shielded transfer, creating two notes:
// - One for Agent B (the payment)
// - One for Agent A (the change)

// Agent A sends the recipient note secret to Agent B
// via a secure channel (encrypted messaging, etc.)
```

### Using Vouchers for Agent Payments

For simpler one-time payments, agents can use the Private Cash voucher system:

```typescript
// Agent creates a voucher and shares the secret with the payee
const secret = generateRandomHex();
const commitment = computeKeccakCommitment(secret);
// ... create voucher on-chain ...

// Share the secret with the recipient agent
sendToRecipientAgent({ secret, salt, amount });

// Recipient agent redeems the voucher
```

---

## Rebuilding the Merkle Tree

The client-side Merkle tree must match the on-chain state to generate valid proofs. There are two approaches:

### Approach A: Replay from Events

Parse `DepositEvent` and `TransferEvent` logs from the program and replay all leaf insertions in order.

```typescript
import { MerkleTree, bytes32BEToField } from "@zera-labs/sdk";

const tree = await MerkleTree.create(24);

// Fetch all program events (using Anchor's event parser or raw log parsing)
const events = await fetchAllPoolEvents(connection, PROGRAM_ID);

// Sort by slot, then by order within each transaction
events.sort((a, b) => a.slot - b.slot || a.logIndex - b.logIndex);

for (const event of events) {
  if (event.name === "DepositEvent") {
    const commitment = bytes32BEToField(new Uint8Array(event.data.commitment));
    await tree.insert(commitment);
  } else if (event.name === "TransferEvent") {
    const c1 = bytes32BEToField(new Uint8Array(event.data.commitment1));
    const c2 = bytes32BEToField(new Uint8Array(event.data.commitment2));
    await tree.insert(c1);
    await tree.insert(c2);
  }
}

// Verify against on-chain root
const treeState = await program.account.merkleTreeState.fetch(merkleTree);
const onChainRoot = bytes32BEToField(new Uint8Array(treeState.root));
if (tree.root !== onChainRoot) {
  throw new Error("Merkle tree mismatch! Event replay is out of sync.");
}
```

### Approach B: Read On-Chain State

Read the `MerkleTreeState` account directly for the root and leaf count, then use events only for the leaves you need proofs for. This is lighter but requires careful tracking.

### Verification

Always verify your local tree root against the on-chain root after rebuilding:

```typescript
const treeState = await program.account.merkleTreeState.fetch(merkleTree);
const onChainRoot = bytes32BEToField(new Uint8Array(treeState.root));
assert(tree.root === onChainRoot, "Root mismatch");
assert(tree.leafCount === treeState.leafCount.toNumber(), "Leaf count mismatch");
```

---

## PDA Derivation Reference

All PDAs are derived from the Shielded Pool program ID `B83jSQx1CT1hPRBupinaJaEkCjrfeo6Ktncu31q3ZNeX`.

| PDA | Seeds | Description |
|---|---|---|
| Pool Config | `["pool_config"]` | Stores pool settings, stats, authority |
| Merkle Tree | `["merkle_tree"]` | Zero-copy account with tree state |
| Vault | `["vault"]` | SPL token account holding deposited tokens |
| Fee Vault | `["fee_vault"]` | SPL token account for protocol fees |
| Nullifier | `["nullifier", nullifier_hash_bytes]` | 8-byte PDA; existence = note is spent |

```typescript
import { PublicKey } from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("B83jSQx1CT1hPRBupinaJaEkCjrfeo6Ktncu31q3ZNeX");

function derivePoolConfig(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("pool_config")], PROGRAM_ID
  )[0];
}

function deriveMerkleTree(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("merkle_tree")], PROGRAM_ID
  )[0];
}

function deriveVault(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault")], PROGRAM_ID
  )[0];
}

function deriveFeeVault(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("fee_vault")], PROGRAM_ID
  )[0];
}

function deriveNullifierPda(nullifierHashBytes: Uint8Array): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("nullifier"), nullifierHashBytes], PROGRAM_ID
  )[0];
}
```

---

## Error Handling

### On-Chain Errors

The Shielded Pool program returns these error codes:

| Error | Code | Cause | Resolution |
|---|---|---|---|
| `TreeFull` | 6000 | Merkle tree capacity (16M) reached | Deploy a new pool |
| `HashError` | 6001 | Poseidon computation failed | Verify input field elements are valid |
| `AlreadySpent` | 6002 | Nullifier PDA already exists | Note has been spent; do not retry |
| `InvalidRoot` | 6003 | Proof root not in history buffer | Regenerate proof with fresh tree state |
| `ProofVerificationFailed` | 6004 | Groth16 verification failed | Check proof generation inputs and circuit files |
| `InvalidProof` | 6005 | Malformed proof data | Verify proof formatting (pi_a negation, pi_b ordering) |
| `AmountMismatch` | 6006 | Proof amount differs from instruction | Ensure proof and instruction use the same amount |
| `AssetMismatch` | 6007 | Wrong token mint | Verify the asset hash matches the pool's token |
| `RecipientMismatch` | 6009 | Recipient hash does not match account | Verify `hashPubkeyToField` output matches the recipient account's owner |
| `Paused` | 6011 | Pool is paused by admin | Wait for pool to be unpaused |
| `ZeroDepositAmount` | 6016 | Deposit amount is 0 | Use a positive amount |
| `FeeTooHigh` | 6008 | Fee exceeds withdrawal amount | Reduce operator fee |

### Client-Side Error Handling

```typescript
try {
  const tx = await program.methods.deposit(args).accounts(accounts).rpc();
} catch (error) {
  if (error.message?.includes("AlreadySpent")) {
    // Note was already spent -- remove from local storage
    markNoteAsSpent(note.nullifier);
  } else if (error.message?.includes("InvalidRoot")) {
    // Tree has advanced beyond our proof's root
    // Rebuild the tree and regenerate the proof
    await rebuildMerkleTree();
    // Retry the operation
  } else if (error.message?.includes("Paused")) {
    // Pool is paused -- inform the user
    showError("The privacy pool is temporarily paused.");
  } else {
    throw error;
  }
}
```

### Common Pitfalls

1. **Proof generated with stale tree**: If more than 100 deposits occur between proof generation and submission, the proof's root falls out of the history buffer. Always regenerate proofs promptly.

2. **Wrong field prime for pi_a negation**: The y-coordinate of `pi_a` must be negated using the BN254 *base field* prime (Fp = `21888...8583`), not the scalar field prime (Fr = `21888...5617`). The SDK's `formatProofForSolana` handles this correctly.

3. **Public input ordering**: Public inputs must match the circuit's declaration order exactly. The order is defined in each circuit's `main` component.

4. **Endianness**: All field elements are serialized as 32-byte big-endian arrays for on-chain consumption. The SDK functions handle this, but be careful if building instructions manually.

5. **Compute budget**: All ZK verification instructions require a compute budget of at least 500,000 CU. Always include `ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 })` as a pre-instruction.

---

## Production Checklist

Before deploying to production:

- [ ] **Circuit files**: Use `.zkey` files from a multi-party computation (MPC) trusted setup ceremony, not development keys
- [ ] **Note storage**: Encrypt notes at rest using a user-provided password or hardware-derived key
- [ ] **Encrypted notes**: Implement on-chain encrypted note emission for transfer recipients to discover their notes
- [ ] **Merkle tree sync**: Implement robust event indexing to keep the local tree in sync
- [ ] **Error recovery**: Handle all on-chain error codes gracefully
- [ ] **Compute budget**: Set appropriate CU limits on all ZK transactions
- [ ] **RPC reliability**: Use a dedicated RPC provider with websocket support for event streaming
- [ ] **Key management**: Never expose note secrets in logs, error messages, or analytics
- [ ] **Audit**: Have circuits, proof formatting, and smart contracts audited by a ZK-specialized firm
