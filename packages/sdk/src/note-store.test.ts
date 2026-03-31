import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { randomBytes } from "crypto";
import { MemoryNoteStore, FileNoteStore } from "./note-store";
import type { StoredNote } from "./types";

function makeNote(overrides: Partial<StoredNote> = {}): StoredNote {
  return {
    amount: 1_000_000n,
    asset: 42n,
    secret: 111n,
    blinding: 222n,
    memo: [0n, 0n, 0n, 0n],
    commitment: BigInt("0x" + randomBytes(16).toString("hex")),
    nullifier: BigInt("0x" + randomBytes(16).toString("hex")),
    leafIndex: 0,
    ...overrides,
  };
}

// ==========================================================================
// MemoryNoteStore
// ==========================================================================

describe("MemoryNoteStore", () => {
  let store: MemoryNoteStore;

  beforeEach(() => {
    store = new MemoryNoteStore();
  });

  it("starts with zero balance", async () => {
    expect(await store.getBalance()).toBe(0n);
  });

  it("starts with no notes", async () => {
    expect(await store.getAll()).toEqual([]);
    expect(await store.getUnspent()).toEqual([]);
  });

  it("saves and retrieves a note", async () => {
    const note = makeNote();
    await store.save(note);
    const retrieved = await store.getByCommitment(note.commitment);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.amount).toBe(note.amount);
    expect(retrieved!.commitment).toBe(note.commitment);
  });

  it("getByCommitment returns null for unknown commitment", async () => {
    expect(await store.getByCommitment(999n)).toBeNull();
  });

  it("tracks balance across multiple notes", async () => {
    await store.save(makeNote({ amount: 100n, commitment: 1n }));
    await store.save(makeNote({ amount: 200n, commitment: 2n }));
    expect(await store.getBalance()).toBe(300n);
  });

  it("getUnspent returns only unspent notes", async () => {
    const note1 = makeNote({ commitment: 10n });
    const note2 = makeNote({ commitment: 20n });
    await store.save(note1);
    await store.save(note2);
    await store.markSpent(10n, "tx-sig-1");
    const unspent = await store.getUnspent();
    expect(unspent.length).toBe(1);
    expect(unspent[0].commitment).toBe(20n);
  });

  it("markSpent reduces balance", async () => {
    await store.save(makeNote({ amount: 500n, commitment: 1n }));
    await store.save(makeNote({ amount: 300n, commitment: 2n }));
    expect(await store.getBalance()).toBe(800n);
    await store.markSpent(1n, "sig");
    expect(await store.getBalance()).toBe(300n);
  });

  it("markSpent throws on unknown commitment", async () => {
    await expect(store.markSpent(999n, "sig")).rejects.toThrow("not found");
  });

  it("getAll returns all notes including spent", async () => {
    await store.save(makeNote({ commitment: 1n }));
    await store.save(makeNote({ commitment: 2n }));
    await store.markSpent(1n, "sig");
    expect((await store.getAll()).length).toBe(2);
  });
});

// ==========================================================================
// FileNoteStore
// ==========================================================================

describe("FileNoteStore", () => {
  const testFile = join(
    tmpdir(),
    `zera-test-notes-${Date.now()}-${Math.random().toString(36).slice(2)}.enc`,
  );
  const password = "test-password-123";

  afterEach(() => {
    if (existsSync(testFile)) {
      unlinkSync(testFile);
    }
  });

  it("starts empty when file does not exist", async () => {
    const store = new FileNoteStore(testFile, password);
    expect(await store.getBalance()).toBe(0n);
    expect(await store.getAll()).toEqual([]);
  });

  it("saves a note and persists to disk", async () => {
    const store = new FileNoteStore(testFile, password);
    const note = makeNote({ commitment: 42n });
    await store.save(note);
    expect(existsSync(testFile)).toBe(true);
  });

  it("round-trips note data through encryption", async () => {
    // Write with one store instance
    const store1 = new FileNoteStore(testFile, password);
    const note = makeNote({
      amount: 12345n,
      asset: 67n,
      secret: 111n,
      blinding: 222n,
      commitment: 42n,
      nullifier: 84n,
      leafIndex: 7,
    });
    await store1.save(note);

    // Read with a fresh instance (forces disk read + decrypt)
    const store2 = new FileNoteStore(testFile, password);
    const retrieved = await store2.getByCommitment(42n);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.amount).toBe(12345n);
    expect(retrieved!.asset).toBe(67n);
    expect(retrieved!.secret).toBe(111n);
    expect(retrieved!.blinding).toBe(222n);
    expect(retrieved!.nullifier).toBe(84n);
    expect(retrieved!.leafIndex).toBe(7);
  });

  it("fails to decrypt with wrong password", async () => {
    const store1 = new FileNoteStore(testFile, password);
    await store1.save(makeNote({ commitment: 1n }));

    const store2 = new FileNoteStore(testFile, "wrong-password");
    await expect(store2.getAll()).rejects.toThrow();
  });

  it("persists spent state", async () => {
    const store1 = new FileNoteStore(testFile, password);
    await store1.save(makeNote({ amount: 100n, commitment: 1n }));
    await store1.save(makeNote({ amount: 200n, commitment: 2n }));
    await store1.markSpent(1n, "sig-1");

    const store2 = new FileNoteStore(testFile, password);
    expect(await store2.getBalance()).toBe(200n);
    const unspent = await store2.getUnspent();
    expect(unspent.length).toBe(1);
    expect(unspent[0].commitment).toBe(2n);
  });

  it("handles multiple saves correctly", async () => {
    const store = new FileNoteStore(testFile, password);
    for (let i = 0; i < 5; i++) {
      await store.save(makeNote({ amount: BigInt(i + 1) * 100n, commitment: BigInt(i) }));
    }
    expect(await store.getBalance()).toBe(1500n);
    expect((await store.getAll()).length).toBe(5);
  });
});
