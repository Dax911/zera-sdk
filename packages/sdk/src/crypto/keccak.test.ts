import { describe, it, expect } from "vitest";
import { Keypair } from "@solana/web3.js";
import {
  computeKeccakCommitment,
  computeRecipientHash,
  generateRandomHex,
} from "./keccak";

describe("generateRandomHex", () => {
  it("returns a 0x-prefixed 64-char hex string", () => {
    const hex = generateRandomHex();
    expect(hex).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("produces different values on each call", () => {
    const a = generateRandomHex();
    const b = generateRandomHex();
    expect(a).not.toBe(b);
  });
});

describe("computeKeccakCommitment", () => {
  it("returns a 0x-prefixed 64-char hex digest", () => {
    const secret = generateRandomHex();
    const commitment = computeKeccakCommitment(secret);
    expect(commitment).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    const secret = "0x" + "ab".repeat(32);
    const a = computeKeccakCommitment(secret);
    const b = computeKeccakCommitment(secret);
    expect(a).toBe(b);
  });

  it("varies with different secrets", () => {
    const a = computeKeccakCommitment("0x" + "aa".repeat(32));
    const b = computeKeccakCommitment("0x" + "bb".repeat(32));
    expect(a).not.toBe(b);
  });

  it("accepts bare hex (without 0x prefix)", () => {
    const bare = "cc".repeat(32);
    const prefixed = "0x" + bare;
    expect(computeKeccakCommitment(bare)).toBe(
      computeKeccakCommitment(prefixed),
    );
  });

  it("throws on empty input", () => {
    expect(() => computeKeccakCommitment("")).toThrow("Secret is required");
  });

  it("throws on wrong-length hex", () => {
    expect(() => computeKeccakCommitment("0xaabb")).toThrow(
      "32-byte hex string",
    );
  });
});

describe("computeRecipientHash", () => {
  it("returns a 0x-prefixed 64-char hex digest", () => {
    const kp = Keypair.generate();
    const salt = generateRandomHex();
    const hash = computeRecipientHash(kp.publicKey.toBase58(), salt);
    expect(hash).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("is deterministic for same inputs", () => {
    const kp = Keypair.generate();
    const salt = "0x" + "dd".repeat(32);
    const a = computeRecipientHash(kp.publicKey.toBase58(), salt);
    const b = computeRecipientHash(kp.publicKey.toBase58(), salt);
    expect(a).toBe(b);
  });

  it("varies with different salts", () => {
    const kp = Keypair.generate();
    const a = computeRecipientHash(
      kp.publicKey.toBase58(),
      "0x" + "aa".repeat(32),
    );
    const b = computeRecipientHash(
      kp.publicKey.toBase58(),
      "0x" + "bb".repeat(32),
    );
    expect(a).not.toBe(b);
  });

  it("varies with different recipients", () => {
    const salt = "0x" + "ee".repeat(32);
    const a = computeRecipientHash(Keypair.generate().publicKey.toBase58(), salt);
    const b = computeRecipientHash(Keypair.generate().publicKey.toBase58(), salt);
    expect(a).not.toBe(b);
  });
});
