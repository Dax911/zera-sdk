import { describe, it, expect } from "vitest";
import { Keypair } from "@solana/web3.js";
import { parseVoucher, VoucherParseError } from "./voucher";

const validRecipient = Keypair.generate().publicKey.toBase58();

function makeValidVoucher(overrides: Record<string, unknown> = {}) {
  return {
    voucherId: "0x" + "ab".repeat(32),
    amount: 1000,
    secret: "0x" + "cd".repeat(32),
    salt: "0x" + "ef".repeat(32),
    recipient: validRecipient,
    txSignature: "5KtP...fakeSig",
    createdAt: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("parseVoucher", () => {
  it("parses a valid voucher", () => {
    const result = parseVoucher(makeValidVoucher(), "test-id");
    expect(result.id).toBe("test-id");
    expect(result.amount).toBe(1000);
    expect(result.voucherId).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.secret).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.salt).toMatch(/^0x[0-9a-f]{64}$/);
    expect(result.recipient).toBe(validRecipient);
    expect(result.txSignature).toBe("5KtP...fakeSig");
    expect(result.createdAt).toBe("2025-01-01T00:00:00Z");
  });

  it("normalizes hex to lowercase 0x-prefixed", () => {
    const result = parseVoucher(
      makeValidVoucher({
        voucherId: "0X" + "AB".repeat(32),
        secret: "CD".repeat(32), // no prefix
        salt: "0x" + "EF".repeat(32),
      }),
      "id",
    );
    expect(result.voucherId).toBe("0x" + "ab".repeat(32));
    expect(result.secret).toBe("0x" + "cd".repeat(32));
    expect(result.salt).toBe("0x" + "ef".repeat(32));
  });

  it("accepts string amounts", () => {
    const result = parseVoucher(makeValidVoucher({ amount: "500" }), "id");
    expect(result.amount).toBe(500);
  });

  it("throws invalid on null input", () => {
    expect(() => parseVoucher(null, "id")).toThrow(VoucherParseError);
    try {
      parseVoucher(null, "id");
    } catch (e) {
      expect((e as VoucherParseError).reason).toBe("invalid");
    }
  });

  it("throws invalid on non-object", () => {
    expect(() => parseVoucher("not an object", "id")).toThrow(VoucherParseError);
  });

  it("throws legacy on old voucher format", () => {
    expect(() =>
      parseVoucher(
        makeValidVoucher({ transferSecret: "something" }),
        "id",
      ),
    ).toThrow(VoucherParseError);
    try {
      parseVoucher(makeValidVoucher({ nullifier: "something" }), "id");
    } catch (e) {
      expect((e as VoucherParseError).reason).toBe("legacy");
    }
  });

  it("throws on missing required fields", () => {
    const { txSignature, ...noTxSig } = makeValidVoucher();
    expect(() => parseVoucher(noTxSig, "id")).toThrow("missing required fields");
  });

  it("throws on invalid amount (zero)", () => {
    expect(() => parseVoucher(makeValidVoucher({ amount: 0 }), "id")).toThrow(
      "positive number",
    );
  });

  it("throws on negative amount", () => {
    expect(() =>
      parseVoucher(makeValidVoucher({ amount: -5 }), "id"),
    ).toThrow("positive number");
  });

  it("throws on invalid voucherId hex", () => {
    expect(() =>
      parseVoucher(makeValidVoucher({ voucherId: "0xshort" }), "id"),
    ).toThrow("32-byte hex string");
  });

  it("throws on invalid recipient pubkey", () => {
    expect(() =>
      parseVoucher(makeValidVoucher({ recipient: "not-a-pubkey!!!" }), "id"),
    ).toThrow("valid Solana public key");
  });

  it("throws on missing recipient", () => {
    expect(() =>
      parseVoucher(makeValidVoucher({ recipient: undefined }), "id"),
    ).toThrow("recipient is missing");
  });
});
