/** @format */
import {
 calculatePKCECodeChallenge,
 generateRandomCodeVerifier,
 generateRandomNonce,
 generateRandomState,
} from "oauth4webapi";

/** Opaque `state` value that binds the authorization request to the callback. */
export function randomState(): string {
 return generateRandomState();
}

/** OIDC `nonce` value that binds the issued `id_token` to this request. */
export function randomNonce(): string {
 return generateRandomNonce();
}

/** RFC 7636 PKCE `code_verifier`. */
export function codeVerifier(): string {
 return generateRandomCodeVerifier();
}

/** S256 PKCE `code_challenge` derived from the verifier. */
export function codeChallenge(verifier: string): Promise<string> {
 return calculatePKCECodeChallenge(verifier);
}

// /**
//  * Hand-rolled PKCE helpers, replaced by oauth4webapi (`generateRandomState`,
//  * `generateRandomNonce`, `generateRandomCodeVerifier`,
//  * `calculatePKCECodeChallenge`).
//  */
// import { createHash, randomBytes } from "node:crypto";
//
// function base64url(input: Buffer): string {
//  return input
//   .toString("base64")
//   .replace(/\+/g, "-")
//   .replace(/\//g, "_")
//   .replace(/=+$/, "");
// }
//
// function randomString(bytes = 32): string {
//  return base64url(randomBytes(bytes));
// }
//
// export function randomState(): string {
//  return randomString();
// }
//
// export function randomNonce(): string {
//  return randomString();
// }
//
// export function codeVerifier(): string {
//  return randomString(48);
// }
//
// export function codeChallenge(verifier: string): string {
//  return base64url(createHash("sha256").update(verifier).digest());
// }
