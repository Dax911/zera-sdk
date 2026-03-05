/**
 * Shielded-note primitives: creation, commitment, and nullifier derivation.
 */

import { randomBytes } from "crypto";
import { poseidonHash } from "./crypto/poseidon";
import { BN254_PRIME } from "./constants";
import type { Note, StoredNote } from "./types";

// Re-export types so consumers can `import { Note } from "@zera-labs/sdk/note"`
export type { Note, StoredNote };

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Generate a random field element (248 bits, reduced mod BN254_PRIME).
 */
function randomFieldElement(): bigint {
  const bytes = randomBytes(31); // 248 bits – safely below the 254-bit prime
  const value = BigInt("0x" + bytes.toString("hex"));
  return value % BN254_PRIME;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new shielded note with freshly sampled `secret` and `blinding`.
 *
 * @param amount - Token amount in base units.
 * @param asset  - Asset field element (e.g. hashed mint address).
 * @param memo   - Optional four-element memo tuple.
 */
export function createNote(
  amount: bigint,
  asset: bigint,
  memo?: [bigint, bigint, bigint, bigint],
): Note {
  return {
    amount,
    asset,
    secret: randomFieldElement(),
    blinding: randomFieldElement(),
    memo: memo ?? [0n, 0n, 0n, 0n],
  };
}

/**
 * Compute the Poseidon commitment for a note.
 *
 * ```
 * commitment = Poseidon(amount, secret, blinding, asset, memo[0..3])
 * ```
 */
export async function computeCommitment(note: Note): Promise<bigint> {
  return poseidonHash([
    note.amount,
    note.secret,
    note.blinding,
    note.asset,
    ...note.memo,
  ]);
}

/**
 * Compute the nullifier for spending a note.
 *
 * ```
 * nullifier = Poseidon(secret, commitment)
 * ```
 */
export async function computeNullifier(
  secret: bigint,
  commitment: bigint,
): Promise<bigint> {
  return poseidonHash([secret, commitment]);
}

/**
 * Hash a 32-byte Solana public key into a BN254 field element
 * by interpreting the bytes as a big-endian integer and reducing mod p.
 */
export async function hashPubkeyToField(
  pubkeyBytes: Uint8Array,
): Promise<bigint> {
  let hex = "";
  for (let i = 0; i < pubkeyBytes.length; i++) {
    hex += pubkeyBytes[i].toString(16).padStart(2, "0");
  }
  return BigInt("0x" + hex) % BN254_PRIME;
}
