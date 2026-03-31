import { describe, it, expect } from "vitest";
import { PublicKey } from "@solana/web3.js";
import {
  derivePoolConfig,
  deriveMerkleTree,
  deriveVault,
  deriveFeeVault,
  deriveNullifier,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "./pda";
import { USDC_MINT, SHIELDED_POOL_PROGRAM_ID } from "./constants";

const USDC = new PublicKey(USDC_MINT);
const PROGRAM = new PublicKey(SHIELDED_POOL_PROGRAM_ID);

describe("PDA derivation", () => {
  describe("derivePoolConfig", () => {
    it("returns a PublicKey and bump", () => {
      const [pda, bump] = derivePoolConfig(USDC);
      expect(pda).toBeInstanceOf(PublicKey);
      expect(typeof bump).toBe("number");
      expect(bump).toBeGreaterThanOrEqual(0);
      expect(bump).toBeLessThanOrEqual(255);
    });

    it("is deterministic", () => {
      const [a] = derivePoolConfig(USDC);
      const [b] = derivePoolConfig(USDC);
      expect(a.equals(b)).toBe(true);
    });

    it("differs for different mints", () => {
      const otherMint = new PublicKey(
        "So11111111111111111111111111111111111111112",
      );
      const [a] = derivePoolConfig(USDC);
      const [b] = derivePoolConfig(otherMint);
      expect(a.equals(b)).toBe(false);
    });

    it("matches manual derivation", () => {
      const [expected] = PublicKey.findProgramAddressSync(
        [Buffer.from("pool_config"), USDC.toBuffer()],
        PROGRAM,
      );
      const [derived] = derivePoolConfig(USDC);
      expect(derived.equals(expected)).toBe(true);
    });
  });

  describe("deriveMerkleTree", () => {
    it("returns a valid PDA", () => {
      const [pda, bump] = deriveMerkleTree(USDC);
      expect(pda).toBeInstanceOf(PublicKey);
      expect(bump).toBeGreaterThanOrEqual(0);
    });

    it("matches manual derivation", () => {
      const [expected] = PublicKey.findProgramAddressSync(
        [Buffer.from("merkle_tree"), USDC.toBuffer()],
        PROGRAM,
      );
      const [derived] = deriveMerkleTree(USDC);
      expect(derived.equals(expected)).toBe(true);
    });
  });

  describe("deriveVault", () => {
    it("matches manual derivation", () => {
      const [expected] = PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), USDC.toBuffer()],
        PROGRAM,
      );
      const [derived] = deriveVault(USDC);
      expect(derived.equals(expected)).toBe(true);
    });
  });

  describe("deriveFeeVault", () => {
    it("matches manual derivation", () => {
      const [expected] = PublicKey.findProgramAddressSync(
        [Buffer.from("fee_vault"), USDC.toBuffer()],
        PROGRAM,
      );
      const [derived] = deriveFeeVault(USDC);
      expect(derived.equals(expected)).toBe(true);
    });
  });

  describe("deriveNullifier", () => {
    it("derives a PDA from a nullifier hash", () => {
      const [pda, bump] = deriveNullifier(12345n);
      expect(pda).toBeInstanceOf(PublicKey);
      expect(bump).toBeGreaterThanOrEqual(0);
    });

    it("is deterministic", () => {
      const [a] = deriveNullifier(99999n);
      const [b] = deriveNullifier(99999n);
      expect(a.equals(b)).toBe(true);
    });

    it("differs for different nullifier hashes", () => {
      const [a] = deriveNullifier(1n);
      const [b] = deriveNullifier(2n);
      expect(a.equals(b)).toBe(false);
    });
  });

  describe("getAssociatedTokenAddress", () => {
    it("returns a PublicKey", () => {
      const owner = PublicKey.unique();
      const ata = getAssociatedTokenAddress(USDC, owner);
      expect(ata).toBeInstanceOf(PublicKey);
    });

    it("is deterministic", () => {
      const owner = PublicKey.unique();
      const a = getAssociatedTokenAddress(USDC, owner);
      const b = getAssociatedTokenAddress(USDC, owner);
      expect(a.equals(b)).toBe(true);
    });

    it("matches standard ATA derivation", () => {
      const owner = PublicKey.unique();
      const [expected] = PublicKey.findProgramAddressSync(
        [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), USDC.toBuffer()],
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );
      const derived = getAssociatedTokenAddress(USDC, owner);
      expect(derived.equals(expected)).toBe(true);
    });
  });
});
