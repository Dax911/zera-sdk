# ZERA Confidential SDK -- Architecture

## System Overview

ZERA is a privacy-preserving protocol on Solana that enables confidential token transactions. Users deposit tokens into a shielded pool by publishing a Poseidon commitment. Later, they can withdraw or transfer those tokens by presenting a Groth16 zero-knowledge proof demonstrating knowledge of the note preimage and its inclusion in the on-chain Merkle tree, without revealing which note they are spending.

```
                         ZERA Architecture
 ===================================================================

  +---------------------------+     +---------------------------+
  |    Third-Party dApp /     |     |     AI Agent / Backend    |
  |    Wallet Frontend        |     |     Payment Service       |
  +----------+----------------+     +----------+----------------+
             |                                 |
             v                                 v
  +------------------------------------------------------------+
  |                  @zera-labs/sdk (TypeScript)                |
  |                                                            |
  |  +-------------+  +-----------+  +----------+  +--------+  |
  |  | crypto/     |  | note      |  | prover   |  | tx     |  |
  |  | poseidon.ts |  | mgmt      |  | (snarkjs)|  | builder|  |
  |  | keccak.ts   |  |           |  |          |  |        |  |
  |  +------+------+  +-----+-----+  +----+-----+  +---+----+  |
  |         |              |              |            |         |
  +------------------------------------------------------------+
            |              |              |            |
            v              v              v            v
  +------------------------------------------------------------+
  |             Solana RPC  (@solana/web3.js)                   |
  +---+----------------------------+----------------------------+
      |                            |
      v                            v
  +-------------------+    +-------------------+
  | Shielded Pool     |    | Private Cash      |
  | (zera-pool)       |    | (voucher system)  |
  |                   |    |                   |
  | B83jSQ...3ZNeX    |    | ESQxpH...dYsgF    |
  |                   |    |                   |
  | - Groth16 verify  |    | - Keccak commit   |
  | - Poseidon Merkle |    | - Voucher create  |
  | - Nullifier PDAs  |    | - Voucher redeem  |
  | - SPL vault       |    | - SPL vault       |
  +-------------------+    +-------------------+
           |                        |
           v                        v
  +------------------------------------------------------------+
  |                     Solana Runtime                          |
  |  sol_poseidon syscall  |  SPL Token  |  System Program     |
  +------------------------------------------------------------+
```

## SDK Layer Architecture

The SDK is organized as a layered stack. Each layer depends only on the layer below it.

### Layer 1: Rust Core (`crates/zera-core/`)

Portable cryptographic primitives with no Solana runtime dependency (the `solana` feature gate is optional).

| Module | Responsibility |
|---|---|
| Poseidon hashing | BN254 X5 Poseidon via `light-poseidon`, circomlibjs-compatible |
| Merkle tree | Incremental tree with append, proof generation, root history |
| Note computation | Commitment = Poseidon(8 inputs), Nullifier = Poseidon(2 inputs) |
| Groth16 formatting | Proof byte layout for `groth16-solana` on-chain verifier |
| PDA derivation | Pool config, vault, Merkle tree, nullifier seed helpers |
| Field arithmetic | BN254 scalar field reduction for pubkey-to-field conversion |

### Layer 2: Neon Bindings (`crates/zera-neon/`)

Node.js native module via `neon-rs` that exposes `zera-core` functions to JavaScript. This provides high-performance Poseidon hashing from Rust when running in a Node.js environment, as an alternative to the pure-JS `circomlibjs` implementation.

### Layer 3: TypeScript SDK (`packages/sdk/`)

The primary integration surface for third-party developers.

```
packages/sdk/src/
  constants.ts         Tree height, field primes, program IDs, PDA seeds, fees
  types.ts             Note, StoredNote, SolanaProof, Voucher interfaces
  crypto/
    poseidon.ts        Poseidon hashing via circomlibjs (singleton, lazy init)
    keccak.ts          Keccak-256 for voucher commitments (@noble/hashes)
  tx/                  Transaction builders (deposit, withdraw, transfer, voucher)
```

## On-Chain Programs

### Shielded Pool (`zera-pool`)

Program ID: `B83jSQx1CT1hPRBupinaJaEkCjrfeo6Ktncu31q3ZNeX`

The core privacy program. It maintains a Poseidon-based incremental Merkle tree (height 24) and verifies Groth16 proofs for every state-changing operation.

**Instructions:**

| Instruction | Public Inputs | Description |
|---|---|---|
| `initialize` | asset_hash | Create pool with Merkle tree and vault |
| `deposit` | amount, asset, commitment | Transfer tokens to vault, append commitment leaf |
| `withdraw` | root, nullifier, recipient, amount, asset | Verify ZK proof, transfer tokens from vault |
| `relayed_withdraw` | root, nullifier, recipient, amount, asset, fee | Gasless withdrawal via operator relay |
| `shielded_transfer` | root, nullifier, outCommitment1, outCommitment2 | Spend one note, create two new notes |
| `update_config` | -- | Admin: set fee_bps, burn_bps, pause |
| `withdraw_fees` | -- | Admin: withdraw collected protocol fees |
| `buyback_burn` | -- | Admin: swap SOL for ZERA and burn |

**Accounts (PDAs):**

```
["pool_config"]                   --> PoolConfig (authority, mint, fees, stats)
["merkle_tree"]                   --> MerkleTreeState (root, leaves, subtrees)
["vault"]                         --> SPL Token Account (holds deposited tokens)
["fee_vault"]                     --> SPL Token Account (collected protocol fees)
["nullifier", nullifier_hash]     --> 8-byte PDA (existence = spent)
```

**On-chain Poseidon:** The program uses the Solana `sol_poseidon` syscall on BPF targets for zero-stack-overhead hashing. In native test mode, it falls back to `light-poseidon::new_circom(2)` which is verified to produce identical outputs to circomlibjs.

### Private Cash (Voucher System)

Program ID: `ESQxpH9XkBQT6EVeWwAzTZD1e9NrLMrY8RPQ9SidYsgF`

A lighter-weight privacy mechanism using Keccak-256 commitments instead of ZK proofs. Users create vouchers with a random secret, and recipients redeem them by revealing the secret. Suitable for one-time private payments and AI agent payment flows where the full ZK overhead is unnecessary.

## Privacy Model

### Notes

A note is the fundamental unit of private value in ZERA. It is a tuple:

```
Note = (amount, secret, blinding, asset, memo[0..3])
```

- `amount`: Token quantity in base units (e.g., 1_000_000 for 1 USDC)
- `secret`: 248-bit random value, known only to the creator
- `blinding`: 248-bit random value for commitment hiding
- `asset`: Token mint public key reduced to a BN254 field element
- `memo`: Four-element private metadata field (arbitrary use)

### Commitments

A commitment is a Poseidon hash of the full note:

```
commitment = Poseidon(amount, secret, blinding, asset, memo[0], memo[1], memo[2], memo[3])
```

This provides two properties:
- **Binding**: Given a commitment, you cannot find a different note that produces the same hash (collision resistance).
- **Hiding**: Given a commitment, you cannot determine the note contents without knowing the secret and blinding (preimage resistance + randomness).

Commitments are stored as leaves in the on-chain Merkle tree.

### Nullifiers

A nullifier uniquely identifies a note-spend:

```
nullifier = Poseidon(secret, commitment)
```

When a note is spent (withdraw or transfer), the nullifier is revealed publicly and recorded as a PDA on-chain. Attempting to spend the same note again produces the same nullifier, and Solana rejects the duplicate PDA creation. This prevents double-spending without revealing which note was spent.

### Merkle Tree

The on-chain Merkle tree is an incremental Poseidon-based binary tree:

- **Height**: 24 levels (capacity: 16,777,216 leaves)
- **Hash function**: Poseidon(2) over BN254 scalar field
- **Root history**: Ring buffer of the last 100 roots, allowing proofs generated against recent (but not current) roots to remain valid
- **State**: Stored in a zero-copy account (`MerkleTreeState`) with filled subtrees and empty hashes for efficient append-only insertion

When proving a withdrawal or transfer, the user generates a Merkle inclusion proof client-side showing their commitment exists at a specific leaf position under a known root.

## Proof System

### Circuit Pipeline

```
  Circom 2.1.0             snarkjs                   groth16-solana
  +----------+    compile    +--------+    prove     +------------------+
  | .circom  | -----------> | .wasm  | -----------> | Groth16 proof    |
  | circuit  |              | .zkey  |              | (256 bytes)      |
  +----------+              +--------+              +--------+---------+
                                                             |
                                                    format   | (negate pi_a.y,
                                                    for      |  swap pi_b coords)
                                                    Solana   |
                                                             v
                                                    +------------------+
                                                    | On-chain verify  |
                                                    | groth16-solana   |
                                                    | crate            |
                                                    +------------------+
```

### Circuits

Four Circom circuits define the protocol's constraint system:

1. **Deposit** (3 public inputs): Proves the commitment is correctly formed from the declared amount and asset. Prevents committing to more value than deposited.

2. **Withdraw** (5 public inputs): Proves knowledge of a note in the Merkle tree, derives the correct nullifier, and binds the proof to a specific recipient address. Includes a 64-bit range check on the amount.

3. **Relayed Withdraw** (6 public inputs): Same as withdraw but adds a committed operator fee. The fee is a public input so operators cannot manipulate it after the user generates the proof.

4. **Transfer** (4 public inputs): Spends one input note and creates two output notes (recipient + change). Enforces value conservation (`inAmount == outAmount1 + outAmount2`) and asset consistency. All amounts are range-checked to 64 bits.

### Proof Format Transformation

snarkjs outputs proofs in a JSON format that must be transformed for `groth16-solana`:

- **pi_a** (G1): Negate the y-coordinate using the BN254 *base field* prime (Fp), serialize as `[x, y']` in big-endian (64 bytes)
- **pi_b** (G2): Reverse coordinate pairs within each element, serialize as 128 bytes
- **pi_c** (G1): Direct serialization as `[x, y]` in big-endian (64 bytes)

Public inputs are serialized as 32-byte big-endian field elements.

## Transaction Flow

### Deposit

```
User                        SDK                         Solana
  |                           |                           |
  |  createNote(amount,asset) |                           |
  |-------------------------->|                           |
  |  computeCommitment(note)  |                           |
  |-------------------------->|                           |
  |  generateDepositProof()   |                           |
  |-------------------------->|                           |
  |  (snarkjs.groth16)        |                           |
  |<--------------------------|                           |
  |                           |  deposit instruction      |
  |                           |  [proof, commitment,      |
  |                           |   amount, encrypted_note] |
  |                           |-------------------------->|
  |                           |  verify_deposit_proof()   |
  |                           |  token::transfer(amount)  |
  |                           |  append_leaf(commitment)  |
  |                           |<--------------------------|
  |  Store note locally       |                           |
  |<--------------------------|                           |
```

### Withdrawal

```
User                        SDK                         Solana
  |                           |                           |
  |  Rebuild Merkle tree      |                           |
  |  from on-chain events     |                           |
  |-------------------------->|                           |
  |  tree.getProof(leafIndex) |                           |
  |-------------------------->|                           |
  |  generateWithdrawProof()  |                           |
  |-------------------------->|                           |
  |<--------------------------|                           |
  |                           |  withdraw instruction     |
  |                           |  [proof, nullifier, root, |
  |                           |   recipientHash, amount]  |
  |                           |-------------------------->|
  |                           |  is_known_root(root)      |
  |                           |  verify_withdraw_proof()  |
  |                           |  create nullifier PDA     |
  |                           |  token::transfer(amount)  |
  |                           |<--------------------------|
```

### Shielded Transfer

```
User                        SDK                         Solana
  |                           |                           |
  |  createNote(amt1, asset)  |  (recipient note)        |
  |  createNote(amt2, asset)  |  (change note)           |
  |-------------------------->|                           |
  |  generateTransferProof()  |                           |
  |-------------------------->|                           |
  |<--------------------------|                           |
  |                           |  shielded_transfer instr  |
  |                           |  [proof, nullifier, root, |
  |                           |   outCommit1, outCommit2] |
  |                           |-------------------------->|
  |                           |  is_known_root(root)      |
  |                           |  verify_transfer_proof()  |
  |                           |  create nullifier PDA     |
  |                           |  append_leaf(outCommit1)  |
  |                           |  append_leaf(outCommit2)  |
  |                           |<--------------------------|
  |  Send recipient note      |                           |
  |  secret out-of-band       |                           |
```

## Concurrency Model

The root history buffer (100 entries) provides tolerance for concurrent transactions. When a deposit occurs between proof generation and submission:

1. The deposit inserts a new leaf, changing the root.
2. The old root is pushed into the ring buffer.
3. The proof (generated against the old root) remains valid because `is_known_root` checks the full history.

If more than 100 insertions occur between proof generation and submission, the proof expires and must be regenerated.

## Fee Model

The Shielded Pool supports two fee mechanisms:

- **Protocol fee** (`fee_bps`): Basis-point fee deducted from withdrawals (max 1000 = 10%). Sent to the `fee_vault` PDA.
- **Burn fee** (`burn_bps`): Basis-point fee on deposits that buys ZERA tokens via Meteora CPAMM and burns them (max 2000 = 20%). Uses Pyth SOL/USD oracle for price calculation.
- **Operator fee** (relayed withdraw only): User-committed fee paid to the relay operator. Bound in the ZK proof to prevent manipulation.
