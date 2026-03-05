// ---------------------------------------------------------------------------
// Environment-based configuration for the ZERA MCP server
// ---------------------------------------------------------------------------

export interface ZeraConfig {
  /** Solana RPC URL. */
  rpcUrl: string;

  /** ZERA shielded-pool program ID (base58). */
  programId: string;

  /** Path to the deposit circuit WASM file. */
  depositWasmPath: string;

  /** Path to the deposit circuit zkey file. */
  depositZkeyPath: string;

  /** Path to the withdraw circuit WASM file. */
  withdrawWasmPath: string;

  /** Path to the withdraw circuit zkey file. */
  withdrawZkeyPath: string;

  /** Path to the transfer circuit WASM file. */
  transferWasmPath: string;

  /** Path to the transfer circuit zkey file. */
  transferZkeyPath: string;

  /** Path to the encrypted note store file. */
  noteStorePath: string;

  /** Solana wallet keypair path (standard Solana CLI format). */
  walletPath: string;
}

/**
 * Load configuration from environment variables.
 *
 * Required:
 *   SOLANA_RPC_URL
 *
 * Optional (with defaults):
 *   ZERA_PROGRAM_ID          - defaults to the SDK's SHIELDED_POOL_PROGRAM_ID
 *   ZERA_DEPOSIT_WASM_PATH   - path to deposit.wasm
 *   ZERA_DEPOSIT_ZKEY_PATH   - path to deposit.zkey
 *   ZERA_WITHDRAW_WASM_PATH  - path to withdraw.wasm
 *   ZERA_WITHDRAW_ZKEY_PATH  - path to withdraw.zkey
 *   ZERA_TRANSFER_WASM_PATH  - path to transfer.wasm
 *   ZERA_TRANSFER_ZKEY_PATH  - path to transfer.zkey
 *   ZERA_NOTE_STORE_PATH     - defaults to ~/.zera/notes.enc
 *   ZERA_WALLET_PATH         - defaults to ~/.config/solana/id.json
 */
export function loadConfig(): ZeraConfig {
  const rpcUrl = requireEnv("SOLANA_RPC_URL");

  const home = process.env.HOME ?? process.env.USERPROFILE ?? "~";
  const defaultCircuitDir = `${home}/.zera/circuits`;

  return {
    rpcUrl,
    programId: process.env.ZERA_PROGRAM_ID ?? "",
    depositWasmPath:
      process.env.ZERA_DEPOSIT_WASM_PATH ??
      `${defaultCircuitDir}/deposit.wasm`,
    depositZkeyPath:
      process.env.ZERA_DEPOSIT_ZKEY_PATH ??
      `${defaultCircuitDir}/deposit.zkey`,
    withdrawWasmPath:
      process.env.ZERA_WITHDRAW_WASM_PATH ??
      `${defaultCircuitDir}/withdraw.wasm`,
    withdrawZkeyPath:
      process.env.ZERA_WITHDRAW_ZKEY_PATH ??
      `${defaultCircuitDir}/withdraw.zkey`,
    transferWasmPath:
      process.env.ZERA_TRANSFER_WASM_PATH ??
      `${defaultCircuitDir}/transfer.wasm`,
    transferZkeyPath:
      process.env.ZERA_TRANSFER_ZKEY_PATH ??
      `${defaultCircuitDir}/transfer.zkey`,
    noteStorePath:
      process.env.ZERA_NOTE_STORE_PATH ?? `${home}/.zera/notes.enc`,
    walletPath:
      process.env.ZERA_WALLET_PATH ?? `${home}/.config/solana/id.json`,
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Set it in your claude_desktop_config.json env block or shell environment.`
    );
  }
  return value;
}
