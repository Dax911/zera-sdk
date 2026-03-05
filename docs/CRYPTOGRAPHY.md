# ZERA Confidential SDK -- Cryptography

A detailed reference on the cryptographic primitives, constructions, and field arithmetic underpinning the ZERA privacy protocol.

## Table of Contents

1. [BN254 Curve and Field Arithmetic](#bn254-curve-and-field-arithmetic)
2. [Poseidon Hash Function](#poseidon-hash-function)
3. [Note Structure and Commitment Scheme](#note-structure-and-commitment-scheme)
4. [Nullifier Computation and Double-Spend Prevention](#nullifier-computation-and-double-spend-prevention)
5. [Merkle Tree](#merkle-tree)
6. [Groth16 Proof System](#groth16-proof-system)
7. [Circuit Overview](#circuit-overview)
8. [Proof Format Transformation](#proof-format-transformation)
9. [Keccak-256 (Private Cash)](#keccak-256-private-cash)

---

## BN254 Curve and Field Arithmetic

ZERA operates entirely over the BN254 elliptic curve (also known as alt_bn128 or bn254). This curve was chosen because:

- Solana provides a native `sol_poseidon` syscall for BN254 Poseidon hashing
- The `groth16-solana` crate provides efficient BN254 pairing verification on-chain
- circomlibjs and Circom natively target BN254

### Field Primes

BN254 has two distinct prime fields:

**Scalar field (Fr)** -- used for Poseidon hashing and ZK circuit arithmetic:

```
Fr = 21888242871839275222246405745257275088548364400416034343698204186575808495617
```

All note values (amount, secret, blinding, asset, memo elements) must be elements of this field. Values >= Fr are reduced modulo Fr.

**Base field (Fp)** -- used for elliptic curve point coordinates:

```
Fp = 21888242871839275222246405745257275088696311157297823662689037894645226208583
```

This prime is used exclusively for negating the y-coordinate of the `pi_a` proof element during Groth16 proof formatting. Confusing Fp with Fr is a common and critical bug.

### Public Key to Field Element Conversion

Solana public keys are 32-byte values that may exceed the BN254 scalar field. To use a public key as a circuit input, it must be reduced modulo Fr:

```
field_element = BigInt("0x" + hex(pubkey_bytes)) % Fr
```

On-chain, this is implemented as iterative subtraction (at most 4 subtractions since 2^256 / Fr < 5):

```rust
pub fn pubkey_to_field_bytes(bytes: &[u8; 32]) -> [u8; 32] {
    let mut result = *bytes;
    while ge_be(&result, &BN254_SCALAR_FIELD) {
        result = sub_be(&result, &BN254_SCALAR_FIELD);
    }
    result
}
```

In TypeScript:

```typescript
function hashPubkeyToField(pubkeyBytes: Uint8Array): bigint {
  let hex = "";
  for (const b of pubkeyBytes) hex += b.toString(16).padStart(2, "0");
  return BigInt("0x" + hex) % BN254_PRIME;
}
```

Both implementations produce identical results. This is verified in integration tests.

---

## Poseidon Hash Function

ZERA uses the Poseidon hash function with BN254 parameters, specifically the "X5" variant (exponentiation constant = 5) used by circomlib.

### Parameters

| Parameter | Value |
|---|---|
| Curve | BN254 |
| Field | Scalar field (Fr) |
| S-box | x^5 |
| Full rounds | 8 |
| Partial rounds | Varies by width (57 for width-3, etc.) |
| Endianness | Big-endian |

### Implementation Consistency

Three independent implementations are used across the stack, all producing identical outputs:

| Environment | Implementation | Usage |
|---|---|---|
| Circom circuits | `circomlib/circuits/poseidon.circom` | ZK constraint system |
| TypeScript SDK | `circomlibjs` ^0.1.7 (`buildPoseidon()`) | Client-side hashing |
| Solana on-chain | `sol_poseidon` syscall (BN254_X5, BigEndian) | On-chain Merkle tree |
| Rust tests | `light-poseidon` ^0.4 (`new_circom(2)`) | Off-chain verification |

All four are verified to produce the same output for known test vectors:

```
Poseidon(0, 0) = 14744269619966411208579211824598458697587494354926760081771325075741142829156
Poseidon(1, 2) = 7853200120776062878684798364095072458815029376092732009249414926327459813530
```

### Usage in ZERA

| Operation | Poseidon Width | Inputs |
|---|---|---|
| Commitment | 8 | amount, secret, blinding, asset, memo[0..3] |
| Nullifier | 2 | secret, commitment |
| Merkle node | 2 | left_child, right_child |

---

## Note Structure and Commitment Scheme

### Note Definition

A note is the fundamental private UTXO in the ZERA protocol:

```
Note = {
  amount:   u64     // Token quantity in base units
  secret:   Fr      // 248-bit random value, known only to creator
  blinding: Fr      // 248-bit random value for commitment hiding
  asset:    Fr      // Token mint pubkey mod Fr
  memo:     Fr[4]   // Four private metadata fields
}
```

### Commitment

The commitment is a binding and hiding hash of the full note:

```
commitment = Poseidon(amount, secret, blinding, asset, memo[0], memo[1], memo[2], memo[3])
```

**Binding property:** It is computationally infeasible to find two different notes that produce the same commitment (collision resistance of Poseidon over BN254).

**Hiding property:** Given only the commitment, an observer cannot determine the note's contents. The `secret` and `blinding` values provide 496 bits of combined randomness, ensuring the commitment reveals no information about the amount, asset, or memo.

### Random Value Generation

The `secret` and `blinding` values are generated as 248-bit random values (31 bytes) reduced modulo Fr:

```typescript
function randomFieldElement(): bigint {
  const bytes = randomBytes(31); // 248 bits
  return BigInt("0x" + bytes.toString("hex")) % BN254_PRIME;
}
```

Using 31 bytes (248 bits) instead of 32 bytes ensures the value is overwhelmingly likely to be less than Fr (which is approximately 254 bits), minimizing bias from modular reduction.

---

## Nullifier Computation and Double-Spend Prevention

### Nullifier Derivation

```
nullifier = Poseidon(secret, commitment)
```

The nullifier uniquely identifies a specific spend of a specific note. Two properties are essential:

1. **Deterministic:** The same (secret, commitment) pair always produces the same nullifier.
2. **Unpredictable without the secret:** An observer who knows only the commitment cannot compute the nullifier.

### Double-Spend Prevention Mechanism

When a note is spent (withdrawal or transfer), the nullifier is submitted as a public input to the on-chain program. The program creates a PDA at:

```
seeds = ["nullifier", nullifier_hash_bytes]
```

This PDA is an 8-byte account (Anchor discriminator only). If a second transaction attempts to spend the same note:

1. It computes the same nullifier (deterministic).
2. It attempts to create the same PDA.
3. Solana's runtime rejects the duplicate account creation with "account already in use".
4. The entire transaction fails atomically.

This mechanism provides O(1) double-spend detection with no on-chain lookup table or bloom filter. The storage cost is 8 bytes of account data plus the rent exemption (~0.001 SOL) per spent note.

### Security Analysis

- **Forward security:** Even if a nullifier is revealed, it does not expose the note's contents or link it to the original deposit.
- **Unlinkability:** Different notes produce different nullifiers. Observing a nullifier does not reveal which commitment in the Merkle tree was spent.
- **Collision resistance:** Finding two different (secret, commitment) pairs that produce the same nullifier requires breaking Poseidon's collision resistance.

---

## Merkle Tree

### Structure

The on-chain Merkle tree is an incremental (append-only) binary tree using Poseidon(2) for node hashing.

| Property | Value |
|---|---|
| Height | 24 levels |
| Capacity | 2^24 = 16,777,216 leaves |
| Hash function | Poseidon(left, right) over BN254 Fr |
| Empty leaf value | 0 (the field element zero) |
| Storage | Zero-copy account (~40 KB) |

### Incremental Insertion

The tree uses the "frontier" optimization for O(height) insertion without storing all leaves:

```
filledSubtrees[level]: the most recent left-child hash at each level
emptyHashes[level]:    the hash of a fully-empty subtree at each level
```

To insert leaf at index `i`:

```
currentHash = leaf
for level in 0..HEIGHT:
    if bit(i, level) == 0:
        filledSubtrees[level] = currentHash
        currentHash = Poseidon(currentHash, emptyHashes[level])
    else:
        currentHash = Poseidon(filledSubtrees[level], currentHash)
root = currentHash
```

This requires exactly `HEIGHT` (24) Poseidon calls per insertion.

### Empty Tree Root

The empty tree root is computed by hashing zero with itself at each level:

```
Level 0 empty: 0
Level 1 empty: Poseidon(0, 0) = 14744269619966411208579211824598458697...
Level 2 empty: Poseidon(level1, level1) = ...
...
Level 24 empty: (the empty tree root)
```

This value is deterministic and verified to match between the client SDK and the on-chain program during initialization.

### Root History

The tree maintains a ring buffer of the last 100 roots:

```rust
root_history: [[u8; 32]; 100],
root_history_index: u64,
```

Before each insertion, the current root is pushed into the buffer. When verifying a withdrawal or transfer proof, the program checks if the submitted root matches any entry in the history (or the current root).

This allows up to 100 concurrent insertions between proof generation and submission. If the buffer wraps, older roots become invalid and proofs against them will fail.

### Merkle Proof Structure

A Merkle inclusion proof consists of:

- `pathElements[24]`: The sibling hash at each level, from leaf to root
- `pathIndices[24]`: The position flag at each level (0 = current node is the left child, 1 = right child)

Verification recomputes the root bottom-up:

```
hash = leaf
for i in 0..24:
    if pathIndices[i] == 0:
        hash = Poseidon(hash, pathElements[i])
    else:
        hash = Poseidon(pathElements[i], hash)
assert(hash == root)
```

---

## Groth16 Proof System

### Overview

ZERA uses Groth16, a succinct non-interactive argument of knowledge (SNARK) over the BN254 pairing-friendly curve. Groth16 was chosen for its:

- **Small proof size:** 3 group elements (256 bytes total)
- **Fast verification:** One pairing check (~200K Solana compute units)
- **Mature tooling:** Circom + snarkjs ecosystem

### Trusted Setup

Groth16 requires a circuit-specific trusted setup (Common Reference String). The setup produces:

- **Proving key** (`.zkey`): Used by the prover to generate proofs (~50-200 MB depending on circuit complexity)
- **Verification key** (VK): Embedded in the on-chain program as constant arrays

The VK consists of:
- `vk_alpha_g1`: G1 point (64 bytes)
- `vk_beta_g2`: G2 point (128 bytes)
- `vk_gamma_g2`: G2 point (128 bytes)
- `vk_delta_g2`: G2 point (128 bytes)
- `vk_ic`: Array of G1 points, one per public input plus one (varies by circuit)

**Security:** If the toxic waste (tau) from the setup is compromised, an attacker can forge proofs and steal funds. Production deployments must use a multi-party computation (MPC) ceremony to generate the setup parameters.

### Verification

On-chain verification uses the `groth16-solana` crate, which implements the BN254 pairing check:

```
e(pi_a, pi_b) == e(alpha, beta) * e(sum(vk_ic[i] * pub_input[i]), gamma) * e(pi_c, delta)
```

This is computed in constant time regardless of circuit complexity. Each verification costs approximately 200,000 compute units on Solana.

---

## Circuit Overview

### Deposit Circuit

**File:** `circuits/deposit/deposit.circom`

**Public inputs (3):** `publicAmount`, `publicAsset`, `outputCommitment`

**Private inputs (6):** `secret`, `blinding`, `memo[4]`

**Constraints:**
1. Compute `commitment = Poseidon(publicAmount, secret, blinding, publicAsset, memo[0..3])` using `CommitmentHasher`
2. Assert `outputCommitment === commitment`

**Purpose:** Proves the depositor knows a valid preimage for the commitment that matches the declared amount and asset. Prevents committing to more value than deposited.

### Withdraw Circuit

**File:** `circuits/withdraw/withdraw.circom`

**Public inputs (5):** `root`, `nullifierHash`, `recipient`, `amount`, `asset`

**Private inputs (6 + 2*24):** `secret`, `blinding`, `memo[4]`, `pathElements[24]`, `pathIndices[24]`

**Constraints:**
1. Reconstruct `commitment = Poseidon(amount, secret, blinding, asset, memo[0..3])`
2. Verify `nullifierHash === Poseidon(secret, commitment)`
3. Verify Merkle inclusion: recompute root from commitment + path, assert it equals `root`
4. Range check: assert `amount` fits in 64 bits (prevents field-overflow attacks)
5. Bind recipient: `recipientSquare = recipient * recipient` (creates a constraint that uses the recipient signal, preventing proof reuse for different recipients)

### Relayed Withdraw Circuit

**File:** `circuits/relayed_withdraw/relayed_withdraw.circom`

**Public inputs (6):** `root`, `nullifierHash`, `recipient`, `amount`, `asset`, `fee`

Same as Withdraw, plus:
6. Range check: assert `fee` fits in 64 bits
7. Range check: assert `amount - fee` fits in 64 bits (ensures fee <= amount)

### Transfer Circuit

**File:** `circuits/transfer/transfer.circom`

**Public inputs (4):** `root`, `nullifierHash`, `outputCommitment1`, `outputCommitment2`

**Private inputs (6 + 2*24 + 2*8):** Input note preimage + Merkle path + two output note preimages

**Constraints:**
1. Reconstruct input commitment, verify nullifier, verify Merkle inclusion
2. Compute both output commitments, assert they match public signals
3. **Value conservation:** `inAmount === outAmount1 + outAmount2`
4. **Asset consistency:** `inAsset === outAsset1` and `inAsset === outAsset2`
5. Range checks on all three amounts (64-bit)

### Circuit Library Components

| Component | File | Description |
|---|---|---|
| `CommitmentHasher` | `lib/commitment_hasher.circom` | Poseidon(8) commitment computation |
| `NullifierHasher` | `lib/nullifier_hasher.circom` | Poseidon(2) nullifier derivation |
| `MerkleTreeChecker` | `lib/merkle_tree.circom` | Parameterized Merkle inclusion verifier |
| `RangeCheck` | `lib/range_check.circom` | Bit-decomposition range check (Num2Bits) |

---

## Proof Format Transformation

snarkjs outputs Groth16 proofs as JSON objects. The `groth16-solana` on-chain verifier expects a specific byte layout. The transformation is:

### pi_a (G1 point, 64 bytes)

```
Input:  proof.pi_a = [x, y, "1"]  (affine coordinates as decimal strings)
Output: proofA = bytes32_be(x) || bytes32_be(Fp - y)
```

The y-coordinate is **negated** using the BN254 base field prime Fp. This is because `groth16-solana` expects the negated form for the pairing equation.

### pi_b (G2 point, 128 bytes)

```
Input:  proof.pi_b = [[x1, x2], [y1, y2], ["1", "0"]]
Output: proofB = bytes32_be(x2) || bytes32_be(x1) || bytes32_be(y2) || bytes32_be(y1)
```

The coordinate pairs within each G2 component are **reversed** (x2 before x1, y2 before y1).

### pi_c (G1 point, 64 bytes)

```
Input:  proof.pi_c = [x, y, "1"]
Output: proofC = bytes32_be(x) || bytes32_be(y)
```

Direct conversion, no negation or reordering.

### Public Inputs

Each public input is a BN254 scalar field element serialized as a 32-byte big-endian array:

```
input_bytes = value.toString(16).padStart(64, "0")  // -> hex -> bytes
```

---

## Keccak-256 (Private Cash)

The Private Cash voucher system uses Keccak-256 (SHA-3) instead of Poseidon for a lighter-weight commitment scheme.

### Voucher Commitment

```
commitment = keccak256(secret)
```

Where `secret` is a 32-byte random value.

### Recipient Binding

```
recipientHash = keccak256(recipient_pubkey_bytes || salt_bytes)
```

The 32-byte recipient public key is concatenated with a 32-byte random salt before hashing.

### Security Properties

- **Hiding:** Keccak-256 is a one-way function; the commitment reveals nothing about the secret.
- **Binding:** Collision resistance of Keccak-256 ensures each secret maps to a unique commitment.
- **No ZK proofs required:** Redemption requires revealing the secret directly, which the program verifies by computing `keccak256(secret)` and comparing to the stored commitment.

### Trade-offs vs. Poseidon/Groth16

| Property | Poseidon + Groth16 | Keccak-256 |
|---|---|---|
| Privacy | Full unlinkability | Commitment privacy only |
| Proof generation | Seconds (snarkjs WASM) | None required |
| On-chain cost | ~200K CU (pairing) | ~10K CU (SHA3) |
| Trusted setup | Required | Not required |
| Anonymity set | All pool deposits | Individual vouchers |
| Use case | High-value, full privacy | Quick transfers, AI agents |
