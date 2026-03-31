import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  TREE_HEIGHT,
  TREE_CAPACITY,
  BN254_PRIME,
  BN254_BASE_FIELD_PRIME,
  USDC_MINT,
  USDC_DECIMALS,
  ZERA_MINT,
  NATIVE_SOL_MINT,
  PRIVATE_CASH_PROGRAM_ID,
  SHIELDED_POOL_PROGRAM_ID,
  FEE_BASIS_POINTS,
  TOTAL_BASIS_POINTS,
  MIN_FEE_AMOUNT,
  VOUCHER_AMOUNT_OFFSET,
  EXPECTED_VOUCHER_SIZE,
} from "./constants";

describe("constants", () => {
  it("TREE_HEIGHT is 24", () => {
    expect(TREE_HEIGHT).toBe(24);
  });

  it("TREE_CAPACITY is 2^24", () => {
    expect(TREE_CAPACITY).toBe(2 ** 24);
    expect(TREE_CAPACITY).toBe(16_777_216);
  });

  it("BN254_PRIME is a valid ~254 bit prime", () => {
    expect(BN254_PRIME).toBeGreaterThan(0n);
    // known value check
    expect(BN254_PRIME.toString()).toBe(
      "21888242871839275222246405745257275088548364400416034343698204186575808495617",
    );
  });

  it("BN254_BASE_FIELD_PRIME is a valid prime", () => {
    expect(BN254_BASE_FIELD_PRIME).toBeGreaterThan(BN254_PRIME);
  });

  it("token mints are valid public keys", () => {
    expect(() => new PublicKey(USDC_MINT)).not.toThrow();
    expect(() => new PublicKey(ZERA_MINT)).not.toThrow();
    expect(() => new PublicKey(NATIVE_SOL_MINT)).not.toThrow();
  });

  it("USDC has 6 decimals", () => {
    expect(USDC_DECIMALS).toBe(6);
  });

  it("program IDs are valid public keys", () => {
    expect(() => new PublicKey(PRIVATE_CASH_PROGRAM_ID)).not.toThrow();
    expect(() => new PublicKey(SHIELDED_POOL_PROGRAM_ID)).not.toThrow();
  });

  it("fee constants are reasonable", () => {
    expect(FEE_BASIS_POINTS).toBe(10);
    expect(TOTAL_BASIS_POINTS).toBe(10_000n);
    expect(MIN_FEE_AMOUNT).toBe(1n);
  });

  it("voucher layout constants are positive", () => {
    expect(VOUCHER_AMOUNT_OFFSET).toBe(104);
    expect(EXPECTED_VOUCHER_SIZE).toBe(154);
  });
});
