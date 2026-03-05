//! Note primitives for the ZERA shielded pool.
//!
//! A **Note** represents a confidential UTXO inside the pool. It carries an
//! amount, asset identifier, a secret (private key material), a blinding
//! factor, and an optional 4-element memo field.
//!
//! The note commitment is computed as:
//! ```text
//! commitment = Poseidon(amount, asset, secret, blinding, memo[0], memo[1], memo[2], memo[3])
//! ```
//!
//! The nullifier is:
//! ```text
//! nullifier = Poseidon(secret, commitment)
//! ```

use ark_bn254::Fr;
use ark_ff::PrimeField;
use borsh::{BorshDeserialize, BorshSerialize};
use serde::{Deserialize, Serialize};

use crate::error::Result;
use crate::poseidon::{field_to_bytes32_be, poseidon_hash};

// ---------------------------------------------------------------------------
// Note
// ---------------------------------------------------------------------------

/// A confidential UTXO note.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct Note {
    /// Token amount in the smallest denomination (e.g. USDC lamports).
    pub amount: u64,
    /// Asset identifier -- typically `pubkey_to_field_bytes(mint.to_bytes())`.
    pub asset: [u8; 32],
    /// Secret key material (random 32 bytes). **Must be kept private.**
    pub secret: [u8; 32],
    /// Blinding factor for the Pedersen-like commitment (random 32 bytes).
    pub blinding: [u8; 32],
    /// Optional 4-element memo field (each element 32 bytes).
    pub memo: [[u8; 32]; 4],
}

// ---------------------------------------------------------------------------
// StoredNote
// ---------------------------------------------------------------------------

/// A note that has been inserted into the on-chain Merkle tree.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct StoredNote {
    /// The underlying note data.
    pub note: Note,
    /// The Poseidon commitment (leaf value in the Merkle tree).
    pub commitment: [u8; 32],
    /// The nullifier hash that will be revealed when spending.
    pub nullifier: [u8; 32],
    /// Index of this leaf in the Merkle tree.
    pub leaf_index: u64,
}

// ---------------------------------------------------------------------------
// Note construction helpers
// ---------------------------------------------------------------------------

/// Create a new random note for the given `amount` and `asset`.
///
/// The `secret` and `blinding` fields are filled with cryptographically secure
/// random bytes. The `memo` is zeroed.
pub fn create_note(amount: u64, asset: &[u8; 32]) -> Note {
    use rand::RngCore;

    let mut rng = rand::thread_rng();

    let mut secret = [0u8; 32];
    rng.fill_bytes(&mut secret);

    let mut blinding = [0u8; 32];
    rng.fill_bytes(&mut blinding);

    Note {
        amount,
        asset: *asset,
        secret,
        blinding,
        memo: [[0u8; 32]; 4],
    }
}

/// Compute the Poseidon commitment for a note.
///
/// ```text
/// commitment = Poseidon(amount, asset, secret, blinding, memo[0..4])
/// ```
///
/// The result is a 32-byte big-endian representation of the field element.
pub fn compute_commitment(note: &Note) -> Result<[u8; 32]> {
    let amount_fr = Fr::from(note.amount);
    let asset_fr = Fr::from_be_bytes_mod_order(&note.asset);
    let secret_fr = Fr::from_be_bytes_mod_order(&note.secret);
    let blinding_fr = Fr::from_be_bytes_mod_order(&note.blinding);
    let memo0_fr = Fr::from_be_bytes_mod_order(&note.memo[0]);
    let memo1_fr = Fr::from_be_bytes_mod_order(&note.memo[1]);
    let memo2_fr = Fr::from_be_bytes_mod_order(&note.memo[2]);
    let memo3_fr = Fr::from_be_bytes_mod_order(&note.memo[3]);

    let inputs = [
        amount_fr,
        asset_fr,
        secret_fr,
        blinding_fr,
        memo0_fr,
        memo1_fr,
        memo2_fr,
        memo3_fr,
    ];

    let h = poseidon_hash(&inputs)?;
    Ok(field_to_bytes32_be(&h))
}

/// Compute the nullifier for a note given its secret and commitment.
///
/// ```text
/// nullifier = Poseidon(secret, commitment)
/// ```
pub fn compute_nullifier(secret: &[u8; 32], commitment: &[u8; 32]) -> Result<[u8; 32]> {
    let secret_fr = Fr::from_be_bytes_mod_order(secret);
    let commitment_fr = Fr::from_be_bytes_mod_order(commitment);

    let h = poseidon_hash(&[secret_fr, commitment_fr])?;
    Ok(field_to_bytes32_be(&h))
}

/// Convenience: compute commitment, nullifier, and return a [`StoredNote`].
pub fn finalize_note(note: Note, leaf_index: u64) -> Result<StoredNote> {
    let commitment = compute_commitment(&note)?;
    let nullifier = compute_nullifier(&note.secret, &commitment)?;
    Ok(StoredNote {
        note,
        commitment,
        nullifier,
        leaf_index,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_note_randomness() {
        let asset = [1u8; 32];
        let n1 = create_note(100, &asset);
        let n2 = create_note(100, &asset);
        // Two independently created notes must have different secrets
        assert_ne!(n1.secret, n2.secret);
        assert_ne!(n1.blinding, n2.blinding);
    }

    #[test]
    fn test_commitment_deterministic() {
        let note = Note {
            amount: 1_000_000,
            asset: [0u8; 32],
            secret: [42u8; 32],
            blinding: [7u8; 32],
            memo: [[0u8; 32]; 4],
        };
        let c1 = compute_commitment(&note).unwrap();
        let c2 = compute_commitment(&note).unwrap();
        assert_eq!(c1, c2);
    }

    #[test]
    fn test_nullifier_deterministic() {
        let secret = [42u8; 32];
        let commitment = [99u8; 32];
        let n1 = compute_nullifier(&secret, &commitment).unwrap();
        let n2 = compute_nullifier(&secret, &commitment).unwrap();
        assert_eq!(n1, n2);
    }

    #[test]
    fn test_different_amounts_different_commitments() {
        let mut note = Note {
            amount: 100,
            asset: [0u8; 32],
            secret: [1u8; 32],
            blinding: [2u8; 32],
            memo: [[0u8; 32]; 4],
        };
        let c1 = compute_commitment(&note).unwrap();
        note.amount = 200;
        let c2 = compute_commitment(&note).unwrap();
        assert_ne!(c1, c2);
    }

    #[test]
    fn test_finalize_note() {
        let note = Note {
            amount: 500_000,
            asset: [0u8; 32],
            secret: [10u8; 32],
            blinding: [20u8; 32],
            memo: [[0u8; 32]; 4],
        };
        let stored = finalize_note(note.clone(), 42).unwrap();
        assert_eq!(stored.leaf_index, 42);
        assert_eq!(stored.commitment, compute_commitment(&note).unwrap());
        assert_eq!(
            stored.nullifier,
            compute_nullifier(&note.secret, &stored.commitment).unwrap()
        );
    }
}
