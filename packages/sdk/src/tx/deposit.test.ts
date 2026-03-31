import { describe, it, expect } from "vitest";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { buildDepositTransaction } from "./deposit";
import type { DepositParams } from "./deposit";
import {
  derivePoolConfig,
  deriveMerkleTree,
  deriveVault,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "../pda";
import { bigintToBytes32BE } from "../utils";
import { USDC_MINT, SHIELDED_POOL_PROGRAM_ID } from "../constants";

const payer = PublicKey.unique();
const mint = new PublicKey(USDC_MINT);
const programId = new PublicKey(SHIELDED_POOL_PROGRAM_ID);

function makeParams(overrides: Partial<DepositParams> = {}): DepositParams {
  return {
    payer,
    mint,
    amount: 1_000_000n,
    commitment: 42n,
    proof: {
      proofA: new Uint8Array(64),
      proofB: new Uint8Array(128),
      proofC: new Uint8Array(64),
    },
    publicInputs: [new Uint8Array(32)],
    ...overrides,
  };
}

describe("buildDepositTransaction", () => {
  it("returns a Transaction with one instruction", () => {
    const tx = buildDepositTransaction(makeParams());
    expect(tx.instructions.length).toBe(1);
  });

  it("instruction targets the shielded pool program", () => {
    const tx = buildDepositTransaction(makeParams());
    expect(tx.instructions[0].programId.equals(programId)).toBe(true);
  });

  it("includes correct account keys", () => {
    const tx = buildDepositTransaction(makeParams());
    const keys = tx.instructions[0].keys;

    const [poolConfig] = derivePoolConfig(mint, programId);
    const [merkleTree] = deriveMerkleTree(mint, programId);
    const [vault] = deriveVault(mint, programId);
    const userAta = getAssociatedTokenAddress(mint, payer);

    expect(keys[0].pubkey.equals(payer)).toBe(true);
    expect(keys[0].isSigner).toBe(true);
    expect(keys[1].pubkey.equals(poolConfig)).toBe(true);
    expect(keys[2].pubkey.equals(merkleTree)).toBe(true);
    expect(keys[3].pubkey.equals(vault)).toBe(true);
    expect(keys[4].pubkey.equals(userAta)).toBe(true);
    expect(keys[5].pubkey.equals(mint)).toBe(true);
    expect(keys[6].pubkey.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(keys[7].pubkey.equals(SystemProgram.programId)).toBe(true);
  });

  it("instruction data starts with 8-byte discriminator", () => {
    const tx = buildDepositTransaction(makeParams());
    const data = tx.instructions[0].data;
    expect(data.length).toBeGreaterThanOrEqual(8);
    // discriminator bytes for "deposit"
    expect(data[0]).toBe(0xf8);
    expect(data[1]).toBe(0xc6);
  });

  it("instruction data contains amount as u64 LE", () => {
    const amount = 1_000_000n;
    const tx = buildDepositTransaction(makeParams({ amount }));
    const data = tx.instructions[0].data;
    // amount starts at offset 8 (after discriminator)
    const amountBuf = data.subarray(8, 16);
    expect(amountBuf.readBigUInt64LE()).toBe(amount);
  });

  it("instruction data contains commitment as 32-byte BE", () => {
    const commitment = 12345n;
    const tx = buildDepositTransaction(makeParams({ commitment }));
    const data = tx.instructions[0].data;
    // commitment at offset 16 (after disc+amount)
    const commitmentBytes = data.subarray(16, 48);
    const expected = bigintToBytes32BE(commitment);
    expect(Buffer.from(commitmentBytes).equals(Buffer.from(expected))).toBe(
      true,
    );
  });

  it("supports custom programId override", () => {
    const custom = PublicKey.unique();
    const tx = buildDepositTransaction(makeParams({ programId: custom }));
    expect(tx.instructions[0].programId.equals(custom)).toBe(true);
  });

  it("total data length = 8 + 8 + 32 + 64 + 128 + 64 + publicInputs", () => {
    const publicInputs = [new Uint8Array(32), new Uint8Array(32)];
    const tx = buildDepositTransaction(makeParams({ publicInputs }));
    const expectedLen = 8 + 8 + 32 + 64 + 128 + 64 + 32 * 2;
    expect(tx.instructions[0].data.length).toBe(expectedLen);
  });
});
