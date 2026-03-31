import { describe, it, expect } from "vitest";
import {
  createNote,
  computeCommitment,
  computeNullifier,
  hashPubkeyToField,
} from "./note";
import { BN254_PRIME } from "./constants";

describe("createNote", () => {
  it("returns a note with the specified amount and asset", () => {
    const note = createNote(1_000_000n, 42n);
    expect(note.amount).toBe(1_000_000n);
    expect(note.asset).toBe(42n);
  });

  it("generates random secret and blinding", () => {
    const a = createNote(100n, 1n);
    const b = createNote(100n, 1n);
    expect(a.secret).not.toBe(b.secret);
    expect(a.blinding).not.toBe(b.blinding);
  });

  it("secret and blinding are within BN254 field", () => {
    const note = createNote(100n, 1n);
    expect(note.secret).toBeGreaterThanOrEqual(0n);
    expect(note.secret).toBeLessThan(BN254_PRIME);
    expect(note.blinding).toBeGreaterThanOrEqual(0n);
    expect(note.blinding).toBeLessThan(BN254_PRIME);
  });

  it("defaults memo to [0,0,0,0]", () => {
    const note = createNote(100n, 1n);
    expect(note.memo).toEqual([0n, 0n, 0n, 0n]);
  });

  it("accepts a custom memo", () => {
    const memo: [bigint, bigint, bigint, bigint] = [1n, 2n, 3n, 4n];
    const note = createNote(100n, 1n, memo);
    expect(note.memo).toEqual(memo);
  });
});

describe("computeCommitment", () => {
  it("returns a deterministic bigint for the same note", async () => {
    const note = createNote(500n, 10n);
    const a = await computeCommitment(note);
    const b = await computeCommitment(note);
    expect(a).toBe(b);
  });

  it("result is within BN254 field", async () => {
    const note = createNote(1000n, 5n);
    const commitment = await computeCommitment(note);
    expect(commitment).toBeGreaterThanOrEqual(0n);
    expect(commitment).toBeLessThan(BN254_PRIME);
  });

  it("different notes produce different commitments", async () => {
    const a = await computeCommitment(createNote(100n, 1n));
    const b = await computeCommitment(createNote(200n, 1n));
    expect(a).not.toBe(b);
  });

  it("memo affects the commitment", async () => {
    const base = createNote(100n, 1n);
    const withMemo = { ...base, memo: [1n, 0n, 0n, 0n] as [bigint, bigint, bigint, bigint] };
    const a = await computeCommitment(base);
    const b = await computeCommitment(withMemo);
    // memo[0] differs so commitment should differ (unless the default memo was already [1,0,0,0])
    if (base.memo[0] !== 1n) {
      expect(a).not.toBe(b);
    }
  });
});

describe("computeNullifier", () => {
  it("returns a deterministic bigint", async () => {
    const note = createNote(100n, 1n);
    const commitment = await computeCommitment(note);
    const a = await computeNullifier(note.secret, commitment);
    const b = await computeNullifier(note.secret, commitment);
    expect(a).toBe(b);
  });

  it("result is within BN254 field", async () => {
    const note = createNote(100n, 1n);
    const commitment = await computeCommitment(note);
    const nullifier = await computeNullifier(note.secret, commitment);
    expect(nullifier).toBeGreaterThanOrEqual(0n);
    expect(nullifier).toBeLessThan(BN254_PRIME);
  });

  it("different secrets produce different nullifiers", async () => {
    const note1 = createNote(100n, 1n);
    const note2 = createNote(100n, 1n);
    const commitment = await computeCommitment(note1);
    const n1 = await computeNullifier(note1.secret, commitment);
    const n2 = await computeNullifier(note2.secret, commitment);
    expect(n1).not.toBe(n2);
  });
});

describe("hashPubkeyToField", () => {
  it("returns a value within BN254 field", async () => {
    const bytes = new Uint8Array(32).fill(0xff);
    const field = await hashPubkeyToField(bytes);
    expect(field).toBeGreaterThanOrEqual(0n);
    expect(field).toBeLessThan(BN254_PRIME);
  });

  it("zero bytes produce zero", async () => {
    const bytes = new Uint8Array(32).fill(0);
    const field = await hashPubkeyToField(bytes);
    expect(field).toBe(0n);
  });

  it("is deterministic", async () => {
    const bytes = new Uint8Array(32);
    bytes[0] = 0xab;
    bytes[31] = 0xcd;
    const a = await hashPubkeyToField(bytes);
    const b = await hashPubkeyToField(bytes);
    expect(a).toBe(b);
  });
});
