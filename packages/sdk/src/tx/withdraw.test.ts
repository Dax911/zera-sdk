import { describe, it, expect } from "vitest";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { buildWithdrawTransaction } from "./withdraw";
import type { WithdrawParams } from "./withdraw";
import {
  derivePoolConfig,
  deriveMerkleTree,
  deriveVault,
  deriveNullifier,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "../pda";
import { bigintToBytes32BE } from "../utils";
import { USDC_MINT, SHIELDED_POOL_PROGRAM_ID } from "../constants";

const payer = PublicKey.unique();
const recipient = PublicKey.unique();
const mint = new PublicKey(USDC_MINT);
const programId = new PublicKey(SHIELDED_POOL_PROGRAM_ID);

function makeParams(overrides: Partial<WithdrawParams> = {}): WithdrawParams {
  return {
    payer,
    recipient,
    mint,
    amount: 500_000n,
    nullifierHash: 9999n,
    root: 88888n,
    proof: {
      proofA: new Uint8Array(64),
      proofB: new Uint8Array(128),
      proofC: new Uint8Array(64),
    },
    publicInputs: [new Uint8Array(32)],
    ...overrides,
  };
}

describe("buildWithdrawTransaction", () => {
  it("returns a Transaction with one instruction", () => {
    const tx = buildWithdrawTransaction(makeParams());
    expect(tx.instructions.length).toBe(1);
  });

  it("instruction targets the shielded pool program", () => {
    const tx = buildWithdrawTransaction(makeParams());
    expect(tx.instructions[0].programId.equals(programId)).toBe(true);
  });

  it("includes correct account keys", () => {
    const nullifierHash = 9999n;
    const tx = buildWithdrawTransaction(makeParams({ nullifierHash }));
    const keys = tx.instructions[0].keys;

    const [poolConfig] = derivePoolConfig(mint, programId);
    const [merkleTree] = deriveMerkleTree(mint, programId);
    const [vault] = deriveVault(mint, programId);
    const [nullifierPda] = deriveNullifier(nullifierHash, programId);
    const recipientAta = getAssociatedTokenAddress(mint, recipient);

    expect(keys[0].pubkey.equals(payer)).toBe(true);
    expect(keys[0].isSigner).toBe(true);
    expect(keys[1].pubkey.equals(recipient)).toBe(true);
    expect(keys[2].pubkey.equals(poolConfig)).toBe(true);
    expect(keys[3].pubkey.equals(merkleTree)).toBe(true);
    expect(keys[4].pubkey.equals(vault)).toBe(true);
    expect(keys[5].pubkey.equals(recipientAta)).toBe(true);
    expect(keys[6].pubkey.equals(nullifierPda)).toBe(true);
    expect(keys[7].pubkey.equals(mint)).toBe(true);
    expect(keys[8].pubkey.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(keys[9].pubkey.equals(SystemProgram.programId)).toBe(true);
  });

  it("instruction data starts with withdraw discriminator", () => {
    const tx = buildWithdrawTransaction(makeParams());
    const data = tx.instructions[0].data;
    expect(data[0]).toBe(0xb7);
    expect(data[1]).toBe(0x12);
  });

  it("instruction data contains amount, nullifier, and root", () => {
    const amount = 500_000n;
    const nullifierHash = 42n;
    const root = 123n;
    const tx = buildWithdrawTransaction(
      makeParams({ amount, nullifierHash, root }),
    );
    const data = tx.instructions[0].data;

    // amount at offset 8
    expect(data.subarray(8, 16).readBigUInt64LE()).toBe(amount);
    // nullifier at offset 16
    const nullBytes = data.subarray(16, 48);
    expect(Buffer.from(nullBytes).equals(Buffer.from(bigintToBytes32BE(nullifierHash)))).toBe(true);
    // root at offset 48
    const rootBytes = data.subarray(48, 80);
    expect(Buffer.from(rootBytes).equals(Buffer.from(bigintToBytes32BE(root)))).toBe(true);
  });

  it("has 10 account keys", () => {
    const tx = buildWithdrawTransaction(makeParams());
    expect(tx.instructions[0].keys.length).toBe(10);
  });
});
