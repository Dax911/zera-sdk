# ZERA Privacy Wallet Demo

A real privacy wallet built on the ZERA SDK with Solana wallet connection and live on-chain data.

## Features

- **Wallet Connection** — Connect Phantom, Solflare, or any Solana wallet via wallet adapter
- **Live Balances** — Real SOL and USDC balances from mainnet, plus shielded note balance
- **Shield (Deposit)** — Full deposit flow using the SDK: create note, compute Poseidon commitment, derive nullifier, insert into Merkle tree, build Solana transaction
- **Private Transfer** — Split a shielded note into payment + change with Merkle proof generation, real commitment computation, and nullifier derivation
- **Withdraw (Unshield)** — Convert shielded notes back to public USDC with recipient binding, fee calculation, and transaction building
- **On-Chain Pool Status** — Live reads of the shielded pool program, config PDA, vault TVL
- **Step-by-Step SDK Ops** — Every cryptographic operation shown with real timing data

## Run

```bash
cd demos/react-demo
pnpm install
pnpm dev
```

Open http://localhost:5173 in your browser. Defaults to the hosted ZERA devnet (`64.34.82.145:18899`).

Override the RPC URL via environment variable:

```bash
VITE_RPC_URL=http://127.0.0.1:8899 pnpm dev   # local surfpool
```

## How it works

This is a real implementation using the ZERA SDK — not stubs:

- **Wallet adapter** provides real wallet connection and transaction signing
- **`@solana/web3.js`** reads real on-chain account data (balances, pool state)
- **`createNote()`** generates cryptographically random 248-bit secrets
- **`computeCommitment()`** runs real Poseidon hashing over BN254
- **`computeNullifier()`** derives deterministic nullifiers for double-spend prevention
- **`MerkleTree`** maintains a real incremental Poseidon tree
- **`buildDepositTransaction()`** / **`buildWithdrawTransaction()`** build real Solana transactions
- **PDA derivation** matches the on-chain program's account structure exactly

The only part that requires circuit files (.wasm + .zkey) is Groth16 proof generation — everything else runs for real.

## Architecture

Single-file React app with 4 tabs:
- **Dashboard** — balances, pool status, shielded notes, wallet info
- **Shield** — deposit flow with step-by-step SDK operations
- **Transfer** — private send with note splitting
- **Withdraw** — unshield with fee calculation and recipient binding
