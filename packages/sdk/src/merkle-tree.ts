/**
 * Incremental Poseidon Merkle tree that mirrors the on-chain `MerkleTreeState`.
 */

import { poseidonHash2 } from "./crypto/poseidon";
import { TREE_HEIGHT } from "./constants";
import type { MerkleProof } from "./types";

export class MerkleTree {
  /** Tree depth (number of hashing levels). */
  height: number;
  /** Number of leaves inserted so far. */
  leafCount: number;
  /** Filled subtree digests (used for incremental insertion). */
  filledSubtrees: bigint[];
  /** Pre-computed empty-subtree digests at each level. */
  emptyHashes: bigint[];
  /** Current Merkle root. */
  root: bigint;

  /** Dense array of all inserted leaves (for proof generation). */
  private leaves: bigint[];

  // -----------------------------------------------------------------------
  // Construction
  // -----------------------------------------------------------------------

  private constructor(height: number) {
    this.height = height;
    this.leafCount = 0;
    this.filledSubtrees = new Array(height).fill(0n);
    this.emptyHashes = new Array(height).fill(0n);
    this.root = 0n;
    this.leaves = [];
  }

  /**
   * Create and initialise a new empty Merkle tree.
   *
   * The empty-hash ladder is computed exactly the same way as the on-chain
   * `initialize_tree` instruction, ensuring the roots always match.
   *
   * @param height - Tree depth (defaults to {@link TREE_HEIGHT}).
   */
  static async create(height: number = TREE_HEIGHT): Promise<MerkleTree> {
    const tree = new MerkleTree(height);

    let current = 0n;
    for (let i = 0; i < height; i++) {
      tree.emptyHashes[i] = current;
      tree.filledSubtrees[i] = current;
      current = await poseidonHash2(current, current);
    }
    tree.root = current;

    return tree;
  }

  // -----------------------------------------------------------------------
  // Mutation
  // -----------------------------------------------------------------------

  /**
   * Insert a leaf (commitment) into the next available slot.
   *
   * @returns The leaf index that was assigned.
   * @throws If the tree is full.
   */
  async insert(commitment: bigint): Promise<number> {
    const index = this.leafCount;
    if (index >= 2 ** this.height) {
      throw new Error("Merkle tree is full");
    }

    this.leaves.push(commitment);
    let currentHash = commitment;

    for (let level = 0; level < this.height; level++) {
      if (((index >> level) & 1) === 0) {
        // Left child
        this.filledSubtrees[level] = currentHash;
        const right = this.emptyHashes[level];
        currentHash = await poseidonHash2(currentHash, right);
      } else {
        // Right child
        const left = this.filledSubtrees[level];
        currentHash = await poseidonHash2(left, currentHash);
      }
    }

    this.root = currentHash;
    this.leafCount++;

    return index;
  }

  // -----------------------------------------------------------------------
  // Queries
  // -----------------------------------------------------------------------

  /**
   * Generate a Merkle inclusion proof for the leaf at `leafIndex`.
   *
   * The proof consists of:
   * - `pathElements` – sibling hashes at each level
   * - `pathIndices` – 0 if the node is a left child, 1 if right
   */
  async getProof(leafIndex: number): Promise<MerkleProof> {
    if (leafIndex >= this.leafCount) {
      throw new Error(
        `Leaf index ${leafIndex} out of range (count: ${this.leafCount})`,
      );
    }

    const pathElements: bigint[] = [];
    const pathIndices: number[] = [];

    // Rebuild the full tree level-by-level so we can read siblings.
    let currentLevel = new Array(2 ** this.height).fill(0n) as bigint[];
    for (let i = 0; i < this.leafCount; i++) {
      currentLevel[i] = this.leaves[i];
    }

    let idx = leafIndex;
    for (let level = 0; level < this.height; level++) {
      const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
      pathElements.push(currentLevel[siblingIdx] ?? 0n);
      pathIndices.push(idx % 2);

      // Hash pairs to compute the next level
      const nextLevelSize = currentLevel.length / 2;
      const nextLevel = new Array(nextLevelSize).fill(0n) as bigint[];
      for (let i = 0; i < nextLevelSize; i++) {
        const left = currentLevel[2 * i];
        const right = currentLevel[2 * i + 1];
        nextLevel[i] = await poseidonHash2(left, right);
      }
      currentLevel = nextLevel;
      idx = Math.floor(idx / 2);
    }

    return { pathElements, pathIndices };
  }

  /** Return the current Merkle root. */
  getRoot(): bigint {
    return this.root;
  }

  /**
   * Return the commitment stored at `index`.
   *
   * @throws If `index` is out of range.
   */
  getLeaf(index: number): bigint {
    if (index >= this.leafCount) {
      throw new Error(`Leaf index ${index} out of range`);
    }
    return this.leaves[index];
  }
}
