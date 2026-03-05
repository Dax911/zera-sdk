/**
 * Transaction builder for shielded deposits.
 *
 * Constructs a Solana `Transaction` that:
 * 1. Transfers tokens from the user's ATA into the pool vault.
 * 2. Submits a Groth16 proof verifying the commitment was correctly formed.
 * 3. Inserts the commitment as a new leaf in the on-chain Merkle tree.
 */

import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
} from "@solana/web3.js";
import {
  SHIELDED_POOL_PROGRAM_ID,
  POOL_CONFIG_SEED,
  MERKLE_TREE_SEED,
  VAULT_SEED,
} from "../constants";
import { bigintToBytes32BE } from "../utils";
import {
  derivePoolConfig,
  deriveMerkleTree,
  deriveVault,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "../pda";
import type { SolanaProof } from "../types";

// ---------------------------------------------------------------------------
// Instruction data discriminator (Anchor-style 8-byte sighash)
// ---------------------------------------------------------------------------

// Anchor sighash for "deposit" – replace with the real hash from your IDL.
const DEPOSIT_DISCRIMINATOR = Buffer.from([
  0xf8, 0xc6, 0x9e, 0x91, 0xe1, 0x75, 0x87, 0xc8,
]);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DepositParams {
  /** The payer / depositor's wallet public key. */
  payer: PublicKey;
  /** SPL token mint being deposited. */
  mint: PublicKey;
  /** Deposit amount in base units. */
  amount: bigint;
  /** The note commitment (Poseidon hash). */
  commitment: bigint;
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
 * Build a deposit transaction.
 *
 * The caller is responsible for signing and sending the returned `Transaction`.
 */
export function buildDepositTransaction(params: DepositParams): Transaction {
  const {
    payer,
    mint,
    amount,
    commitment,
    proof,
    publicInputs,
    programId: programIdOverride,
  } = params;

  const programId = programIdOverride ?? new PublicKey(SHIELDED_POOL_PROGRAM_ID);

  // Derive PDAs
  const [poolConfig] = derivePoolConfig(mint, programId);
  const [merkleTree] = deriveMerkleTree(mint, programId);
  const [vault] = deriveVault(mint, programId);

  const userAta = getAssociatedTokenAddress(mint, payer);

  // Build instruction data: discriminator + amount (u64 LE) + commitment (32 BE) + proof + public inputs
  const amountBuf = Buffer.alloc(8);
  amountBuf.writeBigUInt64LE(amount);

  const commitmentBytes = bigintToBytes32BE(commitment);

  const data = Buffer.concat([
    DEPOSIT_DISCRIMINATOR,
    amountBuf,
    commitmentBytes,
    proof.proofA,
    proof.proofB,
    proof.proofC,
    ...publicInputs,
  ]);

  const keys = [
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: poolConfig, isSigner: false, isWritable: false },
    { pubkey: merkleTree, isSigner: false, isWritable: true },
    { pubkey: vault, isSigner: false, isWritable: true },
    { pubkey: userAta, isSigner: false, isWritable: true },
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
