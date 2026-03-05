/**
 * Private-cash voucher parsing, local storage, and validation.
 *
 * Adapted from the wallet-web voucher module with browser-specific APIs
 * kept behind runtime guards so the code is safe to import in Node.
 */

import { PublicKey } from "@solana/web3.js";
import type { PrivateCashVoucher, PrivateCashVoucherTile } from "./types";

// Re-export types for convenience
export type { PrivateCashVoucher, PrivateCashVoucherTile };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VOUCHER_STORAGE_KEY = "zera.privateCash.vouchers";
const HEX_32_REGEX = /^0x[0-9a-f]{64}$/i;

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

export type VoucherParseErrorReason = "invalid" | "legacy";

export class VoucherParseError extends Error {
  constructor(
    public readonly reason: VoucherParseErrorReason,
    message: string,
  ) {
    super(message);
    this.name = "VoucherParseError";
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function normalizeHex32(value: string, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new VoucherParseError("invalid", `${field} is missing or empty.`);
  }
  const prefixed =
    value.startsWith("0x") || value.startsWith("0X") ? value : `0x${value}`;
  if (!HEX_32_REGEX.test(prefixed)) {
    throw new VoucherParseError(
      "invalid",
      `${field} must be a 32-byte hex string.`,
    );
  }
  return prefixed.toLowerCase();
}

function parseRecipient(value: string | undefined): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new VoucherParseError("invalid", "recipient is missing.");
  }
  try {
    return new PublicKey(value.trim()).toBase58();
  } catch {
    throw new VoucherParseError(
      "invalid",
      "recipient must be a valid Solana public key.",
    );
  }
}

// ---------------------------------------------------------------------------
// Stored-tile guard
// ---------------------------------------------------------------------------

interface StoredVoucherTile {
  id: string;
  voucherId?: string;
  amount: number;
  txSignature: string;
  recipient?: string;
  createdAt: string;
}

function isStoredVoucherTile(value: unknown): value is StoredVoucherTile {
  const v = value as StoredVoucherTile;
  return (
    typeof v === "object" &&
    v !== null &&
    typeof v.id === "string" &&
    typeof v.txSignature === "string" &&
    typeof v.createdAt === "string"
  );
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a raw JSON object into a validated {@link PrivateCashVoucherTile}.
 *
 * @param obj - The raw parsed JSON.
 * @param id  - An external identifier for the voucher (e.g. file name).
 * @throws {VoucherParseError} on invalid or legacy voucher data.
 */
export function parseVoucher(obj: unknown, id: string): PrivateCashVoucherTile {
  if (!obj || typeof obj !== "object") {
    throw new VoucherParseError("invalid", "Voucher JSON must be an object.");
  }

  const value = obj as Record<string, unknown>;

  // Detect legacy voucher format (pre-v2)
  if (
    typeof value.transferSecret === "string" ||
    typeof value.nullifier === "string"
  ) {
    throw new VoucherParseError(
      "legacy",
      "Legacy voucher detected. Use the legacy withdrawal flow to redeem it.",
    );
  }

  if (
    typeof value.voucherId !== "string" ||
    typeof value.txSignature !== "string" ||
    typeof value.createdAt !== "string"
  ) {
    throw new VoucherParseError(
      "invalid",
      "Voucher JSON is missing required fields.",
    );
  }

  const amountNum =
    typeof value.amount === "number"
      ? value.amount
      : typeof value.amount === "string"
        ? Number(value.amount)
        : NaN;

  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    throw new VoucherParseError(
      "invalid",
      "Amount must be a positive number.",
    );
  }

  const voucherId = normalizeHex32(value.voucherId as string, "voucherId");
  const secret = normalizeHex32((value.secret as string) ?? "", "secret");
  const salt = normalizeHex32((value.salt as string) ?? "", "salt");
  const recipient = parseRecipient(value.recipient as string | undefined);

  return {
    id,
    voucherId,
    amount: amountNum,
    secret,
    salt,
    recipient,
    txSignature: value.txSignature as string,
    createdAt: value.createdAt as string,
  };
}

/**
 * Load stored voucher tiles from `localStorage`.
 *
 * Returns an empty array when called outside a browser environment or when
 * no data is found.
 */
export function loadStoredVouchers(): PrivateCashVoucherTile[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(VOUCHER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const tiles: PrivateCashVoucherTile[] = [];
    for (const entry of parsed) {
      if (!isStoredVoucherTile(entry)) continue;

      const amountNum = Number(entry.amount);
      if (!Number.isFinite(amountNum) || amountNum <= 0) continue;

      tiles.push({
        id: entry.id,
        voucherId: typeof entry.voucherId === "string" ? entry.voucherId : "",
        amount: amountNum,
        secret: "",
        salt: "",
        recipient: typeof entry.recipient === "string" ? entry.recipient : "",
        txSignature: entry.txSignature,
        createdAt: entry.createdAt,
      });
    }

    return tiles;
  } catch {
    return [];
  }
}

/**
 * Persist an array of voucher tiles to `localStorage`.
 *
 * Secret material is intentionally stripped; only metadata is stored.
 */
export function storeVouchers(vouchers: PrivateCashVoucherTile[]): void {
  if (typeof window === "undefined") return;
  try {
    const toStore: StoredVoucherTile[] = vouchers.map((v) => ({
      id: v.id,
      voucherId: v.voucherId,
      amount: v.amount,
      txSignature: v.txSignature,
      recipient: v.recipient,
      createdAt: v.createdAt,
    }));
    window.localStorage.setItem(
      VOUCHER_STORAGE_KEY,
      JSON.stringify(toStore),
    );
  } catch {
    // Best-effort persistence.
  }
}
