import { describe, it, expect } from "vitest";
import {
  getPoseidon,
  poseidonHash,
  poseidonHash2,
  fieldToBytes32BE,
  bytes32BEToField,
} from "./poseidon";

describe("poseidon", () => {
  it("getPoseidon returns a usable instance", async () => {
    const poseidon = await getPoseidon();
    expect(poseidon).toBeDefined();
    expect(typeof poseidon).toBe("function");
  });

  it("getPoseidon returns the same singleton", async () => {
    const a = await getPoseidon();
    const b = await getPoseidon();
    expect(a).toBe(b);
  });

  it("poseidonHash of [0n] produces a deterministic nonzero result", async () => {
    const hash = await poseidonHash([0n]);
    expect(typeof hash).toBe("bigint");
    expect(hash).toBeGreaterThan(0n);
  });

  it("poseidonHash is deterministic", async () => {
    const a = await poseidonHash([1n, 2n, 3n]);
    const b = await poseidonHash([1n, 2n, 3n]);
    expect(a).toBe(b);
  });

  it("poseidonHash varies with different inputs", async () => {
    const a = await poseidonHash([1n, 2n]);
    const b = await poseidonHash([2n, 1n]);
    expect(a).not.toBe(b);
  });

  it("poseidonHash2 matches poseidonHash with two args", async () => {
    const fromHash2 = await poseidonHash2(42n, 99n);
    const fromHash = await poseidonHash([42n, 99n]);
    expect(fromHash2).toBe(fromHash);
  });

  it("poseidonHash result is within BN254 scalar field", async () => {
    const BN254_PRIME = BigInt(
      "21888242871839275222246405745257275088548364400416034343698204186575808495617",
    );
    const hash = await poseidonHash([123456789n, 987654321n]);
    expect(hash).toBeGreaterThanOrEqual(0n);
    expect(hash).toBeLessThan(BN254_PRIME);
  });
});

describe("fieldToBytes32BE / bytes32BEToField", () => {
  it("round-trips zero", () => {
    const bytes = fieldToBytes32BE(0n);
    expect(bytes.length).toBe(32);
    expect(bytes.every((b) => b === 0)).toBe(true);
    expect(bytes32BEToField(bytes)).toBe(0n);
  });

  it("round-trips a small value", () => {
    const value = 255n;
    const bytes = fieldToBytes32BE(value);
    expect(bytes[31]).toBe(255);
    expect(bytes32BEToField(bytes)).toBe(value);
  });

  it("round-trips a large field element", () => {
    const value = BigInt(
      "21888242871839275222246405745257275088548364400416034343698204186575808495616",
    );
    const bytes = fieldToBytes32BE(value);
    expect(bytes.length).toBe(32);
    expect(bytes32BEToField(bytes)).toBe(value);
  });

  it("encodes in big-endian order", () => {
    const value = 0x0102n;
    const bytes = fieldToBytes32BE(value);
    expect(bytes[30]).toBe(0x01);
    expect(bytes[31]).toBe(0x02);
  });
});
