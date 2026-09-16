import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Symmetric encryption of exchange API credentials at rest (AES-256-GCM).
 * The key is derived from APP_ENCRYPTION_KEY; rotate it by re-encrypting rows.
 * Format: v1.<iv>.<tag>.<ciphertext> (base64url).
 */
function key(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw || raw.length < 16) throw new Error("APP_ENCRYPTION_KEY manquante ou trop courte (32 octets base64 recommandés)");
  return createHash("sha256").update(raw).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decryptSecret(blob: string): string {
  const [v, ivB, tagB, ctB] = blob.split(".");
  if (v !== "v1" || !ivB || !tagB || !ctB) throw new Error("Format de secret chiffré invalide");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ctB, "base64url")), decipher.final()]).toString("utf8");
}

export const secretHint = (s: string): string => (s.length <= 4 ? "****" : `…${s.slice(-4)}`);

export function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}
