import { describe, it, expect, vi } from "vitest";
import { createNote, computeCommitment, computeNullifier } from "./note";
import { MerkleTree } from "./merkle-tree";

// Mock snarkjs since we don't have circuit artifacts
vi.mock("snarkjs", () => ({
  groth16: {
    fullProve: vi.fn().mockResolvedValue({
      proof: {
        pi_a: ["100", "200", "1"],
        pi_b: [
          ["300", "400"],
          ["500", "600"],
        ],
        pi_c: ["700", "800", "1"],
      },
      publicSignals: ["42", "99"],
    }),
  },
}));

// Import after mock
import {
  generateDepositProof,
  generateWithdrawProof,
  generateTransferProof,
} from "./prover";
import * as snarkjs from "snarkjs";

describe("generateDepositProof", () => {
  it("computes the commitment and calls snarkjs", async () => {
    const note = createNote(1_000_000n, 42n);
    const result = await generateDepositProof(note, "fake.wasm", "fake.zkey");

    expect(result.commitment).toBe(await computeCommitment(note));
    expect(result.publicSignals).toEqual(["42", "99"]);
    expect(result.proof.proofA).toBeInstanceOf(Uint8Array);
    expect(result.proof.proofB).toBeInstanceOf(Uint8Array);
    expect(result.proof.proofC).toBeInstanceOf(Uint8Array);
  });

  it("passes correct witness inputs to snarkjs", async () => {
    const note = createNote(500n, 10n);
    const commitment = await computeCommitment(note);
    await generateDepositProof(note, "w.wasm", "k.zkey");

    const call = vi.mocked(snarkjs.groth16.fullProve).mock.lastCall!;
    const input = call[0] as Record<string, unknown>;
    expect(input.publicAmount).toBe(note.amount.toString());
    expect(input.publicAsset).toBe(note.asset.toString());
    expect(input.outputCommitment).toBe(commitment.toString());
    expect(input.secret).toBe(note.secret.toString());
    expect(input.blinding).toBe(note.blinding.toString());
    expect(call[1]).toBe("w.wasm");
    expect(call[2]).toBe("k.zkey");
  });
});

describe("generateWithdrawProof", () => {
  it("computes nullifier and passes Merkle proof to snarkjs", async () => {
    const note = createNote(1_000n, 5n);
    const tree = await MerkleTree.create(4);
    const commitment = await computeCommitment(note);
    await tree.insert(commitment);

    const result = await generateWithdrawProof(
      note,
      0,
      tree,
      12345n,
      "w.wasm",
      "k.zkey",
    );

    const expectedNullifier = await computeNullifier(note.secret, commitment);
    expect(result.nullifierHash).toBe(expectedNullifier);
    expect(result.publicSignals).toEqual(["42", "99"]);
    expect(result.proof.proofA.length).toBe(64);
  });

  it("passes pathElements and pathIndices in the witness", async () => {
    const note = createNote(1_000n, 5n);
    const tree = await MerkleTree.create(4);
    const commitment = await computeCommitment(note);
    await tree.insert(commitment);

    await generateWithdrawProof(note, 0, tree, 99n, "w.wasm", "k.zkey");

    const call = vi.mocked(snarkjs.groth16.fullProve).mock.lastCall!;
    const input = call[0] as Record<string, unknown>;
    expect(input.root).toBe(tree.root.toString());
    expect(input.recipient).toBe("99");
    expect(Array.isArray(input.pathElements)).toBe(true);
    expect(Array.isArray(input.pathIndices)).toBe(true);
    expect((input.pathElements as string[]).length).toBe(4);
  });
});

describe("generateTransferProof", () => {
  it("computes input nullifier and output commitments", async () => {
    const inputNote = createNote(1_000n, 5n);
    const tree = await MerkleTree.create(4);
    const inCommitment = await computeCommitment(inputNote);
    await tree.insert(inCommitment);

    const out1 = createNote(600n, 5n);
    const out2 = createNote(400n, 5n);

    const result = await generateTransferProof(
      inputNote,
      0,
      tree,
      out1,
      out2,
      "w.wasm",
      "k.zkey",
    );

    const expectedNullifier = await computeNullifier(
      inputNote.secret,
      inCommitment,
    );
    expect(result.nullifierHash).toBe(expectedNullifier);
    expect(result.outputCommitment1).toBe(await computeCommitment(out1));
    expect(result.outputCommitment2).toBe(await computeCommitment(out2));
    expect(result.proof.proofA.length).toBe(64);
  });

  it("passes all note fields in the witness", async () => {
    const inputNote = createNote(1_000n, 5n);
    const tree = await MerkleTree.create(4);
    await tree.insert(await computeCommitment(inputNote));

    const out1 = createNote(700n, 5n);
    const out2 = createNote(300n, 5n);

    await generateTransferProof(
      inputNote,
      0,
      tree,
      out1,
      out2,
      "w.wasm",
      "k.zkey",
    );

    const call = vi.mocked(snarkjs.groth16.fullProve).mock.lastCall!;
    const input = call[0] as Record<string, unknown>;
    expect(input.inAmount).toBe(inputNote.amount.toString());
    expect(input.outAmount1).toBe(out1.amount.toString());
    expect(input.outAmount2).toBe(out2.amount.toString());
    expect(input.inAsset).toBe(inputNote.asset.toString());
    expect(Array.isArray(input.pathElements)).toBe(true);
  });
});
