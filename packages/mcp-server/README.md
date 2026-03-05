# @zera-labs/mcp-server

MCP (Model Context Protocol) server for the ZERA private payment protocol on Solana. Exposes shielded pool operations as tools that any MCP-compatible AI agent (Claude, ChatGPT, Gemini, Cursor, etc.) can call to deposit, transfer, withdraw, and check balances -- all with Groth16 zero-knowledge proof privacy.

## Quick Start

```bash
npx @zera-labs/mcp-server
```

Or install globally:

```bash
npm install -g @zera-labs/mcp-server
zera-mcp
```

## Claude Desktop Configuration

Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "zera-protocol": {
      "command": "npx",
      "args": ["-y", "@zera-labs/mcp-server"],
      "env": {
        "SOLANA_RPC_URL": "https://api.mainnet-beta.solana.com",
        "ZERA_NOTE_STORE_PATH": "~/.zera/notes.enc",
        "ZERA_WALLET_PATH": "~/.config/solana/id.json"
      }
    }
  }
}
```

Config file location:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SOLANA_RPC_URL` | Yes | -- | Solana RPC endpoint |
| `ZERA_PROGRAM_ID` | No | SDK default | Shielded pool program ID (base58) |
| `ZERA_DEPOSIT_WASM_PATH` | No | `~/.zera/circuits/deposit.wasm` | Deposit circuit WASM |
| `ZERA_DEPOSIT_ZKEY_PATH` | No | `~/.zera/circuits/deposit.zkey` | Deposit circuit zkey |
| `ZERA_WITHDRAW_WASM_PATH` | No | `~/.zera/circuits/withdraw.wasm` | Withdraw circuit WASM |
| `ZERA_WITHDRAW_ZKEY_PATH` | No | `~/.zera/circuits/withdraw.zkey` | Withdraw circuit zkey |
| `ZERA_TRANSFER_WASM_PATH` | No | `~/.zera/circuits/transfer.wasm` | Transfer circuit WASM |
| `ZERA_TRANSFER_ZKEY_PATH` | No | `~/.zera/circuits/transfer.zkey` | Transfer circuit zkey |
| `ZERA_NOTE_STORE_PATH` | No | `~/.zera/notes.enc` | Encrypted note store file path |
| `ZERA_WALLET_PATH` | No | `~/.config/solana/id.json` | Solana wallet keypair file |

## Available Tools

### `zera_deposit`

Deposit USDC into the shielded pool. Funds become private and untraceable after deposit.

- `amount` (number, required) -- Amount of USDC to deposit
- `memo` (string, optional) -- Private memo for your records

### `zera_transfer`

Send shielded USDC to a recipient. Neither sender, recipient, nor amount are visible on-chain.

- `amount` (number, required) -- Amount of USDC to send
- `recipient` (string, required) -- Recipient's ZERA shielded address or public key
- `memo` (string, optional) -- Private memo for the recipient

### `zera_withdraw`

Withdraw USDC from the shielded pool to a public Solana wallet.

- `amount` (number, required) -- Amount of USDC to withdraw
- `destination` (string, required) -- Solana wallet address to receive the USDC

### `zera_balance`

Check your shielded USDC balance. Purely local operation -- nothing is revealed on-chain.

No parameters required.

## Development

```bash
# From the monorepo root
pnpm install
pnpm --filter @zera-labs/mcp-server dev
```
