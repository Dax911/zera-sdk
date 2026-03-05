//! SDK error types for zera-core.

use thiserror::Error;

#[derive(Debug, Error)]
pub enum ZeraCoreError {
    #[error("Merkle tree is full")]
    TreeFull,

    #[error("Poseidon hash computation failed: {0}")]
    HashError(String),

    #[error("Nullifier has already been spent")]
    AlreadySpent,

    #[error("Merkle root not found in root history")]
    InvalidRoot,

    #[error("Zero-knowledge proof verification failed")]
    ProofVerificationFailed,

    #[error("Invalid proof data: {0}")]
    InvalidProof(String),

    #[error("Amount mismatch between proof and instruction")]
    AmountMismatch,

    #[error("Asset mismatch")]
    AssetMismatch,

    #[error("Arithmetic overflow")]
    Overflow,

    #[error("Fee exceeds withdrawal amount")]
    FeeTooHigh,

    #[error("Recipient hash does not match recipient account")]
    RecipientMismatch,

    #[error("Leaf index {index} is out of range for tree of height {height}")]
    LeafIndexOutOfRange { index: usize, height: usize },

    #[error("Invalid field element: value is not in the BN254 scalar field")]
    InvalidFieldElement,

    #[error("PDA derivation failed: {0}")]
    PdaDerivationFailed(String),

    #[error("Serialization error: {0}")]
    SerializationError(String),
}

pub type Result<T> = std::result::Result<T, ZeraCoreError>;
