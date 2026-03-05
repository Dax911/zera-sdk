// ---------------------------------------------------------------------------
// Crypto primitives
// ---------------------------------------------------------------------------
export {
  getPoseidon,
  poseidonHash,
  poseidonHash2,
  fieldToBytes32BE,
  bytes32BEToField,
} from "./crypto/poseidon";

export {
  computeKeccakCommitment,
  computeRecipientHash,
  generateRandomHex,
} from "./crypto/keccak";

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------
export {
  createNote,
  computeCommitment,
  computeNullifier,
  hashPubkeyToField,
} from "./note";

// ---------------------------------------------------------------------------
// Merkle tree
// ---------------------------------------------------------------------------
export { MerkleTree } from "./merkle-tree";

// ---------------------------------------------------------------------------
// ZK provers
// ---------------------------------------------------------------------------
export {
  generateDepositProof,
  generateWithdrawProof,
  generateTransferProof,
} from "./prover";

// ---------------------------------------------------------------------------
// Byte / proof formatting utilities
// ---------------------------------------------------------------------------
export {
  bigintToBytes32BE,
  bytes32BEToBigint,
  fieldToSolanaBytes,
  formatPublicInputsForSolana,
  formatProofForSolana,
} from "./utils";

// ---------------------------------------------------------------------------
// Vouchers
// ---------------------------------------------------------------------------
export {
  parseVoucher,
  loadStoredVouchers,
  storeVouchers,
  VoucherParseError,
} from "./voucher";
export type { VoucherParseErrorReason } from "./voucher";

// ---------------------------------------------------------------------------
// PDA derivation
// ---------------------------------------------------------------------------
export {
  derivePoolConfig,
  deriveMerkleTree,
  deriveVault,
  deriveFeeVault,
  deriveNullifier,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "./pda";

// ---------------------------------------------------------------------------
// Transaction builders
// ---------------------------------------------------------------------------
export {
  buildDepositTransaction,
  buildWithdrawTransaction,
  buildTransferTransaction,
} from "./tx";
export type {
  DepositParams,
  WithdrawParams,
  TransferParams,
} from "./tx";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
export {
  TREE_HEIGHT,
  TREE_CAPACITY,
  BN254_PRIME,
  BN254_BASE_FIELD_PRIME,
  USDC_MINT,
  USDC_DECIMALS,
  ZERA_MINT,
  NATIVE_SOL_MINT,
  PRIVATE_CASH_PROGRAM_ID,
  SHIELDED_POOL_PROGRAM_ID,
  POOL_CONFIG_SEED,
  MERKLE_TREE_SEED,
  VAULT_SEED,
  FEE_VAULT_SEED,
  NULLIFIER_SEED,
  TOKEN_PROGRAM_ID_STR,
  ASSOCIATED_TOKEN_PROGRAM_ID_STR,
  FEE_BASIS_POINTS,
  TOTAL_BASIS_POINTS,
  MIN_FEE_AMOUNT,
  VOUCHER_AMOUNT_OFFSET,
  EXPECTED_VOUCHER_SIZE,
} from "./constants";

// ---------------------------------------------------------------------------
// Tree state client
// ---------------------------------------------------------------------------
export { TreeStateClient } from "./tree-state";

// ---------------------------------------------------------------------------
// Note store
// ---------------------------------------------------------------------------
export { MemoryNoteStore, FileNoteStore } from "./note-store";
export type { NoteStore } from "./note-store";

// ---------------------------------------------------------------------------
// High-level client
// ---------------------------------------------------------------------------
export { ZeraClient } from "./client";
export type {
  ZeraClientConfig,
  CircuitPaths,
  DepositResult,
  WithdrawResult,
  TransferResult,
} from "./client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type {
  Note,
  StoredNote,
  SolanaProof,
  DepositProofResult,
  WithdrawProofResult,
  TransferProofResult,
  PrivateCashVoucher,
  PrivateCashVoucherTile,
  FeeConfig,
  MerkleProof,
  TreeStateConfig,
  MerkleTreeState,
  PoolState,
  LeafCache,
} from "./types";
