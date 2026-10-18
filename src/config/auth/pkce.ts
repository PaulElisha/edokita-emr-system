import {
 calculatePKCECodeChallenge,
 generateRandomCodeVerifier,
 generateRandomNonce,
 generateRandomState,
} from "oauth4webapi";

export function randomState(): string {
 return generateRandomState();
}

export function randomNonce(): string {
 return generateRandomNonce();
}

export function codeVerifier(): string {
 return generateRandomCodeVerifier();
}

export function codeChallenge(verifier: string): Promise<string> {
 return calculatePKCECodeChallenge(verifier);
}
