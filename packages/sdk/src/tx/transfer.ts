/**
 * Transaction builder for shielded transfers (1-input, 2-output).
 *
 * Constructs a Solana `Transaction` that:
 * 1. Verifies a Groth16 proof of note ownership, Merkle inclusion, and
 *    value conservation.
 * 2. Marks the input nullifier as spent.
 * 3. Inserts two new commitment leaves into the on-chain Merkle tree.
 *
 * No tokens leave or enter the pool vault; only the tree state changes.
 */

import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import { SHIELDED_POOL_PROGRAM_ID } from "../constants";
import { bigintToBytes32BE } from "../utils";
import {
  derivePoolConfig,
  deriveMerkleTree,
  deriveNullifier,
} from "../pda";
import type { SolanaProof } from "../types";

// ---------------------------------------------------------------------------
// Instruction discriminator
// ---------------------------------------------------------------------------

// Anchor sighash for "transfer" – replace with the real hash from your IDL.
const TRANSFER_DISCRIMINATOR = Buffer.from([
  0xa3, 0x34, 0xae, 0x68, 0x1f, 0x2a, 0xd0, 0x09,
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TransferParams {
  /** The payer who submits the transaction. */
  payer: PublicKey;
  /** SPL token mint associated with the pool. */
  mint: PublicKey;
  /** The input nullifier hash. */
  nullifierHash: bigint;
  /** Commitment of the first output note. */
  outputCommitment1: bigint;
  /** Commitment of the second output note (change). */
  outputCommitment2: bigint;
  /** The Merkle root at the time of proof generation. */
  root: bigint;
  /** Groth16 proof formatted for Solana. */
  proof: SolanaProof;
  /** Public signals from snarkjs (formatted as `Uint8Array[]`). */
  publicInputs: Uint8Array[];
  /** Optional: override the shielded-pool program ID. */
  programId?: PublicKey;
}

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

/**
 * Build a shielded transfer transaction.
 *
 * The caller is responsible for signing and sending the returned `Transaction`.
 */
export function buildTransferTransaction(params: TransferParams): Transaction {
  const {
    payer,
    mint,
    nullifierHash,
    outputCommitment1,
    outputCommitment2,
    root,
    proof,
    publicInputs,
    programId: programIdOverride,
  } = params;

  const programId = programIdOverride ?? new PublicKey(SHIELDED_POOL_PROGRAM_ID);

  // Derive PDAs
  const [poolConfig] = derivePoolConfig(mint, programId);
  const [merkleTree] = deriveMerkleTree(mint, programId);
  const [nullifierPda] = deriveNullifier(nullifierHash, programId);

  // Instruction data
  const nullifierBytes = bigintToBytes32BE(nullifierHash);
  const rootBytes = bigintToBytes32BE(root);
  const outCommit1Bytes = bigintToBytes32BE(outputCommitment1);
  const outCommit2Bytes = bigintToBytes32BE(outputCommitment2);

  const data = Buffer.concat([
    TRANSFER_DISCRIMINATOR,
    nullifierBytes,
    rootBytes,
    outCommit1Bytes,
    outCommit2Bytes,
    proof.proofA,
    proof.proofB,
    proof.proofC,
    ...publicInputs,
  ]);

  const keys = [
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: poolConfig, isSigner: false, isWritable: false },
    { pubkey: merkleTree, isSigner: false, isWritable: true },
    { pubkey: nullifierPda, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
  ];

  const instruction = new TransactionInstruction({
    keys,
    programId,
    data,
  });

  const tx = new Transaction();
  tx.add(instruction);

  return tx;
}
