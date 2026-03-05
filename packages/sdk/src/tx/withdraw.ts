/**
 * Transaction builder for shielded withdrawals.
 *
 * Constructs a Solana `Transaction` that:
 * 1. Verifies a Groth16 proof of note ownership and Merkle inclusion.
 * 2. Marks the nullifier as spent (prevents double-withdrawal).
 * 3. Transfers tokens from the pool vault to the recipient's ATA.
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
  deriveVault,
  deriveNullifier,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "../pda";
import type { SolanaProof } from "../types";

// ---------------------------------------------------------------------------
// Instruction discriminator
// ---------------------------------------------------------------------------

// Anchor sighash for "withdraw" – replace with the real hash from your IDL.
const WITHDRAW_DISCRIMINATOR = Buffer.from([
  0xb7, 0x12, 0x46, 0x9c, 0x94, 0x6d, 0xa1, 0x22,
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WithdrawParams {
  /** The payer who submits the transaction (may differ from recipient). */
  payer: PublicKey;
  /** The wallet receiving the withdrawn tokens. */
  recipient: PublicKey;
  /** SPL token mint being withdrawn. */
  mint: PublicKey;
  /** Withdrawal amount in base units. */
  amount: bigint;
  /** The nullifier hash derived from (secret, commitment). */
  nullifierHash: bigint;
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
 * Build a withdrawal transaction.
 *
 * The caller is responsible for signing and sending the returned `Transaction`.
 */
export function buildWithdrawTransaction(params: WithdrawParams): Transaction {
  const {
    payer,
    recipient,
    mint,
    amount,
    nullifierHash,
    root,
    proof,
    publicInputs,
    programId: programIdOverride,
  } = params;

  const programId = programIdOverride ?? new PublicKey(SHIELDED_POOL_PROGRAM_ID);

  // Derive PDAs
  const [poolConfig] = derivePoolConfig(mint, programId);
  const [merkleTree] = deriveMerkleTree(mint, programId);
  const [vault] = deriveVault(mint, programId);
  const [nullifierPda] = deriveNullifier(nullifierHash, programId);

  const recipientAta = getAssociatedTokenAddress(mint, recipient);

  // Instruction data
  const amountBuf = Buffer.alloc(8);
  amountBuf.writeBigUInt64LE(amount);

  const nullifierBytes = bigintToBytes32BE(nullifierHash);
  const rootBytes = bigintToBytes32BE(root);

  const data = Buffer.concat([
    WITHDRAW_DISCRIMINATOR,
    amountBuf,
    nullifierBytes,
    rootBytes,
    proof.proofA,
    proof.proofB,
    proof.proofC,
    ...publicInputs,
  ]);

  const keys = [
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: recipient, isSigner: false, isWritable: false },
    { pubkey: poolConfig, isSigner: false, isWritable: false },
    { pubkey: merkleTree, isSigner: false, isWritable: false },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: recipientAta, isSigner: false, isWritable: true },
    { pubkey: nullifierPda, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
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
