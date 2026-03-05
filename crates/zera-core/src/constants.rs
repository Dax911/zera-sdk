//! Protocol constants shared across the ZERA ecosystem.

/// Height of the on-chain Merkle tree (2^24 = 16 777 216 leaves).
pub const TREE_HEIGHT: usize = 24;

/// Number of historical roots stored for concurrent-access safety.
pub const ROOT_HISTORY_SIZE: usize = 100;

/// BN254 scalar field prime (big-endian).
/// p = 21888242871839275222246405745257275088548364400416034343698204186575808495617
pub const BN254_PRIME: [u8; 32] = [
    0x30, 0x64, 0x4e, 0x72, 0xe1, 0x31, 0xa0, 0x29,
    0xb8, 0x50, 0x45, 0xb6, 0x81, 0x81, 0x58, 0x5d,
    0x28, 0x33, 0xe8, 0x48, 0x79, 0xb9, 0x70, 0x91,
    0x43, 0xe1, 0xf5, 0x93, 0xf0, 0x00, 0x00, 0x01,
];

// ---------------------------------------------------------------------------
// Token mints
// ---------------------------------------------------------------------------

/// USDC mint on Solana mainnet: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
pub const USDC_MINT: [u8; 32] = [
    0xc6, 0xfa, 0x7a, 0xf3, 0xbe, 0xdb, 0xad, 0x3a,
    0x3d, 0x65, 0xf3, 0x6a, 0xab, 0xc9, 0x74, 0x31,
    0xb1, 0xbb, 0xe4, 0xc2, 0xd2, 0xf6, 0xe0, 0xe4,
    0x7c, 0xa6, 0x02, 0x03, 0x45, 0x20, 0x48, 0xd3,
];

/// USDC uses 6 decimal places.
pub const USDC_DECIMALS: u8 = 6;

// ---------------------------------------------------------------------------
// PDA seeds (must match the on-chain Anchor program)
// ---------------------------------------------------------------------------

pub const MERKLE_TREE_SEED: &[u8] = b"merkle_tree";
pub const POOL_CONFIG_SEED: &[u8] = b"pool_config";
pub const VAULT_SEED: &[u8] = b"vault";
pub const NULLIFIER_SEED: &[u8] = b"nullifier";
pub const FEE_VAULT_SEED: &[u8] = b"fee_vault";

// ---------------------------------------------------------------------------
// Fee limits
// ---------------------------------------------------------------------------

/// Maximum protocol fee in basis points (10%).
pub const MAX_FEE_BPS: u16 = 1000;

/// Maximum ZERA burn rate in basis points (20%).
pub const MAX_BURN_BPS: u16 = 2000;

// ---------------------------------------------------------------------------
// Program IDs
// ---------------------------------------------------------------------------

/// zera-pool program ID: B83jSQx1CT1hPRBupinaJaEkCjrfeo6Ktncu31q3ZNeX
pub const ZERA_POOL_PROGRAM_ID: [u8; 32] = [
    0x9a, 0x87, 0x4e, 0x07, 0x1a, 0x11, 0x4e, 0x1e,
    0x60, 0x82, 0x42, 0x7a, 0x6c, 0x50, 0x8c, 0x6a,
    0x8a, 0x65, 0xf2, 0xdb, 0x35, 0x3c, 0x0f, 0x20,
    0xc3, 0x1a, 0x6e, 0xf0, 0xe5, 0x45, 0x18, 0xad,
];

/// Light Protocol account-compression program ID: compr6CUsB5m2jS4Y3831ztGSTnDpnKJTKS95d64XVq
pub const LIGHT_ACCOUNT_COMPRESSION_PROGRAM_ID: [u8; 32] = [
    0x06, 0x4e, 0x6b, 0xf9, 0x25, 0x86, 0x6f, 0x6c,
    0x56, 0x1a, 0xd0, 0x6f, 0x36, 0xa2, 0x82, 0x1b,
    0x94, 0x72, 0x59, 0x50, 0x64, 0xf5, 0x63, 0x15,
    0xab, 0xc2, 0xce, 0x57, 0xcd, 0x57, 0xd9, 0x01,
];
