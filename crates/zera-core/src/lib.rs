//! # ZERA Core
//!
//! Cryptographic primitives and utility functions for the ZERA Confidential SDK.
//!
//! This crate consolidates Poseidon hashing, Merkle tree operations, Groth16 proof
//! formatting, note construction, PDA derivation, and protocol constants into a
//! single dependency-free-of-Anchor library suitable for both on-chain and off-chain
//! use (CLI tools, TypeScript bindings via napi-rs, integration tests).

pub mod constants;
pub mod error;
pub mod merkle;
pub mod note;
pub mod pda;
pub mod poseidon;
pub mod verifier;

// Re-export key types at crate root for ergonomic imports.
pub use constants::*;
pub use error::ZeraCoreError;
pub use merkle::{MerkleProof, MerkleTree};
pub use note::{Note, StoredNote};
pub use poseidon::{bytes32_be_to_field, field_to_bytes32_be, poseidon_hash, poseidon_hash2};
pub use verifier::ProofData;
