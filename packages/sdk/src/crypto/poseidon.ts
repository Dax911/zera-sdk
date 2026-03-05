/**
 * Poseidon hashing primitives using circomlibjs (BN254 parameters, compatible
 * with circomlib circuits and solana-poseidon on-chain).
 */

// @ts-ignore - circomlibjs ships without type definitions
import { buildPoseidon } from "circomlibjs";

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

let poseidonInstance: any = null;

/**
 * Lazily build (or return the cached) circomlibjs Poseidon instance.
 */
export async function getPoseidon(): Promise<any> {
  if (!poseidonInstance) {
    poseidonInstance = await buildPoseidon();
  }
  return poseidonInstance;
}

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

/**
 * Hash an arbitrary-length array of bigints with Poseidon (BN254 scalar field).
 *
 * @param inputs - Field elements to hash.
 * @returns The Poseidon digest as a bigint.
 */
export async function poseidonHash(inputs: bigint[]): Promise<bigint> {
  const poseidon = await getPoseidon();
  const hash = poseidon(inputs.map((v: bigint) => poseidon.F.e(v)));
  return BigInt(poseidon.F.toObject(hash));
}

/**
 * Hash exactly two field elements (the node-hashing function used inside the
 * incremental Merkle tree).
 */
export async function poseidonHash2(
  left: bigint,
  right: bigint,
): Promise<bigint> {
  return poseidonHash([left, right]);
}

// ---------------------------------------------------------------------------
// Field <-> bytes conversion
// ---------------------------------------------------------------------------

/**
 * Convert a bigint field element to a 32-byte big-endian `Uint8Array`.
 */
export function fieldToBytes32BE(value: bigint): Uint8Array {
  const hex = value.toString(16).padStart(64, "0");
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Convert a 32-byte big-endian `Uint8Array` back to a bigint field element.
 */
export function bytes32BEToField(bytes: Uint8Array): bigint {
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return BigInt("0x" + hex);
}
