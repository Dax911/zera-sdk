import { describe, it, expect } from "vitest";
import {
  bigintToBytes32BE,
  bytes32BEToBigint,
  fieldToSolanaBytes,
  formatPublicInputsForSolana,
  formatProofForSolana,
} from "./utils";
import { BN254_BASE_FIELD_PRIME } from "./constants";

describe("bigintToBytes32BE / bytes32BEToBigint", () => {
  it("round-trips zero", () => {
    const bytes = bigintToBytes32BE(0n);
    expect(bytes.length).toBe(32);
    expect(bytes32BEToBigint(bytes)).toBe(0n);
  });

  it("round-trips 1", () => {
    const bytes = bigintToBytes32BE(1n);
    expect(bytes[31]).toBe(1);
    expect(bytes32BEToBigint(bytes)).toBe(1n);
  });

  it("round-trips max 256-bit value", () => {
    const max = (1n << 256n) - 1n;
    const bytes = bigintToBytes32BE(max);
    expect(bytes.every((b) => b === 0xff)).toBe(true);
    expect(bytes32BEToBigint(bytes)).toBe(max);
  });

  it("encodes big-endian (MSB first)", () => {
    const value = 0xdead_beefn;
    const bytes = bigintToBytes32BE(value);
    expect(bytes[28]).toBe(0xde);
    expect(bytes[29]).toBe(0xad);
    expect(bytes[30]).toBe(0xbe);
    expect(bytes[31]).toBe(0xef);
  });
});

describe("fieldToSolanaBytes", () => {
  it("returns a number[] of length 32", () => {
    const arr = fieldToSolanaBytes(42n);
    expect(Array.isArray(arr)).toBe(true);
    expect(arr.length).toBe(32);
    expect(arr.every((v) => typeof v === "number")).toBe(true);
  });

  it("matches bigintToBytes32BE content", () => {
    const value = 123456789n;
    const uint8 = bigintToBytes32BE(value);
    const numArr = fieldToSolanaBytes(value);
    expect(numArr).toEqual(Array.from(uint8));
  });
});

describe("formatPublicInputsForSolana", () => {
  it("converts string signals to Uint8Array[]", () => {
    const signals = ["42", "100", "0"];
    const result = formatPublicInputsForSolana(signals);
    expect(result.length).toBe(3);
    result.forEach((buf) => {
      expect(buf).toBeInstanceOf(Uint8Array);
      expect(buf.length).toBe(32);
    });
  });

  it("correctly encodes signal values", () => {
    const result = formatPublicInputsForSolana(["255"]);
    expect(result[0][31]).toBe(255);
  });
});

describe("formatProofForSolana", () => {
  // Construct a mock snarkjs proof
  const mockProof = {
    pi_a: ["100", "200", "1"],
    pi_b: [
      ["300", "400"],
      ["500", "600"],
    ],
    pi_c: ["700", "800", "1"],
  };

  it("returns proofA, proofB, proofC byte arrays", () => {
    const result = formatProofForSolana(mockProof);
    expect(result.proofA).toBeInstanceOf(Uint8Array);
    expect(result.proofB).toBeInstanceOf(Uint8Array);
    expect(result.proofC).toBeInstanceOf(Uint8Array);
  });

  it("proofA is 64 bytes", () => {
    const result = formatProofForSolana(mockProof);
    expect(result.proofA.length).toBe(64);
  });

  it("proofB is 128 bytes", () => {
    const result = formatProofForSolana(mockProof);
    expect(result.proofB.length).toBe(128);
  });

  it("proofC is 64 bytes", () => {
    const result = formatProofForSolana(mockProof);
    expect(result.proofC.length).toBe(64);
  });

  it("proofA negates the y-coordinate", () => {
    const result = formatProofForSolana(mockProof);
    // proofA[0..32] = x = 100
    const x = bytes32BEToBigint(result.proofA.slice(0, 32));
    expect(x).toBe(100n);
    // proofA[32..64] = p - y = p - 200
    const negY = bytes32BEToBigint(result.proofA.slice(32, 64));
    expect(negY).toBe(BN254_BASE_FIELD_PRIME - 200n);
  });

  it("proofB reverses coordinate pairs", () => {
    const result = formatProofForSolana(mockProof);
    // pi_b[0] = [300, 400] -> reversed: bx1=400, bx2=300
    const bx1 = bytes32BEToBigint(result.proofB.slice(0, 32));
    const bx2 = bytes32BEToBigint(result.proofB.slice(32, 64));
    expect(bx1).toBe(400n);
    expect(bx2).toBe(300n);
    // pi_b[1] = [500, 600] -> reversed: by1=600, by2=500
    const by1 = bytes32BEToBigint(result.proofB.slice(64, 96));
    const by2 = bytes32BEToBigint(result.proofB.slice(96, 128));
    expect(by1).toBe(600n);
    expect(by2).toBe(500n);
  });

  it("proofC is direct encoding", () => {
    const result = formatProofForSolana(mockProof);
    const cx = bytes32BEToBigint(result.proofC.slice(0, 32));
    const cy = bytes32BEToBigint(result.proofC.slice(32, 64));
    expect(cx).toBe(700n);
    expect(cy).toBe(800n);
  });
});
