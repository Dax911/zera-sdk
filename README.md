# ZERA Confidential SDK

Privacy-preserving transaction infrastructure for Solana. ZERA enables confidential deposits, withdrawals, and shielded transfers using zero-knowledge proofs (Groth16 over BN254) with Poseidon-based commitments.

This monorepo provides the tools third-party developers need to integrate ZERA's privacy features into wallets, dApps, AI agents, and payment systems.

## On-Chain Programs

| Program | ID | Description |
|---|---|---|
| **Shielded Pool** | `B83jSQx1CT1hPRBupinaJaEkCjrfeo6Ktncu31q3ZNeX` | Full Groth16 shielded pool with Poseidon Merkle tree (height 24), supporting deposit, withdraw, relayed withdraw, and shielded transfer |
| **Private Cash** | `ESQxpH9XkBQT6EVeWwAzTZD1e9NrLMrY8RPQ9SidYsgF` | Commitment-based voucher system using Keccak-256 for lighter-weight private payments |

## Repository Structure

```
zera-sdk/
  crates/
    zera-core/         Rust: Poseidon hashing, Merkle tree, note/commitment/nullifier
                       computation, Groth16 proof formatting, PDA derivation
    zera-neon/         Rust: neon-rs Node.js native bindings for zera-core
  packages/
    sdk/               TypeScript: Client-side crypto (Poseidon + Keccak), note
                       management, Merkle tree, ZK proof generation via snarkjs,
                       transaction builders, PDA helpers, voucher system
  docs/                Architecture, API reference, integration guide, and more
```

## Quick Start

### TypeScript SDK

```bash
npm install @zera-labs/sdk
```

```typescript
import {
  createNote,
  computeCommitment,
  computeNullifier,
  MerkleTree,
  generateDepositProof,
  formatProofForSolana,
} from "@zera-labs/sdk";

// 1. Create a shielded note
const note = createNote(1_000_000n, assetHash); // 1 USDC

// 2. Compute the Poseidon commitment
const commitment = await computeCommitment(note);

// 3. Generate a Groth16 deposit proof
const { proof } = await generateDepositProof(note, wasmPath, zkeyPath);

// 4. Submit the deposit transaction to Solana
// (see Integration Guide for full transaction building)
```

### Rust Core

Add to your `Cargo.toml`:

```toml
[dependencies]
zera-core = { git = "https://github.com/zera-labs/zera-sdk", path = "crates/zera-core" }
```

```rust
use zera_core::{poseidon_hash, compute_commitment, compute_nullifier};

// Compute a Poseidon commitment
let commitment = compute_commitment(amount, secret, blinding, asset, &memo)?;

// Derive the nullifier for spending
let nullifier = compute_nullifier(secret, commitment)?;
```

## Documentation

| Document | Description |
|---|---|
| [Architecture](docs/ARCHITECTURE.md) | System design, layer diagram, privacy model |
| [API Reference](docs/API_REFERENCE.md) | Full TypeScript SDK API with signatures and examples |
| [Integration Guide](docs/INTEGRATION_GUIDE.md) | Step-by-step walkthrough for third-party developers |
| [Cryptography](docs/CRYPTOGRAPHY.md) | Poseidon, commitments, nullifiers, Merkle tree, Groth16 |
| [Examples](docs/EXAMPLES.md) | Complete runnable code for every operation |
| [Security](docs/SECURITY.md) | Threat model, audit status, responsible disclosure |

## Key Concepts

- **Note**: A private UTXO containing an amount, asset identifier, random secret, blinding factor, and memo. Only the creator knows the preimage.
- **Commitment**: `Poseidon(amount, secret, blinding, asset, memo[0..3])` -- a binding, hiding hash stored on-chain as a Merkle leaf.
- **Nullifier**: `Poseidon(secret, commitment)` -- revealed when spending a note to prevent double-spend. On-chain existence check via PDA.
- **Merkle Tree**: Incremental Poseidon-based tree (height 24, capacity 16M leaves) with a 100-entry root history buffer for concurrent transaction tolerance.
- **Groth16 Proofs**: Four circuits (deposit, withdraw, relayed withdraw, transfer) compiled with Circom, proved with snarkjs, verified on-chain with `groth16-solana`.

## Requirements

- Node.js >= 18
- Solana CLI >= 1.18 (for on-chain interaction)
- Rust >= 1.75 (for building crates)
- Circuit files (`.wasm` + `.zkey`) for ZK proof generation

## License

MIT
