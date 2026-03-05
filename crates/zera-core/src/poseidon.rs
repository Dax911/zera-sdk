//! Poseidon hash functions over the BN254 scalar field.
//!
//! Uses `light-poseidon` with circom-compatible parameters (new_circom).
//! All byte representations are **big-endian** to match circomlibjs.

use ark_bn254::Fr;
use ark_ff::{BigInteger, PrimeField};
use light_poseidon::{Poseidon, PoseidonBytesHasher, PoseidonHasher};

use crate::error::{Result, ZeraCoreError};

/// Compute a Poseidon hash over an arbitrary number of BN254 field elements.
///
/// Inputs must be valid BN254 scalar field elements. The arity of the Poseidon
/// instance is set to `inputs.len()`.
pub fn poseidon_hash(inputs: &[Fr]) -> Result<Fr> {
    let arity = inputs.len();
    let mut poseidon = Poseidon::<Fr>::new_circom(arity)
        .map_err(|e| ZeraCoreError::HashError(format!("Poseidon init (arity {arity}): {e}")))?;
    poseidon
        .hash(inputs)
        .map_err(|e| ZeraCoreError::HashError(format!("Poseidon hash: {e}")))
}

/// Compute `Poseidon(left, right)` -- the standard 2-to-1 hash used by Merkle
/// trees and commitment schemes.
pub fn poseidon_hash2(left: Fr, right: Fr) -> Result<Fr> {
    poseidon_hash(&[left, right])
}

/// Hash two 32-byte big-endian values with Poseidon, returning a 32-byte
/// big-endian result. This mirrors the on-chain `hash_nodes` function from the
/// zera-pool Anchor program.
pub fn hash_nodes(left: &[u8; 32], right: &[u8; 32]) -> Result<[u8; 32]> {
    let mut poseidon = Poseidon::<Fr>::new_circom(2)
        .map_err(|e| ZeraCoreError::HashError(format!("Poseidon init: {e}")))?;
    poseidon
        .hash_bytes_be(&[left.as_slice(), right.as_slice()])
        .map_err(|e| ZeraCoreError::HashError(format!("Poseidon hash_bytes_be: {e}")))
}

/// Serialize a BN254 field element to a 32-byte big-endian array.
pub fn field_to_bytes32_be(value: &Fr) -> [u8; 32] {
    let bigint = value.into_bigint();
    let mut bytes = [0u8; 32];
    // ark-ff stores limbs in little-endian order; to_bytes_be gives big-endian.
    let be = bigint.to_bytes_be();
    bytes.copy_from_slice(&be);
    bytes
}

/// Deserialize a 32-byte big-endian array into a BN254 field element.
///
/// Returns an error if the value is not a valid element of the scalar field
/// (i.e. >= BN254 prime).
pub fn bytes32_be_to_field(bytes: &[u8; 32]) -> Result<Fr> {
    Fr::from_be_bytes_mod_order(bytes);
    // from_be_bytes_mod_order always succeeds by reducing mod p, but we also
    // provide an exact version:
    Ok(Fr::from_be_bytes_mod_order(bytes))
}

/// Convert a 32-byte big-endian value into the BN254 scalar field by repeated
/// subtraction (matching the on-chain `pubkey_to_field_bytes` utility).
///
/// This is useful for converting Solana public keys to field elements in a way
/// that is deterministic and matches the JS `pubkeyToField` implementation.
pub fn pubkey_to_field_bytes(bytes: &[u8; 32]) -> [u8; 32] {
    use crate::constants::BN254_PRIME;

    fn ge_be(a: &[u8; 32], b: &[u8; 32]) -> bool {
        for i in 0..32 {
            if a[i] > b[i] {
                return true;
            }
            if a[i] < b[i] {
                return false;
            }
        }
        true
    }

    fn sub_be(a: &[u8; 32], b: &[u8; 32]) -> [u8; 32] {
        let mut result = [0u8; 32];
        let mut borrow: i16 = 0;
        for i in (0..32).rev() {
            let diff = (a[i] as i16) - (b[i] as i16) - borrow;
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

    let mut result = *bytes;
    while ge_be(&result, &BN254_PRIME) {
        result = sub_be(&result, &BN254_PRIME);
    }
    result
}

/// Convert a u64 amount to a 32-byte big-endian representation suitable for use
/// as a public input to a Groth16 circuit.
pub fn amount_to_bytes32_be(amount: u64) -> [u8; 32] {
    let mut bytes = [0u8; 32];
    bytes[24..32].copy_from_slice(&amount.to_be_bytes());
    bytes
}

#[cfg(test)]
mod tests {
    use super::*;

    fn bigint_to_bytes32_be(val: &str) -> [u8; 32] {
        let n = num_bigint::BigUint::parse_bytes(val.as_bytes(), 10).unwrap();
        let be_bytes = n.to_bytes_be();
        let mut out = [0u8; 32];
        let start = 32 - be_bytes.len();
        out[start..].copy_from_slice(&be_bytes);
        out
    }

    fn bytes32_be_to_bigint(bytes: &[u8; 32]) -> String {
        num_bigint::BigUint::from_bytes_be(bytes).to_string()
    }

    #[test]
    fn test_poseidon_hash2_matches_circomlibjs() {
        // Known circomlibjs: Poseidon(0, 0) =
        // 14744269619966411208579211824598458697587494354926760081771325075741142829156
        let zero = Fr::from(0u64);
        let h = poseidon_hash2(zero, zero).unwrap();
        let h_bytes = field_to_bytes32_be(&h);
        assert_eq!(
            bytes32_be_to_bigint(&h_bytes),
            "14744269619966411208579211824598458697587494354926760081771325075741142829156",
        );
    }

    #[test]
    fn test_hash_nodes_matches_circomlibjs() {
        let zero = [0u8; 32];
        let result = hash_nodes(&zero, &zero).unwrap();
        assert_eq!(
            bytes32_be_to_bigint(&result),
            "14744269619966411208579211824598458697587494354926760081771325075741142829156",
        );
    }

    #[test]
    fn test_poseidon_1_2() {
        let one = Fr::from(1u64);
        let two = Fr::from(2u64);
        let h = poseidon_hash2(one, two).unwrap();
        let h_bytes = field_to_bytes32_be(&h);
        assert_eq!(
            bytes32_be_to_bigint(&h_bytes),
            "7853200120776062878684798364095072458815029376092732009249414926327459813530",
        );
    }

    #[test]
    fn test_field_roundtrip() {
        let val = Fr::from(42u64);
        let bytes = field_to_bytes32_be(&val);
        let recovered = bytes32_be_to_field(&bytes).unwrap();
        assert_eq!(val, recovered);
    }

    #[test]
    fn test_pubkey_to_field_bytes_zero() {
        let input = [0u8; 32];
        assert_eq!(pubkey_to_field_bytes(&input), input);
    }

    #[test]
    fn test_pubkey_to_field_bytes_below_prime() {
        let mut input = [0u8; 32];
        input[31] = 1;
        assert_eq!(pubkey_to_field_bytes(&input), input);
    }

    #[test]
    fn test_pubkey_to_field_bytes_equal_to_prime() {
        use crate::constants::BN254_PRIME;
        let result = pubkey_to_field_bytes(&BN254_PRIME);
        assert_eq!(result, [0u8; 32]);
    }

    #[test]
    fn test_pubkey_to_field_bytes_usdc_mint() {
        use crate::constants::{BN254_PRIME, USDC_MINT};
        let result = pubkey_to_field_bytes(&USDC_MINT);
        // Result must be < BN254_PRIME
        for i in 0..32 {
            if result[i] < BN254_PRIME[i] {
                break;
            }
            assert!(result[i] <= BN254_PRIME[i]);
        }
        // USDC mint bytes > BN254_PRIME, so result should differ
        assert_ne!(result, USDC_MINT);
    }

    #[test]
    fn test_amount_to_bytes32_be() {
        let bytes = amount_to_bytes32_be(1_000_000);
        assert_eq!(bytes[0..24], [0u8; 24]);
        assert_eq!(&bytes[24..32], &1_000_000u64.to_be_bytes());
    }

    #[test]
    fn test_amount_to_bytes32_be_zero() {
        assert_eq!(amount_to_bytes32_be(0), [0u8; 32]);
    }
}
