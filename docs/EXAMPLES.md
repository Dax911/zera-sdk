# ZERA Confidential SDK -- Examples

Complete, runnable code examples for every major operation. Each example assumes the setup described in the [Integration Guide](./INTEGRATION_GUIDE.md).

## Table of Contents

1. [Common Setup](#common-setup)
2. [Example 1: Basic Deposit](#example-1-basic-deposit)
3. [Example 2: Private Withdrawal](#example-2-private-withdrawal)
4. [Example 3: Shielded Transfer (Split Payment)](#example-3-shielded-transfer-split-payment)
5. [Example 4: Relayed Withdrawal (Gasless)](#example-4-relayed-withdrawal-gasless)
6. [Example 5: Rebuilding Merkle Tree from On-Chain Events](#example-5-rebuilding-merkle-tree-from-on-chain-events)
7. [Example 6: AI Agent Payment Flow](#example-6-ai-agent-payment-flow)

---

## Common Setup

All examples share this initialization code:

```typescript
import { Connection, PublicKey, Keypair, SystemProgram, ComputeBudgetProgram } from "@solana/web3.js";
import { AnchorProvider, Program, BN, Wallet } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import {
  createNote,
  computeCommitment,
  computeNullifier,
  hashPubkeyToField,
  MerkleTree,
  generateDepositProof,
  generateWithdrawProof,
  generateTransferProof,
  formatProofForSolana,
  fieldToBytes32BE,
  bytes32BEToField,
  TREE_HEIGHT,
} from "@zera-labs/sdk";
import * as snarkjs from "snarkjs";

// ── Configuration ──────────────────────────────────────────────────────
const RPC_URL = "https://api.mainnet-beta.solana.com";
const PROGRAM_ID = new PublicKey("B83jSQx1CT1hPRBupinaJaEkCjrfeo6Ktncu31q3ZNeX");
const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");

// Circuit file paths (adjust to your deployment)
const CIRCUITS = {
  deposit: {
    wasm: "./circuits/deposit/deposit.wasm",
    zkey: "./circuits/deposit/deposit_final.zkey",
  },
  withdraw: {
    wasm: "./circuits/withdraw/withdraw.wasm",
    zkey: "./circuits/withdraw/withdraw_final.zkey",
  },
  transfer: {
    wasm: "./circuits/transfer/transfer.wasm",
    zkey: "./circuits/transfer/transfer_final.zkey",
  },
  relayedWithdraw: {
    wasm: "./circuits/relayed_withdraw/relayed_withdraw.wasm",
    zkey: "./circuits/relayed_withdraw/relayed_withdraw_final.zkey",
  },
};

// ── Provider Setup ─────────────────────────────────────────────────────
const connection = new Connection(RPC_URL, "confirmed");
const wallet = new Wallet(Keypair.fromSecretKey(/* your key bytes */));
const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });

import idl from "./idl/zera_pool.json";
const program = new Program(idl as any, provider);

// ── PDA Derivation ─────────────────────────────────────────────────────
const [poolConfig] = PublicKey.findProgramAddressSync([Buffer.from("pool_config")], PROGRAM_ID);
const [merkleTree] = PublicKey.findProgramAddressSync([Buffer.from("merkle_tree")], PROGRAM_ID);
const [vault] = PublicKey.findProgramAddressSync([Buffer.from("vault")], PROGRAM_ID);
const [feeVault] = PublicKey.findProgramAddressSync([Buffer.from("fee_vault")], PROGRAM_ID);

// ── Asset Hash ─────────────────────────────────────────────────────────
let assetHash: bigint;

async function init() {
  assetHash = await hashPubkeyToField(USDC_MINT.toBytes());
  console.log("Asset hash:", assetHash.toString().slice(0, 40) + "...");
}
```

---

## Example 1: Basic Deposit

Deposit 1 USDC into the shielded pool.

```typescript
async function deposit() {
  await init();

  // 1. Create a shielded note
  const amount = 1_000_000n; // 1 USDC
  const note = createNote(amount, assetHash);

  // 2. Compute the Poseidon commitment
  const commitment = await computeCommitment(note);
  console.log("Commitment:", commitment.toString().slice(0, 40) + "...");

  // 3. Generate the Groth16 deposit proof
  const { proof } = await generateDepositProof(
    note,
    CIRCUITS.deposit.wasm,
    CIRCUITS.deposit.zkey,
  );
  console.log("Proof generated");

  // 4. Get the user's USDC token account
  const userTokenAccount = getAssociatedTokenAddressSync(USDC_MINT, wallet.publicKey);

  // 5. Submit the deposit transaction
  const tx = await program.methods
    .deposit({
      amount: new BN(amount.toString()),
      outputCommitment: Array.from(fieldToBytes32BE(commitment)),
      proof: {
        proofA: Array.from(proof.proofA),
        proofB: Array.from(proof.proofB),
        proofC: Array.from(proof.proofC),
      },
      encryptedNote: Buffer.from([]),
      solForBurn: new BN(0),
      minimumZeraOut: new BN(0),
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

  console.log("Deposit successful:", tx);

  // 6. Store the note securely
  const nullifier = await computeNullifier(note.secret, commitment);
  const storedNote = {
    ...note,
    commitment,
    nullifier,
    leafIndex: -1, // Read from DepositEvent or track locally
  };

  console.log("IMPORTANT: Store this note securely!");
  console.log("  secret:", note.secret.toString().slice(0, 20) + "...");
  console.log("  blinding:", note.blinding.toString().slice(0, 20) + "...");

  return storedNote;
}
```

---

## Example 2: Private Withdrawal

Withdraw 1 USDC from the shielded pool to any recipient address.

```typescript
async function withdraw(
  storedNote: any,
  tree: MerkleTree,
  recipientAddress: string,
) {
  await init();

  // 1. Compute the recipient hash
  const recipient = new PublicKey(recipientAddress);
  const recipientHash = await hashPubkeyToField(recipient.toBytes());

  // 2. Generate the withdrawal proof
  const { proof, nullifierHash } = await generateWithdrawProof(
    storedNote,
    storedNote.leafIndex,
    tree,
    recipientHash,
    CIRCUITS.withdraw.wasm,
    CIRCUITS.withdraw.zkey,
  );
  console.log("Withdraw proof generated");

  // 3. Derive the nullifier PDA
  const nullifierHashBytes = fieldToBytes32BE(nullifierHash);
  const [nullifierPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("nullifier"), nullifierHashBytes],
    PROGRAM_ID,
  );

  // 4. Get the recipient's token account
  const recipientTokenAccount = getAssociatedTokenAddressSync(USDC_MINT, recipient);

  // 5. Submit the withdrawal transaction
  const tx = await program.methods
    .withdraw({
      amount: new BN(storedNote.amount.toString()),
      nullifierHash: Array.from(nullifierHashBytes),
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

  console.log("Withdrawal successful:", tx);
  console.log("Note is now spent. Nullifier:", nullifierHash.toString().slice(0, 40) + "...");
}
```

---

## Example 3: Shielded Transfer (Split Payment)

Transfer 2 USDC privately: send 1.5 USDC to a recipient and keep 0.5 USDC as change.

```typescript
async function shieldedTransfer(
  inputNote: any,
  tree: MerkleTree,
) {
  await init();

  // 1. Create two output notes (amounts must sum to input)
  const sendAmount = 1_500_000n;   // 1.5 USDC to recipient
  const changeAmount = 500_000n;   // 0.5 USDC back to self
  // Verify: sendAmount + changeAmount === inputNote.amount (2_000_000n)

  const recipientNote = createNote(sendAmount, assetHash);
  const changeNote = createNote(changeAmount, assetHash);

  // 2. Generate the transfer proof
  const {
    proof,
    nullifierHash,
    outputCommitment1,
    outputCommitment2,
  } = await generateTransferProof(
    inputNote,
    inputNote.leafIndex,
    tree,
    recipientNote,
    changeNote,
    CIRCUITS.transfer.wasm,
    CIRCUITS.transfer.zkey,
  );
  console.log("Transfer proof generated");

  // 3. Derive the nullifier PDA
  const nullifierHashBytes = fieldToBytes32BE(nullifierHash);
  const [nullifierPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("nullifier"), nullifierHashBytes],
    PROGRAM_ID,
  );

  // 4. Submit the transfer transaction
  const tx = await program.methods
    .shieldedTransfer({
      nullifierHash: Array.from(nullifierHashBytes),
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

  console.log("Shielded transfer successful:", tx);

  // 5. Update the local Merkle tree
  const leafIndex1 = await tree.insert(outputCommitment1);
  const leafIndex2 = await tree.insert(outputCommitment2);

  // 6. Store the change note
  const storedChange = {
    ...changeNote,
    commitment: outputCommitment2,
    nullifier: await computeNullifier(changeNote.secret, outputCommitment2),
    leafIndex: leafIndex2,
  };
  console.log("Change note stored at leaf", leafIndex2);

  // 7. Send the recipient note details out-of-band
  const recipientNoteData = {
    amount: recipientNote.amount.toString(),
    secret: recipientNote.secret.toString(),
    blinding: recipientNote.blinding.toString(),
    asset: recipientNote.asset.toString(),
    memo: recipientNote.memo.map((m) => m.toString()),
    leafIndex: leafIndex1,
    commitment: outputCommitment1.toString(),
  };
  console.log("Send this to the recipient (encrypted channel):");
  console.log(JSON.stringify(recipientNoteData, null, 2));

  return { storedChange, recipientNoteData };
}
```

---

## Example 4: Relayed Withdrawal (Gasless)

A user generates a proof and hands it to an operator who submits the transaction and pays gas. The operator receives a fee committed inside the ZK proof.

### User Side

```typescript
async function createRelayedWithdrawRequest(
  storedNote: any,
  tree: MerkleTree,
  recipientAddress: string,
  operatorFee: bigint,
) {
  await init();

  const recipient = new PublicKey(recipientAddress);
  const recipientHash = await hashPubkeyToField(recipient.toBytes());

  // Compute commitment and nullifier
  const commitment = await computeCommitment(storedNote);
  const nullifierHash = await computeNullifier(storedNote.secret, commitment);
  const { pathElements, pathIndices } = await tree.getProof(storedNote.leafIndex);

  // Generate proof using the relayed_withdraw circuit
  const input = {
    root: tree.root.toString(),
    nullifierHash: nullifierHash.toString(),
    recipient: recipientHash.toString(),
    amount: storedNote.amount.toString(),
    asset: assetHash.toString(),
    fee: operatorFee.toString(),
    secret: storedNote.secret.toString(),
    blinding: storedNote.blinding.toString(),
    memo: storedNote.memo.map((m: bigint) => m.toString()),
    pathElements: pathElements.map((e) => e.toString()),
    pathIndices: pathIndices.map((i) => i.toString()),
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    CIRCUITS.relayedWithdraw.wasm,
    CIRCUITS.relayedWithdraw.zkey,
  );

  const formattedProof = formatProofForSolana(proof);

  // Package for the operator
  const request = {
    amount: storedNote.amount.toString(),
    fee: operatorFee.toString(),
    nullifierHash: Array.from(fieldToBytes32BE(nullifierHash)),
    root: Array.from(fieldToBytes32BE(tree.root)),
    recipientHash: Array.from(fieldToBytes32BE(recipientHash)),
    recipientAddress,
    proof: {
      proofA: Array.from(formattedProof.proofA),
      proofB: Array.from(formattedProof.proofB),
      proofC: Array.from(formattedProof.proofC),
    },
  };

  console.log("Relay request created. Send to operator.");
  return request;
}
```

### Operator Side

```typescript
async function submitRelayedWithdraw(request: any) {
  const [nullifierPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("nullifier"), Buffer.from(request.nullifierHash)],
    PROGRAM_ID,
  );

  const recipientPubkey = new PublicKey(request.recipientAddress);
  const recipientTokenAccount = getAssociatedTokenAddressSync(USDC_MINT, recipientPubkey);
  const operatorTokenAccount = getAssociatedTokenAddressSync(USDC_MINT, wallet.publicKey);

  const tx = await program.methods
    .relayedWithdraw({
      amount: new BN(request.amount),
      fee: new BN(request.fee),
      nullifierHash: request.nullifierHash,
      root: request.root,
      recipientHash: request.recipientHash,
      proof: request.proof,
    })
    .accounts({
      merkleTree,
      poolConfig,
      vault,
      feeVault,
      tokenMint: USDC_MINT,
      nullifierPda,
      recipientTokenAccount,
      operator: wallet.publicKey,
      operatorTokenAccount,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }),
    ])
    .rpc();

  console.log("Relayed withdrawal submitted:", tx);
  console.log(`Operator earned ${Number(request.fee) / 1e6} USDC`);
}
```

---

## Example 5: Rebuilding Merkle Tree from On-Chain Events

Reconstruct the full Merkle tree by replaying deposit and transfer events from the program logs.

```typescript
import { BorshCoder, EventParser } from "@coral-xyz/anchor";

async function rebuildMerkleTreeFromEvents(): Promise<MerkleTree> {
  const tree = await MerkleTree.create(TREE_HEIGHT);

  // 1. Fetch all transaction signatures for the program
  const signatures = await connection.getSignaturesForAddress(
    PROGRAM_ID,
    { limit: 1000 },
    "confirmed",
  );

  // Sort oldest first
  signatures.reverse();

  // 2. Set up the Anchor event parser
  const coder = new BorshCoder(idl as any);
  const eventParser = new EventParser(PROGRAM_ID, coder);

  // 3. Process each transaction
  for (const sigInfo of signatures) {
    const tx = await connection.getTransaction(sigInfo.signature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx?.meta?.logMessages) continue;

    // Parse events from the transaction logs
    const events = eventParser.parseLogs(tx.meta.logMessages);

    for (const event of events) {
      if (event.name === "DepositEvent") {
        const commitmentBytes = new Uint8Array(event.data.commitment as number[]);
        const commitment = bytes32BEToField(commitmentBytes);
        await tree.insert(commitment);
        console.log(`Deposit: leaf ${tree.leafCount - 1}`);
      } else if (event.name === "TransferEvent") {
        const c1 = bytes32BEToField(new Uint8Array(event.data.commitment1 as number[]));
        const c2 = bytes32BEToField(new Uint8Array(event.data.commitment2 as number[]));
        await tree.insert(c1);
        await tree.insert(c2);
        console.log(`Transfer: leaves ${tree.leafCount - 2}, ${tree.leafCount - 1}`);
      }
    }
  }

  // 4. Verify against on-chain state
  const treeState = await (program.account as any).merkleTreeState.fetch(
    PublicKey.findProgramAddressSync([Buffer.from("merkle_tree")], PROGRAM_ID)[0],
  );
  const onChainRoot = bytes32BEToField(new Uint8Array(treeState.root as number[]));
  const onChainLeafCount = treeState.leafCount.toNumber();

  console.log("\n--- Verification ---");
  console.log("Local  leaves:", tree.leafCount);
  console.log("OnChain leaves:", onChainLeafCount);
  console.log("Roots match:", tree.root === onChainRoot);

  if (tree.root !== onChainRoot) {
    throw new Error(
      `Merkle tree mismatch! Local root: ${tree.root}, on-chain root: ${onChainRoot}`,
    );
  }

  console.log("Merkle tree rebuilt successfully");
  return tree;
}
```

---

## Example 6: AI Agent Payment Flow

An AI agent receives USDC privately, then pays for a service using shielded transfers.

```typescript
async function aiAgentPaymentFlow() {
  await init();

  // ── Step 1: Agent receives a private deposit ────────────────────────
  console.log("=== Agent receiving 10 USDC deposit ===");

  const depositAmount = 10_000_000n; // 10 USDC
  const agentNote = createNote(depositAmount, assetHash);
  const agentCommitment = await computeCommitment(agentNote);

  const { proof: depositProof } = await generateDepositProof(
    agentNote,
    CIRCUITS.deposit.wasm,
    CIRCUITS.deposit.zkey,
  );

  const agentTokenAccount = getAssociatedTokenAddressSync(USDC_MINT, wallet.publicKey);

  await program.methods
    .deposit({
      amount: new BN(depositAmount.toString()),
      outputCommitment: Array.from(fieldToBytes32BE(agentCommitment)),
      proof: {
        proofA: Array.from(depositProof.proofA),
        proofB: Array.from(depositProof.proofB),
        proofC: Array.from(depositProof.proofC),
      },
      encryptedNote: Buffer.from([]),
      solForBurn: new BN(0),
      minimumZeraOut: new BN(0),
    })
    .accounts({
      merkleTree, poolConfig, vault,
      tokenMint: USDC_MINT,
      userTokenAccount: agentTokenAccount,
      depositor: wallet.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }),
    ])
    .rpc();

  console.log("Agent deposit confirmed");

  // Rebuild tree and get leaf index
  const tree = await rebuildMerkleTreeFromEvents();
  const agentLeafIndex = tree.leafCount - 1;

  const agentStoredNote = {
    ...agentNote,
    commitment: agentCommitment,
    nullifier: await computeNullifier(agentNote.secret, agentCommitment),
    leafIndex: agentLeafIndex,
  };

  // ── Step 2: Agent pays for an API call (3 USDC) ─────────────────────
  console.log("\n=== Agent paying 3 USDC for API access ===");

  const paymentAmount = 3_000_000n;
  const changeAmount = depositAmount - paymentAmount; // 7 USDC

  const paymentNote = createNote(paymentAmount, assetHash);
  const changeNote = createNote(changeAmount, assetHash);

  const transferResult = await generateTransferProof(
    agentStoredNote,
    agentStoredNote.leafIndex,
    tree,
    paymentNote,
    changeNote,
    CIRCUITS.transfer.wasm,
    CIRCUITS.transfer.zkey,
  );

  const nullifierHashBytes = fieldToBytes32BE(transferResult.nullifierHash);
  const [nullifierPda] = PublicKey.findProgramAddressSync(
    [Buffer.from("nullifier"), nullifierHashBytes],
    PROGRAM_ID,
  );

  await program.methods
    .shieldedTransfer({
      nullifierHash: Array.from(nullifierHashBytes),
      root: Array.from(fieldToBytes32BE(tree.root)),
      outputCommitment1: Array.from(fieldToBytes32BE(transferResult.outputCommitment1)),
      outputCommitment2: Array.from(fieldToBytes32BE(transferResult.outputCommitment2)),
      proof: {
        proofA: Array.from(transferResult.proof.proofA),
        proofB: Array.from(transferResult.proof.proofB),
        proofC: Array.from(transferResult.proof.proofC),
      },
      encryptedNote1: Buffer.from([]),
      encryptedNote2: Buffer.from([]),
    })
    .accounts({
      merkleTree, poolConfig, nullifierPda,
      sender: wallet.publicKey,
      systemProgram: SystemProgram.programId,
    })
    .preInstructions([
      ComputeBudgetProgram.setComputeUnitLimit({ units: 500_000 }),
    ])
    .rpc();

  console.log("Payment sent: 3 USDC");
  console.log("Change remaining: 7 USDC");

  // Update tree
  const paymentLeafIndex = await tree.insert(transferResult.outputCommitment1);
  const changeLeafIndex = await tree.insert(transferResult.outputCommitment2);

  // Store the change note for future use
  const agentChangeNote = {
    ...changeNote,
    commitment: transferResult.outputCommitment2,
    nullifier: await computeNullifier(changeNote.secret, transferResult.outputCommitment2),
    leafIndex: changeLeafIndex,
  };

  console.log("\nAgent balance: 7 USDC (shielded)");
  console.log("Payment note leaf:", paymentLeafIndex);
  console.log("Change note leaf:", changeLeafIndex);

  // ── Step 3: Send payment note to service provider ────────────────────
  // In production, this would be sent via encrypted channel
  const paymentData = {
    amount: paymentNote.amount.toString(),
    secret: paymentNote.secret.toString(),
    blinding: paymentNote.blinding.toString(),
    asset: paymentNote.asset.toString(),
    memo: paymentNote.memo.map((m) => m.toString()),
    leafIndex: paymentLeafIndex,
    commitment: transferResult.outputCommitment1.toString(),
  };
  console.log("\nPayment data for service provider (send securely):");
  console.log("  amount: 3 USDC");
  console.log("  leafIndex:", paymentLeafIndex);

  return { agentChangeNote, paymentData };
}
```

---

## Running the Examples

1. Ensure circuit files are available at the paths specified in the `CIRCUITS` configuration.

2. Set up your Solana wallet and ensure it has USDC and SOL for gas.

3. Copy the Anchor IDL (`zera_pool.json`) to your project.

4. Run any example:

```bash
npx tsx examples/deposit.ts
```

For a full lifecycle test (deposit, withdraw, transfer), see the `scripts/test-lifecycle.ts` script in the main repository.
