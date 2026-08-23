// Ojas — crypto utilities for PII encryption (AES-256-GCM) and deterministic
// lookup hashing (SHA-256). Mobile numbers are never decrypted for lookup —
// the deterministic hash is the lookup key (fixes B9).
//
// Key sourcing: see src/lib/env.ts. The PII key has NO production fallback —
// env.ts fails closed at startup in production if OJAS_PII_KEY is missing or
// < 32 chars. Key rotation architecture is documented in SECURITY.md.
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "crypto";
import { PII_KEY } from "@/lib/env";

const PII_KEY_RAW = PII_KEY;
const KEY_LEN = 32;
// Static salt is acceptable here because the key itself is a high-entropy secret
// (>= 32 chars). scrypt derives a 32-byte AES key. Key rotation swaps the entire
// OJAS_PII_KEY value; re-encryption of existing PII is a documented migration.
const DERIVED_KEY = scryptSync(PII_KEY_RAW, "ojas-pii-salt", KEY_LEN);

/** Deterministic SHA-256 lookup hash — safe for `WHERE mobileHash = ?` lookups. */
export function lookupHash(plaintext: string): string {
  return createHash("sha256").update("ojas:" + plaintext).digest("hex");
}

/** Encrypt a PII value (e.g. mobile number) with AES-256-GCM. Returns `iv:tag:cipher` hex. */
export function encryptPII(plaintext: string): string {
  const iv = randomBytes(12); // fresh random 96-bit IV per message (GCM)
  const cipher = createCipheriv("aes-256-gcm", DERIVED_KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag(); // 128-bit authentication tag
  return Buffer.concat([iv, tag, enc]).toString("hex");
}

/** Decrypt a PII value. Only used for display/audit — never for lookup. */
export function decryptPII(payload: string): string {
  const buf = Buffer.from(payload, "hex");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", DERIVED_KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/** Mask a mobile number for display: +91 98XXXXX421 */
export function maskMobile(mobile: string): string {
  if (mobile.length <= 4) return "•".repeat(mobile.length);
  return mobile.slice(0, mobile.length - 4).replace(/./g, "•") + mobile.slice(-4);
}
