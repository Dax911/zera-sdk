// ---------------------------------------------------------------------------
// Note types
// ---------------------------------------------------------------------------

/** A shielded note representing a private UTXO in the pool. */
export interface Note {
  /** Token amount in base units. */
  amount: bigint;
  /** Asset identifier (token mint hashed into a field element). */
  asset: bigint;
  /** Random secret used for nullifier derivation. */
  secret: bigint;
  /** Random blinding factor for the commitment. */
  blinding: bigint;
  /** Four-element memo field (arbitrary private metadata). */
  memo: [bigint, bigint, bigint, bigint];
}

/** A note that has been inserted into the Merkle tree. */
export interface StoredNote extends Note {
  /** Poseidon commitment stored as a leaf in the on-chain tree. */
  commitment: bigint;
  /** Nullifier derived from (secret, commitment). */
  nullifier: bigint;
  /** Leaf index in the Merkle tree. */
  leafIndex: number;
}

// ---------------------------------------------------------------------------
// Proof types
// ---------------------------------------------------------------------------

/** Solana-ready Groth16 proof byte arrays. */
export interface SolanaProof {
  proofA: Uint8Array;
  proofB: Uint8Array;
  proofC: Uint8Array;
}

/** Result of generating a deposit proof. */
export interface DepositProofResult {
  proof: SolanaProof;
  commitment: bigint;
  publicSignals: string[];
}

/** Result of generating a withdrawal proof. */
export interface WithdrawProofResult {
  proof: SolanaProof;
  nullifierHash: bigint;
  publicSignals: string[];
}

/** Result of generating a shielded transfer proof (1-input, 2-output). */
export interface TransferProofResult {
  proof: SolanaProof;
  nullifierHash: bigint;
  outputCommitment1: bigint;
  outputCommitment2: bigint;
  publicSignals: string[];
}

// ---------------------------------------------------------------------------
// Voucher types
// ---------------------------------------------------------------------------

/** A private-cash voucher containing the secret material needed to redeem. */
export interface PrivateCashVoucher {
  /** Keccak-based voucher identifier (hex, 0x-prefixed). */
  voucherId: string;
  /** Amount in token base units. */
  amount: number;
  /** 32-byte random secret (hex, 0x-prefixed). */
  secret: string;
  /** 32-byte random salt (hex, 0x-prefixed). */
  salt: string;
  /** Recipient Solana public key (base58). */
  recipient: string;
  /** On-chain transaction signature. */
  txSignature: string;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
}

/** Voucher with a display-level identifier. */
export type PrivateCashVoucherTile = PrivateCashVoucher & { id: string };

// ---------------------------------------------------------------------------
// Fee types
// ---------------------------------------------------------------------------

export interface FeeConfig {
  enabled: boolean;
  basisPoints: number;
  recipient: string;
}

// ---------------------------------------------------------------------------
// Merkle proof
// ---------------------------------------------------------------------------

export interface MerkleProof {
  pathElements: bigint[];
  pathIndices: number[];
}

// ---------------------------------------------------------------------------
// Tree state types
// ---------------------------------------------------------------------------

/** Configuration for the TreeStateClient. */
export interface TreeStateConfig {
  /** Solana RPC URL. */
  rpcUrl: string;
  /** Program ID (defaults to shielded pool). */
  programId?: string;
  /** Optional cached API endpoint URL (e.g. "https://api.zera.fi"). */
  cacheEndpoint?: string;
  /** Optional IPFS gateway for decentralized state storage. */
  ipfsGateway?: string;
}

/** On-chain Merkle tree state parsed from account data. */
export interface MerkleTreeState {
  root: Uint8Array;
  leafCount: number;
  filledSubtrees: Uint8Array[];
  emptyHashes: Uint8Array[];
}

/** Combined pool + tree state. */
export interface PoolState {
  poolConfig: {
    authority: string;
    merkleTree: string;
    tokenMint: string;
    vault: string;
    assetHash: Uint8Array;
    totalDeposited: number;
    totalWithdrawn: number;
    bump: number;
    feeBps: number;
    burnBps: number;
    zeraPrice: number;
    paused: boolean;
  };
  merkleTree: MerkleTreeState;
}

/** Local leaf cache for incremental tree syncing. */
export interface LeafCache {
  /** Map of leafIndex -> commitment (decimal or hex string). */
  leaves: Record<string, string>;
  /** Highest leaf index seen. */
  newestIndex: number;
  /** Most recent transaction signature processed. */
  newestSig: string;
}
