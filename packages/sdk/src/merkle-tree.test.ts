import { describe, it, expect } from "vitest";
import { MerkleTree } from "./merkle-tree";
import { poseidonHash2 } from "./crypto/poseidon";

// Use a small tree height for fast tests
const SMALL_HEIGHT = 4;

describe("MerkleTree", () => {
  describe("create", () => {
    it("creates a tree with the specified height", async () => {
      const tree = await MerkleTree.create(SMALL_HEIGHT);
      expect(tree.height).toBe(SMALL_HEIGHT);
      expect(tree.leafCount).toBe(0);
    });

    it("initializes empty hashes correctly", async () => {
      const tree = await MerkleTree.create(SMALL_HEIGHT);
      // emptyHashes[0] should be 0 (empty leaf)
      expect(tree.emptyHashes[0]).toBe(0n);
      // emptyHashes[1] should be hash(0, 0)
      const expected1 = await poseidonHash2(0n, 0n);
      expect(tree.emptyHashes[1]).toBe(expected1);
    });

    it("root of empty tree matches the top-level empty hash", async () => {
      const tree = await MerkleTree.create(SMALL_HEIGHT);
      // Root = hash(hash(...(hash(0,0), hash(0,0))...)) at height levels
      let expected = 0n;
      for (let i = 0; i < SMALL_HEIGHT; i++) {
        expected = await poseidonHash2(expected, expected);
      }
      expect(tree.getRoot()).toBe(expected);
    });
  });

  describe("insert", () => {
    it("returns sequential leaf indices", async () => {
      const tree = await MerkleTree.create(SMALL_HEIGHT);
      expect(await tree.insert(100n)).toBe(0);
      expect(await tree.insert(200n)).toBe(1);
      expect(await tree.insert(300n)).toBe(2);
      expect(tree.leafCount).toBe(3);
    });

    it("changes the root after insertion", async () => {
      const tree = await MerkleTree.create(SMALL_HEIGHT);
      const rootBefore = tree.getRoot();
      await tree.insert(42n);
      expect(tree.getRoot()).not.toBe(rootBefore);
    });

    it("produces deterministic roots", async () => {
      const tree1 = await MerkleTree.create(SMALL_HEIGHT);
      const tree2 = await MerkleTree.create(SMALL_HEIGHT);
      await tree1.insert(10n);
      await tree1.insert(20n);
      await tree2.insert(10n);
      await tree2.insert(20n);
      expect(tree1.getRoot()).toBe(tree2.getRoot());
    });

    it("throws when tree is full", async () => {
      const tree = await MerkleTree.create(2); // capacity = 4
      await tree.insert(1n);
      await tree.insert(2n);
      await tree.insert(3n);
      await tree.insert(4n);
      await expect(tree.insert(5n)).rejects.toThrow("Merkle tree is full");
    });
  });

  describe("getLeaf", () => {
    it("returns the commitment at the given index", async () => {
      const tree = await MerkleTree.create(SMALL_HEIGHT);
      await tree.insert(111n);
      await tree.insert(222n);
      expect(tree.getLeaf(0)).toBe(111n);
      expect(tree.getLeaf(1)).toBe(222n);
    });

    it("throws for out-of-range index", async () => {
      const tree = await MerkleTree.create(SMALL_HEIGHT);
      expect(() => tree.getLeaf(0)).toThrow("out of range");
    });
  });

  describe("getProof", () => {
    it("returns path with correct length", async () => {
      const tree = await MerkleTree.create(SMALL_HEIGHT);
      await tree.insert(42n);
      const proof = await tree.getProof(0);
      expect(proof.pathElements.length).toBe(SMALL_HEIGHT);
      expect(proof.pathIndices.length).toBe(SMALL_HEIGHT);
    });

    it("first leaf has pathIndices all zeros", async () => {
      const tree = await MerkleTree.create(SMALL_HEIGHT);
      await tree.insert(42n);
      const proof = await tree.getProof(0);
      expect(proof.pathIndices.every((i) => i === 0)).toBe(true);
    });

    it("second leaf has pathIndices[0] = 1", async () => {
      const tree = await MerkleTree.create(SMALL_HEIGHT);
      await tree.insert(10n);
      await tree.insert(20n);
      const proof = await tree.getProof(1);
      expect(proof.pathIndices[0]).toBe(1);
    });

    it("proof can reconstruct the root (height=2 tree)", async () => {
      const tree = await MerkleTree.create(2);
      await tree.insert(10n);
      await tree.insert(20n);

      const proof = await tree.getProof(0);
      // Manually reconstruct root from leaf 0
      let current = 10n;
      for (let i = 0; i < proof.pathElements.length; i++) {
        if (proof.pathIndices[i] === 0) {
          current = await poseidonHash2(current, proof.pathElements[i]);
        } else {
          current = await poseidonHash2(proof.pathElements[i], current);
        }
      }
      expect(current).toBe(tree.getRoot());
    });

    it("proof for second leaf also reconstructs the root", async () => {
      const tree = await MerkleTree.create(2);
      await tree.insert(10n);
      await tree.insert(20n);

      const proof = await tree.getProof(1);
      let current = 20n;
      for (let i = 0; i < proof.pathElements.length; i++) {
        if (proof.pathIndices[i] === 0) {
          current = await poseidonHash2(current, proof.pathElements[i]);
        } else {
          current = await poseidonHash2(proof.pathElements[i], current);
        }
      }
      expect(current).toBe(tree.getRoot());
    });

    it("throws for out-of-range leaf index", async () => {
      const tree = await MerkleTree.create(SMALL_HEIGHT);
      await tree.insert(1n);
      await expect(tree.getProof(1)).rejects.toThrow("out of range");
    });
  });
});
