# ZERA Devnet Infrastructure

## Overview

The ZERA devnet is a 1:1 Solana mainnet fork via [Surfpool](https://surfpool.run) with Light Protocol ZK Compression and the ZERA Shielded Pool program deployed. This gives developers a realistic testing environment with real mainnet account state, token mints, and program behavior — without risking real funds.

## Hosted Devnet Endpoints

| Service | URL | Description |
|---------|-----|-------------|
| Solana RPC | `http://64.34.82.145:18899` | JSON-RPC (forked from mainnet) |
| WebSocket | `ws://64.34.82.145:18900` | Real-time subscriptions |
| Surfpool Studio | `http://64.34.82.145` | Dashboard UI (basic auth) |

The hosted devnet runs on a Latitude server and is available 24/7 for team and partner testing.

## Running Locally

### Prerequisites

- **Surfpool** — Install via Homebrew or the install script:
  ```bash
  brew install txtx/taps/surfpool
  ```
  or:
  ```bash
  curl -sL https://run.surfpool.run/ | bash
  ```
- **A mainnet RPC URL** (for forking state)

### Start the Devnet

```bash
cd devnet
surfpool start --manifest-file-path ./txtx.yml --rpc-url "https://api.mainnet-beta.solana.com"
```

Replace the RPC URL with your own provider (Helius, Triton, QuickNode) for better rate limits. Surfpool will fork mainnet state and deploy the ZERA Pool program automatically.

### Local Endpoints

After starting, the following endpoints are available:

| Service | URL |
|---------|-----|
| RPC | `http://127.0.0.1:8899` |
| WebSocket | `ws://127.0.0.1:8900` |
| Studio | `http://127.0.0.1:18488` |

## Programs

| Program | Address | Source |
|---------|---------|--------|
| ZERA Pool (Shielded Pool) | `B83jSQx1CT1hPRBupinaJaEkCjrfeo6Ktncu31q3ZNeX` | Local binary (`accounts_dump/zera_pool.so`) |
| Light System Program | `SySTEM1eSU2p4BGQfQpimFEWWSC1XDFeun3Nqzz3rT7` | Cloned from mainnet |
| Light Token Program | `cTokenmWW8bLPjZEBAUgYy3zKxQZW6VKi7bqNFEVv3m` | Cloned from mainnet |
| Account Compression | `compr6CUsB5m2jS4Y3831ztGSTnDpnKJTKS95d64XVq` | Cloned from mainnet |
| SPL Noop | `noopb9bkMVfRPU8AsbpTUg8AQkHtKwDKGTGHb22Gqs` | Cloned from mainnet |

## Tokens

| Token | Address |
|-------|---------|
| ZERA | `8avjtjHAHFqp4g2RR9ALAGBpSTqKPZR8nRbzSTwZERA` |
| USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| USDT | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` |
| Wrapped SOL | `So11111111111111111111111111111111111111112` |

Since the devnet forks mainnet, all standard SPL token mints and their metadata are available at their canonical addresses.

## Configuration Files

| File | Purpose |
|------|---------|
| `surfpool.toml` | Network config, program and account declarations |
| `txtx.yml` | Surfpool manifest (runbook registry, environment config) |
| `runbooks/setup_light.tx` | Clones Light Protocol programs and state trees from mainnet |
| `runbooks/zera_subgraph.tx` | Deploys ZERA Pool program and indexes PDAs/events via subgraphs |
| `accounts_dump/` | Program binaries (`.so`) and IDLs (`.json`) for local deployment |

## Runbooks

Surfpool uses runbooks (Infrastructure as Code) to set up the network. These run automatically when Surfpool starts with the manifest, or can be triggered individually from Studio.

1. **`setup_light.tx`** — Clones Light Protocol V3 programs and all state trees/queues from mainnet. This ensures ZK Compression is fully functional on the local fork.
2. **`zera_subgraph.tx`** — Deploys the ZERA Pool program from the local `.so` binary (`accounts_dump/zera_pool.so`) and sets up subgraph indexing for `PoolConfig`, `MerkleTreeState` PDAs, and protocol events (`Deposit`, `Withdraw`, `Transfer`).

## Surfpool Features

- **Universal Faucet**: Automatically airdrops SOL to wallets that need gas — no manual funding required.
- **Mainnet State**: All mainnet accounts and programs are available, fetched on demand as transactions reference them.
- **Transaction Inspector**: Debug transactions step-by-step in Surfpool Studio.
- **IDL-to-SQL**: Query on-chain program state via SQL in Studio using the deployed IDL (`accounts_dump/zera_pool.json`).

## Wallet Configuration

### Solana CLI

Point the Solana CLI at the devnet:

```bash
solana config set --url http://64.34.82.145:18899
```

For local:

```bash
solana config set --url http://127.0.0.1:8899
```

### Browser Wallets (Phantom, Solflare, etc.)

1. Open wallet settings.
2. Navigate to the network/RPC configuration.
3. Add a custom RPC: `http://64.34.82.145:18899`
4. Select the custom network.

### SDK Usage

When initializing the ZERA SDK, pass the devnet RPC URL:

```typescript
import { ZeraClient } from "@zera-labs/sdk";

const client = new ZeraClient({
  rpcUrl: "http://64.34.82.145:18899",
  // ... other config
});
```
