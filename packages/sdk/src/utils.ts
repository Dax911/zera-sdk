/**
 * Low-level byte-formatting utilities for Solana Groth16 verification.
 */

import { BN254_BASE_FIELD_PRIME } from "./constants";

// ---------------------------------------------------------------------------
// Byte conversion
// ---------------------------------------------------------------------------

/**
 * Convert a bigint to a 32-byte big-endian `Uint8Array`.
 */
export function bigintToBytes32BE(value: bigint): Uint8Array {
  const hex = value.toString(16).padStart(64, "0");
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Convert a 32-byte big-endian `Uint8Array` to a bigint.
 */
export function bytes32BEToBigint(bytes: Uint8Array): bigint {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return BigInt("0x" + hex);
}

/**
 * Format a field element as a `number[]` (JSON-friendly `[u8; 32]`) for Solana
 * instruction data.
 */
export function fieldToSolanaBytes(value: bigint): number[] {
  const bytes = bigintToBytes32BE(value);
  return Array.from(bytes);
}

/**
 * Format an array of public-signal strings (from snarkjs) into big-endian
 * `Uint8Array[]` ready for on-chain verification.
 */
export function formatPublicInputsForSolana(
  publicSignals: string[],
): Uint8Array[] {
  return publicSignals.map((signal) => bigintToBytes32BE(BigInt(signal)));
}

// ---------------------------------------------------------------------------
// Proof formatting
// ---------------------------------------------------------------------------

/**
 * Convert a snarkjs Groth16 proof object into the byte layout expected by
 * `groth16-solana` (the on-chain verifier).
 *
 * Key transformations:
 * - `pi_a`: negate the y-coordinate (`y' = p - y`) then encode `[x, y']` as
 *   big-endian bytes.
 * - `pi_b`: reverse the coordinate pairs within each G2 element.
 * - `pi_c`: direct `[x, y]` encoding.
 */
export function formatProofForSolana(proof: {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
}): {
  proofA: Uint8Array;
  proofB: Uint8Array;
  proofC: Uint8Array;
} {
  const p = BN254_BASE_FIELD_PRIME;

  // pi_a: G1 point – negate y
  const ax = BigInt(proof.pi_a[0]);
  const ay = p - BigInt(proof.pi_a[1]);
  const proofA = new Uint8Array(64);
  proofA.set(bigintToBytes32BE(ax), 0);
  proofA.set(bigintToBytes32BE(ay), 32);

  // pi_b: G2 point – reversed coordinate order
  const bx1 = BigInt(proof.pi_b[0][1]);
  const bx2 = BigInt(proof.pi_b[0][0]);
  const by1 = BigInt(proof.pi_b[1][1]);
  const by2 = BigInt(proof.pi_b[1][0]);
  const proofB = new Uint8Array(128);
  proofB.set(bigintToBytes32BE(bx1), 0);
  proofB.set(bigintToBytes32BE(bx2), 32);
  proofB.set(bigintToBytes32BE(by1), 64);
  proofB.set(bigintToBytes32BE(by2), 96);

  // pi_c: G1 point – direct
  const cx = BigInt(proof.pi_c[0]);
  const cy = BigInt(proof.pi_c[1]);
  const proofC = new Uint8Array(64);
  proofC.set(bigintToBytes32BE(cx), 0);
  proofC.set(bigintToBytes32BE(cy), 32);

  return { proofA, proofB, proofC };
}
