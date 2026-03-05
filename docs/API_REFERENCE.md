# ZERA Confidential SDK -- API Reference

Complete API reference for the `@zera-labs/sdk` TypeScript package.

## Table of Contents

- [Crypto: Poseidon](#crypto-poseidon)
- [Crypto: Keccak](#crypto-keccak)
- [Note Management](#note-management)
- [Merkle Tree](#merkle-tree)
- [Proof Generation](#proof-generation)
- [Proof Formatting Utilities](#proof-formatting-utilities)
- [Constants](#constants)
- [Types](#types)

---

## Crypto: Poseidon

Module: `@zera-labs/sdk/crypto/poseidon`

Poseidon hashing over the BN254 scalar field, compatible with circomlibjs circuits and the Solana `sol_poseidon` syscall.

### `getPoseidon()`

```typescript
async function getPoseidon(): Promise<any>
```

Lazily initializes and returns the singleton circomlibjs Poseidon instance. The instance is cached after first call.

**Returns:** The circomlibjs Poseidon hasher object.

**Example:**
```typescript
const poseidon = await getPoseidon();
const F = poseidon.F;
const hash = poseidon([F.e(1n), F.e(2n)]);
console.log(BigInt(F.toObject(hash)));
```

---

### `poseidonHash(inputs)`

```typescript
async function poseidonHash(inputs: bigint[]): Promise<bigint>
```

Hash an array of bigint field elements using Poseidon over BN254.

**Parameters:**
| Name | Type | Description |
|---|---|---|
| `inputs` | `bigint[]` | Array of field elements to hash. Length must match a supported Poseidon width (2, 4, 8, etc.) |

**Returns:** The Poseidon digest as a `bigint`.

**Example:**
```typescript
// Hash 8 inputs (used for commitment computation)
const commitment = await poseidonHash([
  amount, secret, blinding, asset,
  memo0, memo1, memo2, memo3,
]);

// Hash 2 inputs (used for nullifier computation)
const nullifier = await poseidonHash([secret, commitment]);
```

---

### `poseidonHash2(left, right)`

```typescript
async function poseidonHash2(left: bigint, right: bigint): Promise<bigint>
```

Hash exactly two field elements. This is the node-hashing function used inside the incremental Merkle tree.

**Parameters:**
| Name | Type | Description |
|---|---|---|
| `left` | `bigint` | Left child value |
| `right` | `bigint` | Right child value |

**Returns:** `Poseidon(left, right)` as a `bigint`.

**Example:**
```typescript
const parentHash = await poseidonHash2(leftChild, rightChild);
```

---

### `fieldToBytes32BE(value)`

```typescript
function fieldToBytes32BE(value: bigint): Uint8Array
```

Convert a bigint field element to a 32-byte big-endian `Uint8Array`. Used for serializing field elements into Solana instruction data.

**Parameters:**
| Name | Type | Description |
|---|---|---|
| `value` | `bigint` | Field element to serialize |

**Returns:** 32-byte `Uint8Array` in big-endian order.

**Example:**
```typescript
const bytes = fieldToBytes32BE(commitment);
// bytes.length === 32
```

---

### `bytes32BEToField(bytes)`

```typescript
function bytes32BEToField(bytes: Uint8Array): bigint
```

Convert a 32-byte big-endian `Uint8Array` back to a bigint field element.

**Parameters:**
| Name | Type | Description |
|---|---|---|
| `bytes` | `Uint8Array` | 32-byte big-endian array |

**Returns:** The field element as a `bigint`.

**Example:**
```typescript
const onChainRoot = bytes32BEToField(new Uint8Array(treeState.root));
```

---

## Crypto: Keccak

Module: `@zera-labs/sdk/crypto/keccak`

Keccak-256 utilities for the Private Cash voucher system. Environment-agnostic (Node.js, browser, edge runtimes).

### `generateRandomHex()`

```typescript
function generateRandomHex(): string
```

Generate a cryptographically random 32-byte hex string with `0x` prefix. Uses `globalThis.crypto.getRandomValues` when available, with a Node.js `crypto.randomBytes` fallback.

**Returns:** `0x`-prefixed 64-character hex string.

**Example:**
```typescript
const secret = generateRandomHex();
// "0xa3f1...4c2d" (64 hex chars)
```

---

### `computeKeccakCommitment(secretHex)`

```typescript
function computeKeccakCommitment(secretHex: string): string
```

Compute a Keccak-256 hash of a 32-byte secret. Used for creating voucher commitments in the Private Cash system.

**Parameters:**
| Name | Type | Description |
|---|---|---|
| `secretHex` | `string` | `0x`-prefixed (or bare) 32-byte hex secret |

**Returns:** `0x`-prefixed hex digest.

**Example:**
```typescript
const secret = generateRandomHex();
const commitment = computeKeccakCommitment(secret);
```

---

### `computeRecipientHash(recipient, saltHex)`

```typescript
function computeRecipientHash(recipient: string, saltHex: string): string
```

Compute the recipient hash: `keccak256(pubkeyBytes || saltBytes)`. Used for binding a voucher to a specific recipient without revealing the recipient on-chain until redemption.

**Parameters:**
| Name | Type | Description |
|---|---|---|
| `recipient` | `string` | Solana public key (base58) |
| `saltHex` | `string` | `0x`-prefixed (or bare) 32-byte hex salt |

**Returns:** `0x`-prefixed hex digest.

**Example:**
```typescript
const salt = generateRandomHex();
const recipientHash = computeRecipientHash(
  "DYw8jCTfwHNRJhhmFcbXvVDTqWMEVFBX6ZKUmG5CNSKK",
  salt,
);
```

---

## Note Management

Module: `@zera-labs/sdk`

Functions for creating and computing over shielded notes.

### `createNote(amount, asset, memo?)`

```typescript
function createNote(
  amount: bigint,
  asset: bigint,
  memo?: [bigint, bigint, bigint, bigint],
): Note
```

Create a new shielded note with cryptographically random `secret` and `blinding` values.

**Parameters:**
| Name | Type | Description |
|---|---|---|
| `amount` | `bigint` | Token amount in base units (e.g., `1_000_000n` for 1 USDC) |
| `asset` | `bigint` | Asset identifier: token mint pubkey reduced to a BN254 field element |
| `memo` | `[bigint, bigint, bigint, bigint]` | Optional 4-element private memo (defaults to `[0n, 0n, 0n, 0n]`) |

**Returns:** A `Note` object with random `secret` and `blinding`.

**Example:**
```typescript
import { createNote, hashPubkeyToField } from "@zera-labs/sdk";
import { PublicKey } from "@solana/web3.js";

const usdcMint = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const assetHash = await hashPubkeyToField(usdcMint.toBytes());
const note = createNote(1_000_000n, assetHash);
```

---

### `computeCommitment(note)`

```typescript
async function computeCommitment(note: Note): Promise<bigint>
```

Compute the Poseidon commitment for a note:

```
Commitment = Poseidon(amount, secret, blinding, asset, memo[0], memo[1], memo[2], memo[3])
```

**Parameters:**
| Name | Type | Description |
|---|---|---|
| `note` | `Note` | The note to commit |

**Returns:** The commitment as a `bigint` (a BN254 scalar field element).

**Example:**
```typescript
const commitment = await computeCommitment(note);
const commitmentBytes = fieldToBytes32BE(commitment);
```

---

### `computeNullifier(secret, commitment)`

```typescript
async function computeNullifier(
  secret: bigint,
  commitment: bigint,
): Promise<bigint>
```

Compute the nullifier for spending a note:

```
Nullifier = Poseidon(secret, commitment)
```

**Parameters:**
| Name | Type | Description |
|---|---|---|
| `secret` | `bigint` | The note's secret value |
| `commitment` | `bigint` | The note's Poseidon commitment |

**Returns:** The nullifier as a `bigint`.

**Example:**
```typescript
const commitment = await computeCommitment(note);
const nullifier = await computeNullifier(note.secret, commitment);
```

---

### `hashPubkeyToField(pubkeyBytes)`

```typescript
async function hashPubkeyToField(pubkeyBytes: Uint8Array): Promise<bigint>
```

Convert a 32-byte Solana public key into a BN254 scalar field element by taking the big-endian interpretation modulo the field prime. Used for the `asset` field (token mint) and the `recipient` field in withdrawal proofs.

**Parameters:**
| Name | Type | Description |
|---|---|---|
| `pubkeyBytes` | `Uint8Array` | 32-byte public key |

**Returns:** The field element as a `bigint` (guaranteed < BN254_PRIME).

**Example:**
```typescript
const recipientHash = await hashPubkeyToField(recipientPubkey.toBytes());
```

---

## Merkle Tree

Module: `@zera-labs/sdk`

Client-side incremental Merkle tree that mirrors the on-chain `MerkleTreeState` exactly.

### `MerkleTree` Class

```typescript
class MerkleTree {
  height: number;
  leafCount: number;
  root: bigint;

  static async create(height?: number): Promise<MerkleTree>;
  async insert(commitment: bigint): Promise<number>;
  async getProof(leafIndex: number): Promise<MerkleProof>;
  getLeaf(index: number): bigint;
}
```

#### `MerkleTree.create(height?)`

```typescript
static async create(height?: number): Promise<MerkleTree>
```

Create and initialize a new empty Merkle tree. Computes the empty-tree hashes at each level using Poseidon.

**Parameters:**
| Name | Type | Default | Description |
|---|---|---|---|
| `height` | `number` | `24` | Tree height (must match the on-chain tree) |

**Returns:** An initialized `MerkleTree` instance.

**Example:**
```typescript
const tree = await MerkleTree.create(); // height 24
console.log(tree.root); // Empty tree root
console.log(tree.leafCount); // 0
```

#### `tree.insert(commitment)`

```typescript
async insert(commitment: bigint): Promise<number>
```

Insert a commitment as the next leaf in the tree. Updates the root.

**Parameters:**
| Name | Type | Description |
|---|---|---|
| `commitment` | `bigint` | The Poseidon commitment to insert |

**Returns:** The leaf index (0-based).

**Throws:** `Error` if the tree is full (>= 2^height leaves).

**Example:**
```typescript
const leafIndex = await tree.insert(commitment);
console.log(`Inserted at leaf ${leafIndex}, new root: ${tree.root}`);
```

#### `tree.getProof(leafIndex)`

```typescript
async getProof(leafIndex: number): Promise<MerkleProof>
```

Generate a Merkle inclusion proof for the leaf at the given index.

**Parameters:**
| Name | Type | Description |
|---|---|---|
| `leafIndex` | `number` | The 0-based leaf index |

**Returns:** A `MerkleProof` object containing:
- `pathElements: bigint[]` -- Sibling hashes at each level (length = tree height)
- `pathIndices: number[]` -- Position indicators (0 = left, 1 = right) at each level

**Throws:** `Error` if `leafIndex >= leafCount`.

**Example:**
```typescript
const { pathElements, pathIndices } = await tree.getProof(0);
// pathElements.length === 24
// pathIndices.length === 24
```

#### `tree.getLeaf(index)`

```typescript
getLeaf(index: number): bigint
```

Retrieve the commitment stored at a specific leaf index.

**Parameters:**
| Name | Type | Description |
|---|---|---|
| `index` | `number` | The 0-based leaf index |

**Returns:** The commitment `bigint`.

**Throws:** `Error` if `index >= leafCount`.

---

## Proof Generation

Module: `@zera-labs/sdk`

Functions for generating Groth16 zero-knowledge proofs using snarkjs. Each function requires pre-compiled circuit files (`.wasm` for witness generation and `.zkey` for the proving key).

### `generateDepositProof(note, wasmPath, zkeyPath)`

```typescript
async function generateDepositProof(
  note: Note,
  wasmPath: string,
  zkeyPath: string,
): Promise<DepositProofResult>
```

Generate a Groth16 proof for a deposit operation. Proves the commitment is correctly formed from the note's amount and asset.

**Parameters:**
| Name | Type | Description |
|---|---|---|
| `note` | `Note` | The note to deposit |
| `wasmPath` | `string` | Path to the deposit circuit `.wasm` file |
| `zkeyPath` | `string` | Path to the deposit circuit `.zkey` file |

**Returns:** `DepositProofResult`:
| Field | Type | Description |
|---|---|---|
| `proof` | `SolanaProof` | Formatted proof bytes (`proofA`, `proofB`, `proofC`) |
| `commitment` | `bigint` | The computed commitment |
| `publicSignals` | `string[]` | Raw public signals from snarkjs |

**Example:**
```typescript
const { proof, commitment } = await generateDepositProof(
  note,
  "./circuits/deposit/deposit.wasm",
  "./circuits/deposit/deposit_final.zkey",
);
```

---

### `generateWithdrawProof(note, leafIndex, tree, recipientHash, wasmPath, zkeyPath)`

```typescript
async function generateWithdrawProof(
  note: Note,
  leafIndex: number,
  tree: MerkleTree,
  recipientHash: bigint,
  wasmPath: string,
  zkeyPath: string,
): Promise<WithdrawProofResult>
```

Generate a Groth16 proof for a withdrawal. Proves knowledge of a note in the Merkle tree and binds the proof to a specific recipient.

**Parameters:**
| Name | Type | Description |
|---|---|---|
| `note` | `Note` | The note to spend |
| `leafIndex` | `number` | The note's position in the Merkle tree |
| `tree` | `MerkleTree` | Client-side Merkle tree (must match on-chain state) |
| `recipientHash` | `bigint` | Recipient's pubkey reduced to a field element |
| `wasmPath` | `string` | Path to the withdraw circuit `.wasm` file |
| `zkeyPath` | `string` | Path to the withdraw circuit `.zkey` file |

**Returns:** `WithdrawProofResult`:
| Field | Type | Description |
|---|---|---|
| `proof` | `SolanaProof` | Formatted proof bytes |
| `nullifierHash` | `bigint` | The computed nullifier |
| `publicSignals` | `string[]` | Raw public signals |

**Example:**
```typescript
const recipientHash = await hashPubkeyToField(recipient.toBytes());
const { proof, nullifierHash } = await generateWithdrawProof(
  note, leafIndex, tree, recipientHash,
  "./circuits/withdraw/withdraw.wasm",
  "./circuits/withdraw/withdraw_final.zkey",
);
```

---

### `generateTransferProof(inputNote, inputLeafIndex, tree, outputNote1, outputNote2, wasmPath, zkeyPath)`

```typescript
async function generateTransferProof(
  inputNote: Note,
  inputLeafIndex: number,
  tree: MerkleTree,
  outputNote1: Note,
  outputNote2: Note,
  wasmPath: string,
  zkeyPath: string,
): Promise<TransferProofResult>
```

Generate a Groth16 proof for a shielded transfer. Spends one input note and creates two output notes (recipient + change). The circuit enforces `inputAmount == outputAmount1 + outputAmount2`.

**Parameters:**
| Name | Type | Description |
|---|---|---|
| `inputNote` | `Note` | The note to spend |
| `inputLeafIndex` | `number` | Input note's position in the Merkle tree |
| `tree` | `MerkleTree` | Client-side Merkle tree |
| `outputNote1` | `Note` | Recipient's new note |
| `outputNote2` | `Note` | Change note (back to sender) |
| `wasmPath` | `string` | Path to the transfer circuit `.wasm` file |
| `zkeyPath` | `string` | Path to the transfer circuit `.zkey` file |

**Returns:** `TransferProofResult`:
| Field | Type | Description |
|---|---|---|
| `proof` | `SolanaProof` | Formatted proof bytes |
| `nullifierHash` | `bigint` | Input note's nullifier |
| `outputCommitment1` | `bigint` | Recipient note's commitment |
| `outputCommitment2` | `bigint` | Change note's commitment |
| `publicSignals` | `string[]` | Raw public signals |

**Important:** `outputNote1.amount + outputNote2.amount` must equal `inputNote.amount`, and all three notes must share the same `asset` value. The circuit will reject the proof otherwise.

**Example:**
```typescript
const recipientNote = createNote(700_000n, assetHash);
const changeNote = createNote(300_000n, assetHash);

const result = await generateTransferProof(
  inputNote, leafIndex, tree,
  recipientNote, changeNote,
  "./circuits/transfer/transfer.wasm",
  "./circuits/transfer/transfer_final.zkey",
);
```

---

## Proof Formatting Utilities

Module: `@zera-labs/sdk`

### `formatProofForSolana(proof)`

```typescript
function formatProofForSolana(proof: any): {
  proofA: Uint8Array;
  proofB: Uint8Array;
  proofC: Uint8Array;
}
```

Convert a raw snarkjs Groth16 proof into the byte format expected by the `groth16-solana` on-chain verifier.

Transformations applied:
- `pi_a`: y-coordinate negated using BN254 base field prime, then `[x, y']` as 64 big-endian bytes
- `pi_b`: Coordinate pairs reversed within each G2 element, serialized as 128 bytes
- `pi_c`: Direct `[x, y]` serialization as 64 big-endian bytes

**Parameters:**
| Name | Type | Description |
|---|---|---|
| `proof` | `any` | Raw snarkjs proof object with `pi_a`, `pi_b`, `pi_c` |

**Returns:** Object with `proofA` (64 bytes), `proofB` (128 bytes), `proofC` (64 bytes).

---

### `bigintToBytes32BE(value)`

```typescript
function bigintToBytes32BE(value: bigint): Uint8Array
```

Convert a bigint to a 32-byte big-endian `Uint8Array`.

---

### `bytes32BEToBigint(bytes)`

```typescript
function bytes32BEToBigint(bytes: Uint8Array): bigint
```

Convert a 32-byte big-endian `Uint8Array` to a bigint.

---

### `fieldToSolanaBytes(value)`

```typescript
function fieldToSolanaBytes(value: bigint): number[]
```

Format a field element as a `number[]` (JavaScript array of bytes) suitable for passing directly into Anchor instruction args that expect `[u8; 32]`.

---

### `formatPublicInputsForSolana(publicSignals)`

```typescript
function formatPublicInputsForSolana(publicSignals: string[]): Uint8Array[]
```

Convert an array of public signal strings (as returned by snarkjs) into an array of 32-byte big-endian `Uint8Array` values for on-chain verification.

---

## Constants

Module: `@zera-labs/sdk`

### Tree Constants

| Constant | Type | Value | Description |
|---|---|---|---|
| `TREE_HEIGHT` | `number` | `24` | Merkle tree height |
| `TREE_CAPACITY` | `number` | `16_777_216` | Maximum leaves (2^24) |

### Field Constants

| Constant | Type | Value | Description |
|---|---|---|---|
| `BN254_PRIME` | `bigint` | `21888...5617` | BN254 scalar field prime (Fr) |
| `BN254_BASE_FIELD_PRIME` | `bigint` | `21888...8583` | BN254 base field prime (Fp) |

### Program IDs

| Constant | Type | Value |
|---|---|---|
| `SHIELDED_POOL_PROGRAM_ID` | `string` | `B83jSQx1CT1hPRBupinaJaEkCjrfeo6Ktncu31q3ZNeX` |
| `PRIVATE_CASH_PROGRAM_ID` | `string` | `ESQxpH9XkBQT6EVeWwAzTZD1e9NrLMrY8RPQ9SidYsgF` |

### PDA Seeds

| Constant | Type | Value | Description |
|---|---|---|---|
| `POOL_CONFIG_SEED` | `string` | `"pool_config"` | Pool configuration PDA |
| `MERKLE_TREE_SEED` | `string` | `"merkle_tree"` | Merkle tree state PDA |
| `VAULT_SEED` | `string` | `"vault"` | Token vault PDA |
| `FEE_VAULT_SEED` | `string` | `"fee_vault"` | Fee collection vault PDA |
| `NULLIFIER_SEED` | `string` | `"nullifier"` | Nullifier marker PDA prefix |

### Token Constants

| Constant | Type | Value |
|---|---|---|
| `USDC_MINT` | `string` | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| `USDC_DECIMALS` | `number` | `6` |
| `ZERA_MINT` | `string` | `8avjtjHAHFqp4g2RR9ALAGBpSTqKPZR8nRbzSTwZERA` |

### Fee Constants

| Constant | Type | Value | Description |
|---|---|---|---|
| `FEE_BASIS_POINTS` | `number` | `10` | Default fee (0.1%) |
| `TOTAL_BASIS_POINTS` | `bigint` | `10_000n` | Basis point denominator |
| `MIN_FEE_AMOUNT` | `bigint` | `1n` | Minimum fee in base units |

---

## Types

Module: `@zera-labs/sdk`

### `Note`

```typescript
interface Note {
  amount: bigint;    // Token amount in base units
  asset: bigint;     // Token mint reduced to BN254 field element
  secret: bigint;    // Random secret for nullifier derivation
  blinding: bigint;  // Random blinding for commitment hiding
  memo: [bigint, bigint, bigint, bigint]; // Private metadata
}
```

### `StoredNote`

```typescript
interface StoredNote extends Note {
  commitment: bigint; // Poseidon commitment (Merkle leaf)
  nullifier: bigint;  // Derived nullifier
  leafIndex: number;  // Position in Merkle tree
}
```

### `SolanaProof`

```typescript
interface SolanaProof {
  proofA: Uint8Array; // 64 bytes (G1 point, y-negated)
  proofB: Uint8Array; // 128 bytes (G2 point, coords reversed)
  proofC: Uint8Array; // 64 bytes (G1 point, direct)
}
```

### `DepositProofResult`

```typescript
interface DepositProofResult {
  proof: SolanaProof;
  commitment: bigint;
  publicSignals: string[];
}
```

### `WithdrawProofResult`

```typescript
interface WithdrawProofResult {
  proof: SolanaProof;
  nullifierHash: bigint;
  publicSignals: string[];
}
```

### `TransferProofResult`

```typescript
interface TransferProofResult {
  proof: SolanaProof;
  nullifierHash: bigint;
  outputCommitment1: bigint;
  outputCommitment2: bigint;
  publicSignals: string[];
}
```

### `MerkleProof`

```typescript
interface MerkleProof {
  pathElements: bigint[]; // Sibling hashes (length = tree height)
  pathIndices: number[];  // Position flags: 0 = left, 1 = right
}
```

### `PrivateCashVoucher`

```typescript
interface PrivateCashVoucher {
  voucherId: string;    // Keccak-based identifier (0x-prefixed hex)
  amount: number;       // Token amount in base units
  secret: string;       // 32-byte random secret (0x-prefixed hex)
  salt: string;         // 32-byte random salt (0x-prefixed hex)
  recipient: string;    // Solana public key (base58)
  txSignature: string;  // On-chain transaction signature
  createdAt: string;    // ISO-8601 timestamp
}
```

### `FeeConfig`

```typescript
interface FeeConfig {
  enabled: boolean;
  basisPoints: number;
  recipient: string;
}
```
