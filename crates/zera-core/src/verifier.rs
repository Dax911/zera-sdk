//! Groth16 proof data types and formatting utilities.
//!
//! The on-chain zera-pool program uses `groth16-solana` which expects proof
//! points in a specific wire format:
//!
//! - `proof_a`: 64 bytes -- uncompressed G1 affine point (x, y) in big-endian.
//! - `proof_b`: 128 bytes -- uncompressed G2 affine point (x, y) in big-endian.
//!   Each coordinate of G2 is a Fp2 element, so it is two 32-byte limbs.
//! - `proof_c`: 64 bytes -- uncompressed G1 affine point.
//!
//! This module provides the [`ProofData`] struct and helpers to convert between
//! common proof representations (e.g. snarkjs JSON output) and the on-chain
//! format.

use borsh::{BorshDeserialize, BorshSerialize};
use serde::{Deserialize, Serialize};
use serde_big_array::BigArray;

// ---------------------------------------------------------------------------
// ProofData (on-chain format)
// ---------------------------------------------------------------------------

/// Groth16 proof formatted for the zera-pool Solana program.
///
/// Field order and sizes match `groth16-solana`'s `Groth16Verifier::new`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, BorshSerialize, BorshDeserialize)]
pub struct ProofData {
    /// G1 affine point A (64 bytes, uncompressed big-endian).
    #[serde(with = "BigArray")]
    pub proof_a: [u8; 64],
    /// G2 affine point B (128 bytes, uncompressed big-endian).
    #[serde(with = "BigArray")]
    pub proof_b: [u8; 128],
    /// G1 affine point C (64 bytes, uncompressed big-endian).
    #[serde(with = "BigArray")]
    pub proof_c: [u8; 64],
}

impl Default for ProofData {
    fn default() -> Self {
        Self {
            proof_a: [0u8; 64],
            proof_b: [0u8; 128],
            proof_c: [0u8; 64],
        }
    }
}

// ---------------------------------------------------------------------------
// RawProof (generic / snarkjs-like representation)
// ---------------------------------------------------------------------------

/// A Groth16 proof in a generic byte representation, typically produced by
/// snarkjs or a compatible prover. Each field is a vector of big-endian
/// coordinate bytes.
#[derive(Debug, Clone)]
pub struct RawProof {
    /// pi_a: two 32-byte field elements [x, y].
    pub pi_a: Vec<Vec<u8>>,
    /// pi_b: two pairs of 32-byte field elements [[x0, x1], [y0, y1]].
    pub pi_b: Vec<Vec<Vec<u8>>>,
    /// pi_c: two 32-byte field elements [x, y].
    pub pi_c: Vec<Vec<u8>>,
}

/// Negate the Y-coordinate of a G1 point for the pairing check.
///
/// The on-chain verifier expects `proof_a` to have its Y negated (i.e.
/// `p - y`). The BN254 base field prime is:
///
/// ```text
/// p = 21888242871839275222246405745257275088696311157297823662689037894645226208583
/// ```
fn negate_g1_y(y_bytes: &[u8; 32]) -> [u8; 32] {
    // BN254 base field prime in big-endian.
    let p: [u8; 32] = [
        0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29,
        0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
        0x97, 0x81, 0x6a, 0x91, 0x68, 0x71, 0xca, 0x8d,
        0x3c, 0x20, 0x8c, 0x16, 0xd8, 0x7c, 0xfd, 0x47,
    ];

    let mut result = [0u8; 32];
    let mut borrow: i16 = 0;
    for i in (0..32).rev() {
        let diff = (p[i] as i16) - (y_bytes[i] as i16) - borrow;
        if diff < 0 {
            result[i] = (diff + 256) as u8;
            borrow = 1;
        } else {
            result[i] = diff as u8;
            borrow = 0;
        }
    }
    result
}

/// Convert a [`RawProof`] (e.g. from snarkjs) into the on-chain [`ProofData`]
/// format expected by `groth16-solana`.
///
/// This performs:
/// 1. Negate the Y-coordinate of `pi_a` (required by the pairing equation).
/// 2. Reorder `pi_b` coordinates from `[[x0, x1], [y0, y1]]` to the wire
///    format `[x1, x0, y1, y0]` (Fp2 element ordering for BN254 on Solana).
/// 3. Pack `pi_c` as-is.
pub fn format_proof_for_solana(proof: &RawProof) -> Result<ProofData, String> {
    // -- proof_a (G1): negate Y
    if proof.pi_a.len() < 2 || proof.pi_a[0].len() != 32 || proof.pi_a[1].len() != 32 {
        return Err("pi_a: expected two 32-byte coordinates".into());
    }
    let mut proof_a = [0u8; 64];
    proof_a[0..32].copy_from_slice(&proof.pi_a[0]);
    let y_bytes: [u8; 32] = proof.pi_a[1]
        .as_slice()
        .try_into()
        .map_err(|_| "pi_a[1] is not 32 bytes")?;
    let neg_y = negate_g1_y(&y_bytes);
    proof_a[32..64].copy_from_slice(&neg_y);

    // -- proof_b (G2): reorder Fp2 coordinates
    if proof.pi_b.len() < 2 {
        return Err("pi_b: expected two coordinate pairs".into());
    }
    for (i, pair) in proof.pi_b.iter().enumerate() {
        if pair.len() < 2 || pair[0].len() != 32 || pair[1].len() != 32 {
            return Err(format!("pi_b[{i}]: expected two 32-byte limbs"));
        }
    }
    let mut proof_b = [0u8; 128];
    // Wire format: [x1, x0, y1, y0]
    proof_b[0..32].copy_from_slice(&proof.pi_b[0][1]);   // x1
    proof_b[32..64].copy_from_slice(&proof.pi_b[0][0]);  // x0
    proof_b[64..96].copy_from_slice(&proof.pi_b[1][1]);  // y1
    proof_b[96..128].copy_from_slice(&proof.pi_b[1][0]); // y0

    // -- proof_c (G1): pack directly
    if proof.pi_c.len() < 2 || proof.pi_c[0].len() != 32 || proof.pi_c[1].len() != 32 {
        return Err("pi_c: expected two 32-byte coordinates".into());
    }
    let mut proof_c = [0u8; 64];
    proof_c[0..32].copy_from_slice(&proof.pi_c[0]);
    proof_c[32..64].copy_from_slice(&proof.pi_c[1]);

    Ok(ProofData {
        proof_a,
        proof_b,
        proof_c,
    })
}

/// Compact 128-byte proof representation compatible with Light Protocol's
/// `CompressedProof` format.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompressedProofData {
    pub a: [u8; 32],
    pub b: [u8; 64],
    pub c: [u8; 32],
}

impl CompressedProofData {
    /// Serialize to a flat 128-byte array.
    pub fn to_bytes(&self) -> [u8; 128] {
        let mut out = [0u8; 128];
        out[0..32].copy_from_slice(&self.a);
        out[32..96].copy_from_slice(&self.b);
        out[96..128].copy_from_slice(&self.c);
        out
    }

    /// Deserialize from a 128-byte slice.
    pub fn from_bytes(bytes: &[u8; 128]) -> Self {
        let mut a = [0u8; 32];
        let mut b = [0u8; 64];
        let mut c = [0u8; 32];
        a.copy_from_slice(&bytes[0..32]);
        b.copy_from_slice(&bytes[32..96]);
        c.copy_from_slice(&bytes[96..128]);
        Self { a, b, c }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_proof_data_default() {
        let p = ProofData::default();
        assert_eq!(p.proof_a, [0u8; 64]);
        assert_eq!(p.proof_b, [0u8; 128]);
        assert_eq!(p.proof_c, [0u8; 64]);
    }

    #[test]
    fn test_format_proof_roundtrip_structure() {
        let raw = RawProof {
            pi_a: vec![vec![1u8; 32], vec![2u8; 32]],
            pi_b: vec![
                vec![vec![3u8; 32], vec![4u8; 32]],
                vec![vec![5u8; 32], vec![6u8; 32]],
            ],
            pi_c: vec![vec![7u8; 32], vec![8u8; 32]],
        };
        let proof_data = format_proof_for_solana(&raw).unwrap();

        // proof_a: x should be pi_a[0], y should be negated pi_a[1]
        assert_eq!(&proof_data.proof_a[0..32], &[1u8; 32]);
        // Y is negated, so it should NOT be [2u8; 32]
        assert_ne!(&proof_data.proof_a[32..64], &[2u8; 32]);

        // proof_b: [x1, x0, y1, y0]
        assert_eq!(&proof_data.proof_b[0..32], &[4u8; 32]);   // x1 = pi_b[0][1]
        assert_eq!(&proof_data.proof_b[32..64], &[3u8; 32]);  // x0 = pi_b[0][0]
        assert_eq!(&proof_data.proof_b[64..96], &[6u8; 32]);  // y1 = pi_b[1][1]
        assert_eq!(&proof_data.proof_b[96..128], &[5u8; 32]); // y0 = pi_b[1][0]

        // proof_c: straight copy
        assert_eq!(&proof_data.proof_c[0..32], &[7u8; 32]);
        assert_eq!(&proof_data.proof_c[32..64], &[8u8; 32]);
    }

    #[test]
    fn test_compressed_proof_roundtrip() {
        let original = CompressedProofData {
            a: [1u8; 32],
            b: [2u8; 64],
            c: [3u8; 32],
        };
        let bytes = original.to_bytes();
        let recovered = CompressedProofData::from_bytes(&bytes);
        assert_eq!(original, recovered);
    }

    #[test]
    fn test_format_proof_bad_pi_a() {
        let raw = RawProof {
            pi_a: vec![vec![1u8; 16]], // wrong size
            pi_b: vec![
                vec![vec![3u8; 32], vec![4u8; 32]],
                vec![vec![5u8; 32], vec![6u8; 32]],
            ],
            pi_c: vec![vec![7u8; 32], vec![8u8; 32]],
        };
        assert!(format_proof_for_solana(&raw).is_err());
    }
}
