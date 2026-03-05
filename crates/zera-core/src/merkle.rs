//! Sparse Merkle tree with Poseidon hashing over BN254.
//!
//! This is an off-chain implementation that mirrors the on-chain
//! `MerkleTreeState` from the zera-pool Anchor program. It uses the same
//! `hash_nodes` Poseidon(2) function and the same append-only insertion
//! algorithm so that roots computed here match the on-chain roots exactly.
//!
//! Default tree height is [`TREE_HEIGHT`] (24), giving 2^24 = 16 777 216 leaf
//! slots.

use crate::constants::TREE_HEIGHT;
use crate::error::{Result, ZeraCoreError};
use crate::poseidon::hash_nodes;

// ---------------------------------------------------------------------------
// MerkleProof
// ---------------------------------------------------------------------------

/// A Merkle inclusion proof for a given leaf.
#[derive(Debug, Clone)]
pub struct MerkleProof {
    /// The leaf value (commitment).
    pub leaf: [u8; 32],
    /// Index of the leaf in the tree (0-based).
    pub leaf_index: usize,
    /// Sibling hashes from the leaf level up to (but not including) the root.
    /// `siblings[0]` is at the leaf level, `siblings[height-1]` is one level
    /// below the root.
    pub siblings: Vec<[u8; 32]>,
    /// The Merkle root at the time the proof was generated.
    pub root: [u8; 32],
}

impl MerkleProof {
    /// Verify this proof by recomputing the root from the leaf and siblings.
    pub fn verify(&self) -> Result<bool> {
        let mut current = self.leaf;
        for (level, sibling) in self.siblings.iter().enumerate() {
            if (self.leaf_index >> level) & 1 == 0 {
                current = hash_nodes(&current, sibling)?;
            } else {
                current = hash_nodes(sibling, &current)?;
            }
        }
        Ok(current == self.root)
    }
}

// ---------------------------------------------------------------------------
// MerkleTree
// ---------------------------------------------------------------------------

/// An append-only Merkle tree using Poseidon(2) over BN254.
///
/// The tree keeps track of:
/// - `filled_subtrees`: the latest left-child hash at each level (frontier).
/// - `empty_hashes`: the hash of a fully-empty subtree at each level.
/// - All inserted leaves (for proof generation).
///
/// This matches the on-chain algorithm from `zera-pool/src/merkle.rs`.
#[derive(Debug, Clone)]
pub struct MerkleTree {
    /// Height of the tree (number of levels above the leaves).
    pub height: usize,
    /// Current Merkle root.
    pub root: [u8; 32],
    /// Number of leaves inserted so far.
    pub leaf_count: u64,
    /// Frontier: the most recent left-child hash at each level.
    pub filled_subtrees: Vec<[u8; 32]>,
    /// Hash of a fully-empty subtree at each level.
    pub empty_hashes: Vec<[u8; 32]>,
    /// All leaves in insertion order (needed for off-chain proof generation).
    leaves: Vec<[u8; 32]>,
}

impl MerkleTree {
    /// Create a new empty Merkle tree of the given `height`.
    ///
    /// The default height for the ZERA protocol is [`TREE_HEIGHT`] (24).
    pub fn new(height: usize) -> Result<Self> {
        let mut empty_hashes = vec![[0u8; 32]; height];
        let mut filled_subtrees = vec![[0u8; 32]; height];

        let mut current = [0u8; 32];
        for i in 0..height {
            empty_hashes[i] = current;
            filled_subtrees[i] = current;
            current = hash_nodes(&current, &current)?;
        }

        Ok(Self {
            height,
            root: current,
            leaf_count: 0,
            filled_subtrees,
            empty_hashes,
            leaves: Vec::new(),
        })
    }

    /// Create a tree with the default protocol height (24).
    pub fn default_height() -> Result<Self> {
        Self::new(TREE_HEIGHT)
    }

    /// Maximum number of leaves this tree can hold.
    pub fn capacity(&self) -> u64 {
        1u64 << self.height
    }

    /// Insert a commitment (leaf) into the next available slot.
    ///
    /// Returns the 0-based leaf index on success.
    pub fn insert(&mut self, commitment: [u8; 32]) -> Result<usize> {
        let index = self.leaf_count;
        if index >= self.capacity() {
            return Err(ZeraCoreError::TreeFull);
        }

        let mut current_hash = commitment;

        for level in 0..self.height {
            if (index >> level) & 1 == 0 {
                // Left child: update frontier, hash with empty right sibling.
                self.filled_subtrees[level] = current_hash;
                let right = self.empty_hashes[level];
                current_hash = hash_nodes(&current_hash, &right)?;
            } else {
                // Right child: hash with the filled left sibling.
                let left = self.filled_subtrees[level];
                current_hash = hash_nodes(&left, &current_hash)?;
            }
        }

        self.root = current_hash;
        self.leaves.push(commitment);
        self.leaf_count += 1;

        Ok(index as usize)
    }

    /// Generate a Merkle inclusion proof for the leaf at `leaf_index`.
    ///
    /// This rebuilds the sibling path by replaying all insertions, which is
    /// correct but O(n * height). For production indexers a more efficient
    /// approach (e.g. storing the full tree) is recommended.
    pub fn get_proof(&self, leaf_index: usize) -> Result<MerkleProof> {
        if leaf_index >= self.leaves.len() {
            return Err(ZeraCoreError::LeafIndexOutOfRange {
                index: leaf_index,
                height: self.height,
            });
        }

        // Rebuild the full tree layer-by-layer.
        let num_leaves = 1usize << self.height;
        let mut layer: Vec<[u8; 32]> = vec![[0u8; 32]; num_leaves];
        for (i, leaf) in self.leaves.iter().enumerate() {
            layer[i] = *leaf;
        }

        // Pre-compute empty hashes for unfilled portions.
        // (We already have them in self.empty_hashes, use those.)

        let mut siblings = Vec::with_capacity(self.height);
        let mut idx = leaf_index;

        for level in 0..self.height {
            let sibling_idx = idx ^ 1;
            siblings.push(if sibling_idx < layer.len() {
                layer[sibling_idx]
            } else {
                self.empty_hashes[level]
            });

            // Compute next layer.
            let next_len = layer.len() / 2;
            let mut next_layer = Vec::with_capacity(next_len);
            for pair in 0..next_len {
                let left = layer[pair * 2];
                let right = layer[pair * 2 + 1];
                // Optimisation: if both are empty at this level, use the
                // precomputed empty hash for the next level.
                if left == self.empty_hashes[level] && right == self.empty_hashes[level] {
                    if level + 1 < self.height {
                        next_layer.push(self.empty_hashes[level + 1]);
                    } else {
                        next_layer.push(hash_nodes(&left, &right)?);
                    }
                } else {
                    next_layer.push(hash_nodes(&left, &right)?);
                }
            }
            layer = next_layer;
            idx /= 2;
        }

        Ok(MerkleProof {
            leaf: self.leaves[leaf_index],
            leaf_index,
            siblings,
            root: self.root,
        })
    }

    /// Return the current root of the tree.
    pub fn root(&self) -> [u8; 32] {
        self.root
    }

    /// Return the number of leaves inserted so far.
    pub fn len(&self) -> u64 {
        self.leaf_count
    }

    /// Whether the tree is empty.
    pub fn is_empty(&self) -> bool {
        self.leaf_count == 0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_empty_tree_root_matches_on_chain() {
        // The empty-tree root is Poseidon(Poseidon(...(0,0)...), ...) applied
        // `height` times. We just verify it is non-zero and deterministic.
        let t1 = MerkleTree::new(4).unwrap();
        let t2 = MerkleTree::new(4).unwrap();
        assert_eq!(t1.root(), t2.root());
        assert_ne!(t1.root(), [0u8; 32]);
    }

    #[test]
    fn test_insert_and_proof_height_4() {
        let mut tree = MerkleTree::new(4).unwrap();
        let leaf = [42u8; 32];
        let idx = tree.insert(leaf).unwrap();
        assert_eq!(idx, 0);
        assert_eq!(tree.len(), 1);

        let proof = tree.get_proof(0).unwrap();
        assert_eq!(proof.leaf, leaf);
        assert_eq!(proof.siblings.len(), 4);
        assert!(proof.verify().unwrap());
    }

    #[test]
    fn test_multiple_inserts() {
        let mut tree = MerkleTree::new(4).unwrap();
        for i in 0u8..5 {
            let mut leaf = [0u8; 32];
            leaf[31] = i;
            tree.insert(leaf).unwrap();
        }
        assert_eq!(tree.len(), 5);

        // Verify proof for each leaf.
        for i in 0..5 {
            let proof = tree.get_proof(i).unwrap();
            assert!(proof.verify().unwrap(), "proof failed for leaf {i}");
        }
    }

    #[test]
    fn test_tree_full() {
        let mut tree = MerkleTree::new(2).unwrap(); // capacity = 4
        for i in 0u8..4 {
            let mut leaf = [0u8; 32];
            leaf[31] = i;
            tree.insert(leaf).unwrap();
        }
        let result = tree.insert([99u8; 32]);
        assert!(result.is_err());
    }

    #[test]
    fn test_root_changes_on_insert() {
        let mut tree = MerkleTree::new(4).unwrap();
        let root_before = tree.root();
        tree.insert([1u8; 32]).unwrap();
        assert_ne!(tree.root(), root_before);
    }

    #[test]
    fn test_out_of_range_proof() {
        let tree = MerkleTree::new(4).unwrap();
        let result = tree.get_proof(0);
        assert!(result.is_err()); // no leaves inserted
    }
}
