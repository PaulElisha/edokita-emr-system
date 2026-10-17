/** @format */
import { Env } from "@/env.ts";
import { CompactEncrypt, compactDecrypt } from "jose";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * 32-byte AES-256 key for encrypting secrets at rest (stored OpenEMR
 * credentials). Derived from TOKEN_ENCRYPTION_KEY, or the app JWT private key
 * when unset, so secrets are never persisted in plaintext.
 */
function encryptionKey(): Uint8Array {
 const material =
  Env.TOKEN_ENCRYPTION_KEY ||
  Env.APP_JWT_PRIVATE_KEY ||
  readFileSync(resolve(process.cwd(), "private-key.pem"), "utf8");
 return new Uint8Array(createHash("sha256").update(material).digest());
}

/** Encrypts a value into a compact JWE (`dir` / `A256GCM`). */
export async function encryptSecret(value: string): Promise<string> {
 return await new CompactEncrypt(textEncoder.encode(value))
  .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
  .encrypt(encryptionKey());
}

/**
 * Decrypts a value from {@link encryptSecret}. Values that are not compact JWEs
 * (e.g. legacy plaintext) are returned unchanged.
 */
export async function decryptSecret(value: string): Promise<string> {
 if (value.split(".").length !== 5) return value;
 const { plaintext } = await compactDecrypt(value, encryptionKey());
 return textDecoder.decode(plaintext);
}
