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

