import { describe, it, expect, beforeAll } from "vitest";
import { decryptSecret, encryptSecret, secretHint } from "@/lib/security/crypto";

beforeAll(() => { process.env.APP_ENCRYPTION_KEY = "unit-test-key-0123456789abcdef"; });

describe("secret encryption", () => {
  it("round-trips and never repeats ciphertext", () => {
    const a = encryptSecret("my-binance-secret");
    const b = encryptSecret("my-binance-secret");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("my-binance-secret");
    expect(a.startsWith("v1.")).toBe(true);
  });
  it("detects tampering", () => {
    const enc = encryptSecret("x");
    const tampered = enc.slice(0, -2) + (enc.endsWith("A") ? "BB" : "AA");
    expect(() => decryptSecret(tampered)).toThrow();
  });
  it("hints only the last characters", () => {
    expect(secretHint("abcdefgh")).toBe("…efgh");
  });
});
