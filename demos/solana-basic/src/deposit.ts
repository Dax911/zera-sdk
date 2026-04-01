/**
 * ZERA SDK Demo — Deposit Flow (Devnet)
 *
 * Demonstrates the full deposit flow against Solana devnet:
 * 1. Connect to devnet
 * 2. Create a shielded note
 * 3. Generate a deposit proof (requires circuit files)
 * 4. Build the deposit transaction
 * 5. Display the transaction for signing
 *
 * Note: This demo builds the transaction but does NOT submit it.
 * Circuit files (.wasm + .zkey) are required for proof generation.
 *
 * Run: pnpm --filter zera-solana-basic deposit
 */

import {
  createNote,
  computeCommitment,
  hashPubkeyToField,
  buildDepositTransaction,
  derivePoolConfig,
  deriveVault,
  USDC_MINT,
  SHIELDED_POOL_PROGRAM_ID,
} from "@zera-labs/sdk";
import { Connection, PublicKey, Keypair } from "@solana/web3.js";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RPC_URL = process.env.RPC_URL || "http://64.34.82.145:18899";
const DEPOSIT_AMOUNT = 1_000_000n; // 1 USDC

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("ZERA SDK — Deposit Flow Demo\n");
  console.log(`Network: ${RPC_URL}`);
  console.log(`Amount:  ${DEPOSIT_AMOUNT} base units (1 USDC)\n`);

  // 1. Connect
  const connection = new Connection(RPC_URL, "confirmed");
  const slot = await connection.getSlot();
  console.log(`Connected to devnet (slot ${slot})`);

  // 2. Generate a temporary keypair (in production, use a wallet adapter)
  const payer = Keypair.generate();
  console.log(`Payer:   ${payer.publicKey.toBase58()}`);

  // 3. Derive on-chain accounts
  const programId = new PublicKey(SHIELDED_POOL_PROGRAM_ID);
  const mint = new PublicKey(USDC_MINT);

  const [poolConfig] = derivePoolConfig(mint, programId);
  const [vault] = deriveVault(mint, programId);
  console.log(`Pool:    ${poolConfig.toBase58()}`);
  console.log(`Vault:   ${vault.toBase58()}`);

  // 4. Create shielded note
  console.log("\n--- Creating shielded note ---");
  const assetHash = await hashPubkeyToField(mint.toBytes());
  const note = createNote(DEPOSIT_AMOUNT, assetHash);
  const commitment = await computeCommitment(note);

  console.log(`Commitment: 0x${commitment.toString(16).slice(0, 24)}...`);
  console.log(`Secret:     0x${note.secret.toString(16).slice(0, 16)}... (KEEP PRIVATE)`);

  // 5. Build deposit transaction (without proof for demo purposes)
  console.log("\n--- Building deposit transaction ---");
  console.log(
    "Note: Full proof generation requires circuit files (.wasm + .zkey).",
  );
  console.log(
    "This demo shows transaction construction with placeholder proof data.\n",
  );

  // In a real flow, you would:
  //   const { proof } = await generateDepositProof(note, wasmPath, zkeyPath);
  //   const tx = buildDepositTransaction({ payer, mint, amount, commitment, proof, ... });

  const placeholderProof = {
    proofA: new Uint8Array(64),
    proofB: new Uint8Array(128),
    proofC: new Uint8Array(64),
  };

  const tx = buildDepositTransaction({
    payer: payer.publicKey,
    mint,
    amount: DEPOSIT_AMOUNT,
    commitment,
    proof: placeholderProof,
    publicInputs: [],
    programId,
  });

  // Set a recent blockhash so we can inspect the transaction size
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = payer.publicKey;

  console.log(`Transaction instructions: ${tx.instructions.length}`);
  console.log(`Estimated size: ~${tx.serializeMessage().length} bytes`);

  // 6. Summary
  console.log("\n--- What happens on-chain ---");
  console.log("1. SPL tokens transfer from payer's ATA to the pool vault");
  console.log("2. Groth16 proof is verified (deposit circuit)");
  console.log("3. Commitment is inserted into the Merkle tree");
  console.log("4. DepositEvent is emitted with the commitment");
  console.log("\nThe note's contents remain private — only the commitment is public.");
  console.log("\nTo complete this flow with real proofs, provide circuit files:");
  console.log("  WASM: ./circuits/deposit/deposit.wasm");
  console.log("  ZKEY: ./circuits/deposit/deposit.zkey");
}

main().catch(console.error);
