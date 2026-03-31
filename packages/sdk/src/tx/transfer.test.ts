import { describe, it, expect } from "vitest";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import { buildTransferTransaction } from "./transfer";
import type { TransferParams } from "./transfer";
import {
  derivePoolConfig,
  deriveMerkleTree,
  deriveNullifier,
} from "../pda";
import { bigintToBytes32BE } from "../utils";
import { USDC_MINT, SHIELDED_POOL_PROGRAM_ID } from "../constants";

const payer = PublicKey.unique();
const mint = new PublicKey(USDC_MINT);
const programId = new PublicKey(SHIELDED_POOL_PROGRAM_ID);

function makeParams(overrides: Partial<TransferParams> = {}): TransferParams {
  return {
    payer,
    mint,
    nullifierHash: 111n,
    outputCommitment1: 222n,
    outputCommitment2: 333n,
    root: 444n,
    proof: {
      proofA: new Uint8Array(64),
      proofB: new Uint8Array(128),
      proofC: new Uint8Array(64),
    },
    publicInputs: [new Uint8Array(32)],
    ...overrides,
  };
}

describe("buildTransferTransaction", () => {
  it("returns a Transaction with one instruction", () => {
    const tx = buildTransferTransaction(makeParams());
    expect(tx.instructions.length).toBe(1);
  });

  it("instruction targets the shielded pool program", () => {
    const tx = buildTransferTransaction(makeParams());
    expect(tx.instructions[0].programId.equals(programId)).toBe(true);
  });

  it("includes correct account keys", () => {
    const nullifierHash = 111n;
    const tx = buildTransferTransaction(makeParams({ nullifierHash }));
    const keys = tx.instructions[0].keys;

    const [poolConfig] = derivePoolConfig(mint, programId);
    const [merkleTree] = deriveMerkleTree(mint, programId);
    const [nullifierPda] = deriveNullifier(nullifierHash, programId);

    expect(keys[0].pubkey.equals(payer)).toBe(true);
    expect(keys[0].isSigner).toBe(true);
    expect(keys[1].pubkey.equals(poolConfig)).toBe(true);
    expect(keys[2].pubkey.equals(merkleTree)).toBe(true);
    expect(keys[3].pubkey.equals(nullifierPda)).toBe(true);
    expect(keys[4].pubkey.equals(mint)).toBe(true);
    expect(keys[5].pubkey.equals(SystemProgram.programId)).toBe(true);
  });

  it("has 6 account keys", () => {
    const tx = buildTransferTransaction(makeParams());
    expect(tx.instructions[0].keys.length).toBe(6);
  });

  it("instruction data starts with transfer discriminator", () => {
    const tx = buildTransferTransaction(makeParams());
    const data = tx.instructions[0].data;
    expect(data[0]).toBe(0xa3);
    expect(data[1]).toBe(0x34);
  });

  it("instruction data contains nullifier, root, and output commitments", () => {
    const nullifierHash = 10n;
    const root = 20n;
    const outputCommitment1 = 30n;
    const outputCommitment2 = 40n;
    const tx = buildTransferTransaction(
      makeParams({ nullifierHash, root, outputCommitment1, outputCommitment2 }),
    );
    const data = tx.instructions[0].data;

    // nullifier at offset 8
    expect(
      Buffer.from(data.subarray(8, 40)).equals(Buffer.from(bigintToBytes32BE(nullifierHash))),
    ).toBe(true);
    // root at offset 40
    expect(
      Buffer.from(data.subarray(40, 72)).equals(Buffer.from(bigintToBytes32BE(root))),
    ).toBe(true);
    // output commitment 1 at offset 72
    expect(
      Buffer.from(data.subarray(72, 104)).equals(Buffer.from(bigintToBytes32BE(outputCommitment1))),
    ).toBe(true);
    // output commitment 2 at offset 104
    expect(
      Buffer.from(data.subarray(104, 136)).equals(Buffer.from(bigintToBytes32BE(outputCommitment2))),
    ).toBe(true);
  });
});
