/**
 * Keccak-256 utilities for the private-cash voucher flow.
 *
 * These mirror the browser-oriented helpers in the wallet-web app but are
 * written to be environment-agnostic (Node / browser / edge).
 */

import { keccak_256 } from "@noble/hashes/sha3";
import { PublicKey } from "@solana/web3.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HEX_LENGTH = 32; // bytes

/**
 * Strip an optional `0x` prefix and validate that the result is exactly 32
 * bytes of hex, then return the raw bytes.
 */
function normalizeHex(input: string, label: string): Uint8Array {
  if (typeof input !== "string" || !input.trim()) {
    throw new Error(`${label} is required.`);
  }
  const cleaned = input.trim().replace(/^0x/i, "");
  if (cleaned.length !== HEX_LENGTH * 2) {
    throw new Error(`${label} must be a 32-byte hex string.`);
  }
  const bytes = new Uint8Array(HEX_LENGTH);
  for (let i = 0; i < HEX_LENGTH; i++) {
    bytes[i] = parseInt(cleaned.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function toPrefixedHex(bytes: Uint8Array): string {
  let hex = "0x";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a cryptographically random 32-byte hex string (`0x`-prefixed).
 *
 * Works in Node (via `crypto.getRandomValues` polyfill) and in the browser.
 */
export function generateRandomHex(): string {
  const bytes = new Uint8Array(HEX_LENGTH);
  // globalThis.crypto is available in Node >= 19 and all modern browsers.
  if (
    typeof globalThis !== "undefined" &&
    globalThis.crypto &&
    typeof globalThis.crypto.getRandomValues === "function"
  ) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    // Fallback for older Node versions
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeCrypto = require("crypto") as typeof import("crypto");
    const buf = nodeCrypto.randomBytes(HEX_LENGTH);
    bytes.set(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
  }
  return toPrefixedHex(bytes);
}

/**
 * Compute a Keccak-256 commitment from a 32-byte hex secret.
 *
 * @param secretHex - `0x`-prefixed (or bare) 32-byte hex secret.
 * @returns `0x`-prefixed hex digest.
 */
export function computeKeccakCommitment(secretHex: string): string {
  const secretBytes = normalizeHex(secretHex, "Secret");
  const hash = keccak_256(secretBytes);
  return toPrefixedHex(hash);
}

/**
 * Compute the recipient hash: `keccak256(pubkeyBytes || saltBytes)`.
 *
 * @param recipient - Solana public-key string (base58).
 * @param saltHex   - `0x`-prefixed (or bare) 32-byte hex salt.
 * @returns `0x`-prefixed hex digest.
 */
export function computeRecipientHash(
  recipient: string,
  saltHex: string,
): string {
  const recipientKey = new PublicKey(recipient);
  const saltBytes = normalizeHex(saltHex, "Salt");
  const combined = new Uint8Array(32 + 32);
  combined.set(recipientKey.toBytes(), 0);
  combined.set(saltBytes, 32);
  const hash = keccak_256(combined);
  return toPrefixedHex(hash);
}
