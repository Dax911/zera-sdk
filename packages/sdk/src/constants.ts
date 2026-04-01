// ---------------------------------------------------------------------------
// Tree
// ---------------------------------------------------------------------------

/** Merkle tree height used by the on-chain privacy pool. */
export const TREE_HEIGHT = 24;

/** Maximum number of leaves the tree can hold (2^TREE_HEIGHT). */
export const TREE_CAPACITY = 2 ** TREE_HEIGHT; // 16,777,216

// ---------------------------------------------------------------------------
// Field arithmetic
// ---------------------------------------------------------------------------

/**
 * BN254 scalar-field prime (aka the "r" of the curve).
 * Used for Poseidon hashing and ZK circuit arithmetic.
 */
export const BN254_PRIME = BigInt(
  "21888242871839275222246405745257275088548364400416034343698204186575808495617",
);

/**
 * BN254 base-field prime (aka "p", for G1 negation in Groth16 proof formatting).
 */
export const BN254_BASE_FIELD_PRIME = BigInt(
  "21888242871839275222246405745257275088696311157297823662689037894645226208583",
);

// ---------------------------------------------------------------------------
// Token mints
// ---------------------------------------------------------------------------

export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const USDC_DECIMALS = 6;

export const ZERA_MINT = "8avjtjHAHFqp4g2RR9ALAGBpSTqKPZR8nRbzSTwZERA";

export const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111112";

// ---------------------------------------------------------------------------
// Program IDs
// ---------------------------------------------------------------------------

/** Private-cash (voucher) program deployed on mainnet / devnet. */
export const PRIVATE_CASH_PROGRAM_ID =
  "ESQxpH9XkBQT6EVeWwAzTZD1e9NrLMrY8RPQ9SidYsgF";

/** Shielded-pool (ZK) program – uses Poseidon commitments + Groth16 proofs. */
export const SHIELDED_POOL_PROGRAM_ID =
  "B83jSQx1CT1hPRBupinaJaEkCjrfeo6Ktncu31q3ZNeX";

// ---------------------------------------------------------------------------
// PDA seeds (must match the on-chain constants byte-for-byte)
// ---------------------------------------------------------------------------

export const POOL_CONFIG_SEED = "pool_config";
export const MERKLE_TREE_SEED = "merkle_tree";
export const VAULT_SEED = "vault";
export const FEE_VAULT_SEED = "fee_vault";
export const NULLIFIER_SEED = "nullifier";

// ---------------------------------------------------------------------------
// SPL / Associated-Token constants
// ---------------------------------------------------------------------------

export const TOKEN_PROGRAM_ID_STR =
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
export const ASSOCIATED_TOKEN_PROGRAM_ID_STR =
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";

// ---------------------------------------------------------------------------
// Fee constants
// ---------------------------------------------------------------------------

/** Fee expressed in basis points (10 bp = 0.1 %). */
export const FEE_BASIS_POINTS = 10;

/** Total basis-point divisor for percentage calculation. */
export const TOTAL_BASIS_POINTS = 10_000n;

/** Minimum fee charged on any non-zero transaction (in token base units). */
export const MIN_FEE_AMOUNT = 1n;

// ---------------------------------------------------------------------------
// Voucher on-chain layout
// ---------------------------------------------------------------------------

export const VOUCHER_AMOUNT_OFFSET = 104;
export const EXPECTED_VOUCHER_SIZE = 154;
