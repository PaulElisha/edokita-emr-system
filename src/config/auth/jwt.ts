import { Env } from "@/env.ts";
import type { UserRole } from "@db/schema/role.ts";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
 SignJWT,
 jwtVerify,
 decodeJwt,
 importPKCS8,
 importSPKI,
 JWTPayload,
} from "jose";

const ALG = "RS256";
const KID = "edokita-api-key-1";
const ISSUER = "e-dokita";
const AUDIENCE = "e-dokita-api";

const ACCESS_TOKEN_TTL = "15m";

export interface JwtPayload extends JWTPayload {
 userId: string;
 role: UserRole;
 email: string;
 sessionEpoch?: number;
}

function pem(value: string | undefined, file: string): string {
 if (value && value.length > 0) return value.replace(/\\n/g, "\n");
 return readFileSync(resolve(process.cwd(), file), "utf8");
}

let privateKeyPromise: ReturnType<typeof importPKCS8> | null = null;
let publicKeyPromise: ReturnType<typeof importSPKI> | null = null;

function privateKey() {
 privateKeyPromise ??= importPKCS8(
  pem(Env.APP_JWT_PRIVATE_KEY, "private-key.pem"),
  ALG,
 );
 return privateKeyPromise;
}

function publicKey() {
 publicKeyPromise ??= importSPKI(
  pem(Env.APP_JWT_PUBLIC_KEY, "public-key.pem"),
  ALG,
 );
 return publicKeyPromise;
}

export async function signAppToken(payload: JwtPayload): Promise<string> {
 return new SignJWT({
  userId: payload.userId,
  role: payload.role,
  email: payload.email,
  sessionEpoch: payload.sessionEpoch ?? 0,
 })
  .setProtectedHeader({ alg: ALG, kid: KID })
  .setSubject(payload.userId)
  .setIssuer(ISSUER)
  .setAudience(AUDIENCE)
  .setIssuedAt()
  .setExpirationTime(ACCESS_TOKEN_TTL)
  .sign(await privateKey());
}

export async function verifyAppToken(token: string): Promise<JwtPayload> {
 const { payload } = await jwtVerify(token, await publicKey(), {
  issuer: ISSUER,
  audience: AUDIENCE,
 });
 return <JwtPayload>payload;
}

export function decodeJwtPayload(
 token?: string,
): Record<string, unknown> | null {
 try {
  return token ? decodeJwt(token) : null;
 } catch {
  return null;
 }
}
