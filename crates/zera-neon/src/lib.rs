//! Node.js bindings for `zera-core` via napi-rs.
//!
//! All functions accept and return JavaScript-friendly types (Buffer, number,
//! string, plain objects). Errors are thrown as JavaScript exceptions.

use napi::bindgen_prelude::*;
use napi_derive::napi;

// ---------------------------------------------------------------------------
// Poseidon
// ---------------------------------------------------------------------------

/// Hash two 32-byte big-endian values with Poseidon (circom-compatible).
///
/// Returns a 32-byte Buffer.
#[napi]
pub fn hash_nodes(left: Buffer, right: Buffer) -> Result<Buffer> {
    let left_arr: [u8; 32] = left
        .as_ref()
        .try_into()
        .map_err(|_| Error::from_reason("left must be exactly 32 bytes"))?;
    let right_arr: [u8; 32] = right
        .as_ref()
        .try_into()
        .map_err(|_| Error::from_reason("right must be exactly 32 bytes"))?;

    let result = zera_core::poseidon::hash_nodes(&left_arr, &right_arr)
        .map_err(|e| Error::from_reason(format!("{e}")))?;

    Ok(Buffer::from(result.to_vec()))
}

/// Convert a 32-byte big-endian public key into the BN254 scalar field.
///
/// Returns a 32-byte Buffer.
#[napi]
pub fn pubkey_to_field(bytes: Buffer) -> Result<Buffer> {
    let arr: [u8; 32] = bytes
        .as_ref()
        .try_into()
        .map_err(|_| Error::from_reason("input must be exactly 32 bytes"))?;

    let result = zera_core::poseidon::pubkey_to_field_bytes(&arr);
    Ok(Buffer::from(result.to_vec()))
}

/// Encode a u64 amount as a 32-byte big-endian Buffer for use as a circuit
/// public input.
#[napi]
pub fn amount_to_bytes32(amount: i64) -> Result<Buffer> {
    if amount < 0 {
        return Err(Error::from_reason("amount must be non-negative"));
    }
    let result = zera_core::poseidon::amount_to_bytes32_be(amount as u64);
    Ok(Buffer::from(result.to_vec()))
}

// ---------------------------------------------------------------------------
// Note
// ---------------------------------------------------------------------------

/// Create a new random Note for the given amount and 32-byte asset.
///
/// Returns a JSON string representing the note.
#[napi]
pub fn create_note(amount: i64, asset: Buffer) -> Result<String> {
    if amount < 0 {
        return Err(Error::from_reason("amount must be non-negative"));
    }
    let asset_arr: [u8; 32] = asset
        .as_ref()
        .try_into()
        .map_err(|_| Error::from_reason("asset must be exactly 32 bytes"))?;

    let note = zera_core::note::create_note(amount as u64, &asset_arr);
    serde_json::to_string(&note).map_err(|e| Error::from_reason(format!("serialize: {e}")))
}

/// Compute the Poseidon commitment for a note (given as JSON string).
///
/// Returns a 32-byte Buffer.
#[napi]
pub fn compute_commitment(note_json: String) -> Result<Buffer> {
    let note: zera_core::note::Note =
        serde_json::from_str(&note_json).map_err(|e| Error::from_reason(format!("parse: {e}")))?;
    let commitment = zera_core::note::compute_commitment(&note)
        .map_err(|e| Error::from_reason(format!("{e}")))?;
    Ok(Buffer::from(commitment.to_vec()))
}

/// Compute the nullifier given a 32-byte secret and 32-byte commitment.
///
/// Returns a 32-byte Buffer.
#[napi]
pub fn compute_nullifier(secret: Buffer, commitment: Buffer) -> Result<Buffer> {
    let secret_arr: [u8; 32] = secret
        .as_ref()
        .try_into()
        .map_err(|_| Error::from_reason("secret must be exactly 32 bytes"))?;
    let commitment_arr: [u8; 32] = commitment
        .as_ref()
        .try_into()
        .map_err(|_| Error::from_reason("commitment must be exactly 32 bytes"))?;

    let nullifier = zera_core::note::compute_nullifier(&secret_arr, &commitment_arr)
        .map_err(|e| Error::from_reason(format!("{e}")))?;
    Ok(Buffer::from(nullifier.to_vec()))
}

// ---------------------------------------------------------------------------
// Merkle tree
// ---------------------------------------------------------------------------

/// Object handle wrapping an in-memory Merkle tree.
#[napi]
pub struct JsMerkleTree {
    inner: zera_core::merkle::MerkleTree,
}

#[napi]
impl JsMerkleTree {
    /// Create a new empty Merkle tree with the given height.
    #[napi(constructor)]
    pub fn new(height: u32) -> Result<Self> {
        let inner = zera_core::merkle::MerkleTree::new(height as usize)
            .map_err(|e| Error::from_reason(format!("{e}")))?;
        Ok(Self { inner })
    }

    /// Insert a 32-byte commitment. Returns the leaf index.
    #[napi]
    pub fn insert(&mut self, commitment: Buffer) -> Result<u32> {
        let arr: [u8; 32] = commitment
            .as_ref()
            .try_into()
            .map_err(|_| Error::from_reason("commitment must be exactly 32 bytes"))?;
        let idx = self
            .inner
            .insert(arr)
            .map_err(|e| Error::from_reason(format!("{e}")))?;
        Ok(idx as u32)
    }

    /// Get the current Merkle root as a 32-byte Buffer.
    #[napi]
    pub fn root(&self) -> Buffer {
        Buffer::from(self.inner.root().to_vec())
    }

    /// Get the number of leaves inserted.
    #[napi]
    pub fn len(&self) -> u32 {
        self.inner.len() as u32
    }

    /// Generate a Merkle proof for the leaf at the given index.
    ///
    /// Returns a JSON string with `{ leaf, leafIndex, siblings, root }`.
    #[napi]
    pub fn get_proof(&self, leaf_index: u32) -> Result<String> {
        let proof = self
            .inner
            .get_proof(leaf_index as usize)
            .map_err(|e| Error::from_reason(format!("{e}")))?;

        let obj = serde_json::json!({
            "leaf": hex::encode(proof.leaf),
            "leafIndex": proof.leaf_index,
            "siblings": proof.siblings.iter().map(hex::encode).collect::<Vec<_>>(),
            "root": hex::encode(proof.root),
        });
        serde_json::to_string(&obj).map_err(|e| Error::from_reason(format!("serialize: {e}")))
    }
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Get the protocol tree height (24).
#[napi]
pub fn tree_height() -> u32 {
    zera_core::constants::TREE_HEIGHT as u32
}

/// Get the BN254 scalar field prime as a hex string.
#[napi]
pub fn bn254_prime_hex() -> String {
    hex::encode(zera_core::constants::BN254_PRIME)
}
