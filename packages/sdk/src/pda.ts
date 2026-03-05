/**
 * PDA (Program Derived Address) derivation helpers for both the shielded-pool
 * program and the private-cash (voucher) program.
 *
 * Each function returns a `[PublicKey, bump]` tuple identical to
 * `PublicKey.findProgramAddressSync`.
 */

import { PublicKey } from "@solana/web3.js";
import {
  SHIELDED_POOL_PROGRAM_ID,
  PRIVATE_CASH_PROGRAM_ID,
  POOL_CONFIG_SEED,
  MERKLE_TREE_SEED,
  VAULT_SEED,
  FEE_VAULT_SEED,
  NULLIFIER_SEED,
  TOKEN_PROGRAM_ID_STR,
  ASSOCIATED_TOKEN_PROGRAM_ID_STR,
} from "./constants";
import { bigintToBytes32BE } from "./utils";

// ---------------------------------------------------------------------------
// Pre-built PublicKey constants
// ---------------------------------------------------------------------------

const SHIELDED_POOL_PUBKEY = new PublicKey(SHIELDED_POOL_PROGRAM_ID);
const PRIVATE_CASH_PUBKEY = new PublicKey(PRIVATE_CASH_PROGRAM_ID);

export const TOKEN_PROGRAM_ID = new PublicKey(TOKEN_PROGRAM_ID_STR);
export const ASSOCIATED_TOKEN_PROGRAM_ID = new PublicKey(
  ASSOCIATED_TOKEN_PROGRAM_ID_STR,
);

// ---------------------------------------------------------------------------
// Shielded-pool PDAs
// ---------------------------------------------------------------------------

/**
 * Derive the pool-config PDA for a given mint.
 *
 * Seeds: `["pool_config", mint]`
 */
export function derivePoolConfig(
  mint: PublicKey,
  programId: PublicKey = SHIELDED_POOL_PUBKEY,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(POOL_CONFIG_SEED), mint.toBuffer()],
    programId,
  );
}

/**
 * Derive the Merkle-tree account PDA for a given mint.
 *
 * Seeds: `["merkle_tree", mint]`
 */
export function deriveMerkleTree(
  mint: PublicKey,
  programId: PublicKey = SHIELDED_POOL_PUBKEY,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(MERKLE_TREE_SEED), mint.toBuffer()],
    programId,
  );
}

/**
 * Derive the token vault PDA that holds deposited tokens.
 *
 * Seeds: `["vault", mint]`
 */
export function deriveVault(
  mint: PublicKey,
  programId: PublicKey = SHIELDED_POOL_PUBKEY,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(VAULT_SEED), mint.toBuffer()],
    programId,
  );
}

/**
 * Derive the fee-vault PDA that accumulates protocol fees.
 *
 * Seeds: `["fee_vault", mint]`
 */
export function deriveFeeVault(
  mint: PublicKey,
  programId: PublicKey = SHIELDED_POOL_PUBKEY,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(FEE_VAULT_SEED), mint.toBuffer()],
    programId,
  );
}

/**
 * Derive the nullifier PDA for a given nullifier hash.
 *
 * Seeds: `["nullifier", nullifierHash_be_bytes]`
 *
 * The nullifier hash is serialised as a 32-byte big-endian array to match the
 * on-chain derivation.
 */
export function deriveNullifier(
  nullifierHash: bigint,
  programId: PublicKey = SHIELDED_POOL_PUBKEY,
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from(NULLIFIER_SEED), Buffer.from(bigintToBytes32BE(nullifierHash))],
    programId,
  );
}

// ---------------------------------------------------------------------------
// SPL token helpers
// ---------------------------------------------------------------------------

/**
 * Derive the associated token address for a given mint and owner.
 *
 * Uses the standard ATA derivation:
 * Seeds: `[owner, TOKEN_PROGRAM_ID, mint]` under the
 * Associated Token Program.
 */
export function getAssociatedTokenAddress(
  mint: PublicKey,
  owner: PublicKey,
): PublicKey {
  const [ata] = PublicKey.findProgramAddressSync(
    [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );
  return ata;
}
