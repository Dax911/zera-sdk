/**
 * ZK proof generators for the three shielded-pool operations:
 * deposit, withdraw, and transfer.
 *
 * Each function builds the witness, invokes snarkjs `groth16.fullProve`,
 * and formats the resulting proof for the Solana on-chain verifier.
 */

import * as snarkjs from "snarkjs";
import { computeCommitment, computeNullifier } from "./note";
import { MerkleTree } from "./merkle-tree";
import { formatProofForSolana } from "./utils";
import type {
  Note,
  SolanaProof,
  DepositProofResult,
  WithdrawProofResult,
  TransferProofResult,
} from "./types";

// Re-export proof result types for convenience
export type { SolanaProof, DepositProofResult, WithdrawProofResult, TransferProofResult };

// ---------------------------------------------------------------------------
// Deposit
// ---------------------------------------------------------------------------

/**
 * Generate a deposit proof that proves a commitment was correctly formed
 * from the given note fields.
 *
 * @param note     - The shielded note to deposit.
 * @param wasmPath - Path/URL to the circuit `.wasm` file.
 * @param zkeyPath - Path/URL to the Groth16 `.zkey` file.
 */
export async function generateDepositProof(
  note: Note,
  wasmPath: string,
  zkeyPath: string,
): Promise<DepositProofResult> {
  const commitment = await computeCommitment(note);

  const input = {
    publicAmount: note.amount.toString(),
    publicAsset: note.asset.toString(),
    outputCommitment: commitment.toString(),
    secret: note.secret.toString(),
    blinding: note.blinding.toString(),
    memo: note.memo.map((m) => m.toString()),
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    wasmPath,
    zkeyPath,
  );

  return {
    proof: formatProofForSolana(proof),
    commitment,
    publicSignals,
  };
}

// ---------------------------------------------------------------------------
// Withdraw
// ---------------------------------------------------------------------------

/**
 * Generate a withdrawal proof that proves knowledge of a note inside the
 * Merkle tree and reveals a nullifier to prevent double-spending.
 *
 * @param note          - The note to withdraw.
 * @param leafIndex     - Position of the note's commitment in the tree.
 * @param tree          - The local Merkle tree instance.
 * @param recipientHash - Hash of the recipient (for circuit binding).
 * @param wasmPath      - Path/URL to the circuit `.wasm` file.
 * @param zkeyPath      - Path/URL to the Groth16 `.zkey` file.
 */
export async function generateWithdrawProof(
  note: Note,
  leafIndex: number,
  tree: MerkleTree,
  recipientHash: bigint,
  wasmPath: string,
  zkeyPath: string,
): Promise<WithdrawProofResult> {
  const commitment = await computeCommitment(note);
  const nullifierHash = await computeNullifier(note.secret, commitment);
  const { pathElements, pathIndices } = await tree.getProof(leafIndex);

  const input = {
    // Public
    root: tree.root.toString(),
    nullifierHash: nullifierHash.toString(),
    recipient: recipientHash.toString(),
    amount: note.amount.toString(),
    asset: note.asset.toString(),
    // Private
    secret: note.secret.toString(),
    blinding: note.blinding.toString(),
    memo: note.memo.map((m) => m.toString()),
    pathElements: pathElements.map((e) => e.toString()),
    pathIndices: pathIndices.map((i) => i.toString()),
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    wasmPath,
    zkeyPath,
  );

  return {
    proof: formatProofForSolana(proof),
    nullifierHash,
    publicSignals,
  };
}

// ---------------------------------------------------------------------------
// Transfer
// ---------------------------------------------------------------------------

/**
 * Generate a shielded transfer proof (1 input note -> 2 output notes).
 *
 * The circuit enforces value conservation: `inputNote.amount == outputNote1.amount + outputNote2.amount`.
 *
 * @param inputNote      - The note being consumed.
 * @param inputLeafIndex - Leaf index of the input note in the tree.
 * @param tree           - The local Merkle tree instance.
 * @param outputNote1    - First output note (e.g. payment to recipient).
 * @param outputNote2    - Second output note (e.g. change back to sender).
 * @param wasmPath       - Path/URL to the circuit `.wasm` file.
 * @param zkeyPath       - Path/URL to the Groth16 `.zkey` file.
 */
export async function generateTransferProof(
  inputNote: Note,
  inputLeafIndex: number,
  tree: MerkleTree,
  outputNote1: Note,
  outputNote2: Note,
  wasmPath: string,
  zkeyPath: string,
): Promise<TransferProofResult> {
  const inCommitment = await computeCommitment(inputNote);
  const nullifierHash = await computeNullifier(inputNote.secret, inCommitment);
  const outCommitment1 = await computeCommitment(outputNote1);
  const outCommitment2 = await computeCommitment(outputNote2);
  const { pathElements, pathIndices } = await tree.getProof(inputLeafIndex);

  const input = {
    // Public
    root: tree.root.toString(),
    nullifierHash: nullifierHash.toString(),
    outputCommitment1: outCommitment1.toString(),
    outputCommitment2: outCommitment2.toString(),
    // Private - input note
    inAmount: inputNote.amount.toString(),
    inSecret: inputNote.secret.toString(),
    inBlinding: inputNote.blinding.toString(),
    inAsset: inputNote.asset.toString(),
    inMemo: inputNote.memo.map((m) => m.toString()),
    pathElements: pathElements.map((e) => e.toString()),
    pathIndices: pathIndices.map((i) => i.toString()),
    // Private - output note 1
    outAmount1: outputNote1.amount.toString(),
    outSecret1: outputNote1.secret.toString(),
    outBlinding1: outputNote1.blinding.toString(),
    outAsset1: outputNote1.asset.toString(),
    outMemo1: outputNote1.memo.map((m) => m.toString()),
    // Private - output note 2
    outAmount2: outputNote2.amount.toString(),
    outSecret2: outputNote2.secret.toString(),
    outBlinding2: outputNote2.blinding.toString(),
    outAsset2: outputNote2.asset.toString(),
    outMemo2: outputNote2.memo.map((m) => m.toString()),
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    input,
    wasmPath,
    zkeyPath,
  );

  return {
    proof: formatProofForSolana(proof),
    nullifierHash,
    outputCommitment1: outCommitment1,
    outputCommitment2: outCommitment2,
    publicSignals,
  };
}
