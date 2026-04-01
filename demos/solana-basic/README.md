# ZERA Solana Basic Demo

Command-line demos showing SDK integration with Solana. All scripts default to the hosted ZERA devnet (Surfpool mainnet fork at `64.34.82.145:18899`).

## Scripts

### `pnpm demo` — Offline Cryptographic Demo

Runs all core SDK primitives without a Solana connection:
- Note creation, commitment, nullifier
- Merkle tree operations
- PDA derivation

### `pnpm deposit` — Deposit Flow

Walks through the full deposit flow against the devnet:
- Connects to the ZERA Surfpool devnet
- Creates a shielded note
- Builds the deposit transaction
- Shows what happens on-chain

### `pnpm status` — Pool Status Reader

Reads the shielded pool accounts and displays pool status.

Override the RPC with `RPC_URL` env var:

```bash
RPC_URL=http://127.0.0.1:8899 pnpm status       # local surfpool
RPC_URL=https://api.mainnet-beta.solana.com pnpm status  # mainnet
```

## Run

```bash
cd demos/solana-basic
pnpm install
pnpm demo       # offline crypto — no network needed
pnpm status     # live pool state from devnet
pnpm deposit    # full deposit flow
```
