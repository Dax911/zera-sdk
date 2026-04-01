/**
 * ZERA SDK Demo — Pool Status Reader
 *
 * Reads the shielded pool's on-chain account data and displays pool status.
 * Works against any Solana cluster (mainnet, devnet, localnet).
 *
 * Run: pnpm --filter zera-solana-basic status
 */

import {
  derivePoolConfig,
  deriveMerkleTree,
  deriveVault,
  deriveFeeVault,
  SHIELDED_POOL_PROGRAM_ID,
  USDC_MINT,
} from "@zera-labs/sdk";
import { Connection, PublicKey } from "@solana/web3.js";

// ---------------------------------------------------------------------------
// Config — change RPC_URL to target different clusters
// ---------------------------------------------------------------------------

const RPC_URL = process.env.RPC_URL || "http://64.34.82.145:18899";

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("ZERA Shielded Pool — On-Chain Status\n");

  const connection = new Connection(RPC_URL, "confirmed");
  const programId = new PublicKey(SHIELDED_POOL_PROGRAM_ID);

  console.log(`RPC:        ${RPC_URL}`);
  console.log(`Program:    ${programId.toBase58()}`);
  console.log(`USDC Mint:  ${USDC_MINT}\n`);

  // Derive all PDAs
  const mint = new PublicKey(USDC_MINT);
  const [poolConfig, poolBump] = derivePoolConfig(mint, programId);
  const [merkleTree, treeBump] = deriveMerkleTree(mint, programId);
  const [vault, vaultBump] = deriveVault(mint, programId);
  const [feeVault, feeBump] = deriveFeeVault(mint, programId);

  console.log("--- Derived Accounts ---");
  console.log(`Pool Config:  ${poolConfig.toBase58()} (bump ${poolBump})`);
  console.log(`Merkle Tree:  ${merkleTree.toBase58()} (bump ${treeBump})`);
  console.log(`Vault:        ${vault.toBase58()} (bump ${vaultBump})`);
  console.log(`Fee Vault:    ${feeVault.toBase58()} (bump ${feeBump})`);

  // Check account existence and balances
  console.log("\n--- Account Status ---");

  const accounts = [
    { name: "Pool Config", key: poolConfig },
    { name: "Merkle Tree", key: merkleTree },
    { name: "Vault", key: vault },
    { name: "Fee Vault", key: feeVault },
  ];

  for (const { name, key } of accounts) {
    try {
      const info = await connection.getAccountInfo(key);
      if (info) {
        console.log(
          `${name.padEnd(14)} EXISTS  owner=${info.owner.toBase58().slice(0, 8)}...  ` +
            `data=${info.data.length} bytes  lamports=${info.lamports}`,
        );
      } else {
        console.log(`${name.padEnd(14)} NOT FOUND`);
      }
    } catch (err) {
      console.log(`${name.padEnd(14)} ERROR: ${err}`);
    }
  }

  // Check vault token balance
  console.log("\n--- Vault Token Balance ---");
  try {
    const tokenAccounts = await connection.getTokenAccountBalance(vault);
    console.log(`USDC in vault: ${tokenAccounts.value.uiAmountString} USDC`);
    console.log(`Raw amount:    ${tokenAccounts.value.amount} base units`);
  } catch {
    console.log("Vault token account not found or not initialized");
  }
}

main().catch(console.error);
