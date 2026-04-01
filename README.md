# ZERA Confidential SDK

> **Unaudited** -- This SDK has not yet undergone a formal security audit. See [Security](docs/SECURITY.md) for details.

Privacy-preserving transaction infrastructure for Solana. ZERA enables confidential deposits, withdrawals, and shielded transfers using zero-knowledge proofs (Groth16 over BN254) with Poseidon-based commitments.

This monorepo provides the tools third-party developers need to integrate ZERA's privacy features into wallets, dApps, AI agents, and payment systems.

## Quick Start

**[Full Quickstart Guide](docs/QUICKSTART.md)** -- zero to running in under 5 minutes.

### 1. Point at the Devnet

A hosted Surfpool devnet (1:1 Solana mainnet fork) is available with the ZERA Pool program pre-deployed:

```
RPC:        http://64.34.82.145:18899
WebSocket:  ws://64.34.82.145:18900
```

```bash
solana config set --url http://64.34.82.145:18899
```

Or [run your own locally](devnet/SETUP.md) with Surfpool.

### 2. Install the SDK

```bash
npm install @zera-labs/sdk @solana/web3.js
```

### 3. Try It

```typescript
import {
  createNote, computeCommitment, computeNullifier,
  hashPubkeyToField, MerkleTree, USDC_MINT,
} from "@zera-labs/sdk";
import { PublicKey } from "@solana/web3.js";

const mint = new PublicKey(USDC_MINT);
const assetHash = await hashPubkeyToField(mint.toBytes());

// Create a private note (1 USDC)
const note = createNote(1_000_000n, assetHash);
const commitment = await computeCommitment(note);
const nullifier = await computeNullifier(note);

console.log("Commitment:", commitment.toString(16));
// Only you know the preimage. The commitment goes on-chain.
```

### 4. Run the Demos

```bash
# Offline crypto primitives (no network needed)
cd demos/solana-basic && pnpm install && pnpm demo

# Live pool status from devnet
pnpm status

# Full React privacy wallet
cd ../react-demo && pnpm install && pnpm dev
```

## On-Chain Programs

| Program | ID | Description |
|---|---|---|
| **Shielded Pool** | `B83jSQx1CT1hPRBupinaJaEkCjrfeo6Ktncu31q3ZNeX` | Full Groth16 shielded pool with Poseidon Merkle tree (height 24), supporting deposit, withdraw, relayed withdraw, and shielded transfer |
| **Private Cash** | `ESQxpH9XkBQT6EVeWwAzTZD1e9NrLMrY8RPQ9SidYsgF` | Commitment-based voucher system using Keccak-256 for lighter-weight private payments |

## Repository Structure

```
zera-sdk/
  crates/
    zera-core/         Rust: Poseidon hashing, Merkle tree, note/commitment/nullifier,
                       Groth16 proof formatting, PDA derivation
    zera-neon/         Rust: napi-rs Node.js native bindings for zera-core
  packages/
    sdk/               TypeScript: @zera-labs/sdk — crypto, proofs, tx builders, note store
    mcp-server/        TypeScript: @zera-labs/mcp-server — MCP tool server for AI agents
  demos/
    solana-basic/      CLI demos: offline crypto, deposit flow, pool status reader
    react-demo/        Full React privacy wallet with Solana wallet adapter
  devnet/              Surfpool config for 1:1 mainnet fork (runbooks, program binary, IDL)
  docs/                Architecture, API reference, integration guide, and more
```

## Devnet

The `devnet/` directory contains everything needed to run a local 1:1 Solana mainnet fork via [Surfpool](https://github.com/txtx/surfpool):

- **surfpool.toml** -- Network config with Light Protocol programs, state trees, and tokens
- **runbooks/** -- Infrastructure-as-code for cloning mainnet state and deploying ZERA Pool
- **accounts_dump/** -- Program binary (.so) and IDL (.json)

See [devnet/SETUP.md](devnet/SETUP.md) for full details, or use the hosted instance at `64.34.82.145:18899`.

## Documentation

| Document | Description |
|---|---|
| **[Quickstart](docs/QUICKSTART.md)** | **Start here** -- zero to running in 5 minutes |
| [Architecture](docs/ARCHITECTURE.md) | System design, layer diagram, privacy model |
| [API Reference](docs/API_REFERENCE.md) | Full TypeScript SDK API with signatures and examples |
| [Integration Guide](docs/INTEGRATION_GUIDE.md) | Step-by-step walkthrough for third-party developers |
| [Cryptography](docs/CRYPTOGRAPHY.md) | Poseidon, commitments, nullifiers, Merkle tree, Groth16 |
| [Examples](docs/EXAMPLES.md) | Complete runnable code for every operation |
| [Security](docs/SECURITY.md) | Threat model, audit status, responsible disclosure |
| [Agentic Integration](docs/AGENTIC_INTEGRATION.md) | AI agent payment patterns (MCP, x402, ElizaOS) |
| [Use Cases](docs/USE_CASES.md) | Real-world integration scenarios |

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
- Circuit files (`.wasm` + `.zkey`) for ZK proof generation (available on request)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, guidelines, and how to submit pull requests.

## License

[MIT](LICENSE)
