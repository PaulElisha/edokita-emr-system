/** @format */
import { db } from "@db/db.ts";
import type { DbClient } from "@db/transaction.ts";
import { openemrAuthStates, openemrTokens } from "@db/schema/openemr.ts";
import { passwordResetTokens, refreshTokens } from "@db/schema/auth.ts";
import APIError from "@error/APIError.ts";
import type { Result } from "@shared/types.ts";
import { toError } from "@shared/error/error.ts";
import { decodeJwtPayload, signAppToken, type JwtPayload } from "@auth/jwt.ts";
import type { PublicUser, User } from "@module/user/helper.ts";
import { toPublicUser } from "@module/user/helper.ts";
import {
 authorizationServer,
 getClientAuth,
 oauthClient,
 oauthOptions,
} from "@auth/oauth.ts";
import { and, eq, isNull, lt } from "drizzle-orm";
import { isBefore, subDays } from "date-fns";
import { createHash } from "node:crypto";
import {
 ResponseBodyError,
 generateRandomState,
 genericTokenEndpointRequest,
 processGenericTokenEndpointResponse,
} from "oauth4webapi";
import type { HttpStatusCodeType } from "@enum/http.ts";

export interface OpenEMRTokenSet {
 userId: string;
 accessToken: string;
 refreshToken: string | null;
 expiresAt: Date;
 scope: string | null;
 subject: string | null;
 updatedAt: Date;
}

/** Token payload accepted by {@link saveTokens}; ownership/timestamps are set here. */
export type SaveTokenInput = Omit<OpenEMRTokenSet, "userId" | "updatedAt">;

export interface PendingAuth {
 userId: string;
 verifier: string;
 nonce: string;
 createdAt: number;
}

const PENDING_TTL_MS = 10 * 60 * 1000;

export interface TokenResponse {
 access_token?: string;
 refresh_token?: string;
 id_token?: string;
 expires_in?: number;
 scope?: string;
 error?: string;
 error_description?: string;
}
const SKEW_MS = 30_000;

export async function saveTokens(
 userId: string,
 tokens: SaveTokenInput,
 client: DbClient = db,
): Promise<Result<void>> {
 try {
  const values = {
   accessToken: tokens.accessToken,
   refreshToken: tokens.refreshToken,
   expiresAt: tokens.expiresAt,
   scope: tokens.scope,
   subject: tokens.subject,
   updatedAt: new Date(),
  };
  await client
   .insert(openemrTokens)
   .values({ userId, ...values })
   .onConflictDoUpdate({ target: openemrTokens.userId, set: values });
  return [undefined, null];
 } catch (e) {
  return [null, toError(e)];
 }
}

export async function tokenRequest(
 body: URLSearchParams,
): Promise<Result<TokenResponse>> {
 try {
  const grantType = body.get("grant_type") ?? "";
  const params = new URLSearchParams(body);
  params.delete("grant_type");
  params.delete("client_id");
  params.delete("client_secret");
  const response = await genericTokenEndpointRequest(
   authorizationServer,
   oauthClient,
   getClientAuth(),
   grantType,
   params,
   oauthOptions,
  );
  const data = await processGenericTokenEndpointResponse(
   authorizationServer,
   oauthClient,
   response,
  );
  return [
   {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    id_token: data.id_token,
    expires_in: data.expires_in,
    scope: data.scope,
   },
   null,
  ];
 } catch (e) {
  if (e instanceof ResponseBodyError) {
   return [
    null,
    APIError.openEmr(
     `OpenEMR token request failed: ${e.error_description || e.error}`,
     e.status as HttpStatusCodeType,
    ),
   ];
  }
  return [null, toError(e)];
 }
}

export interface IdTokenClaims {
 subject: string | null;
 fhirUser: string | null;
}

export function decodeIdTokenClaims(idToken?: string): Result<IdTokenClaims> {
 const json = decodeJwtPayload(idToken);
 return [
  {
   subject: typeof json?.sub === "string" ? json.sub : null,
   fhirUser: typeof json?.fhirUser === "string" ? json.fhirUser : null,
  },
  null,
 ];
}

/**
 * OpenEMR injects `nonce` and `site:*` into the granted scope string. Neither
 * is a real scope, and OpenEMR's own refresh validation rejects them, so strip
 * them before storing or echoing the scope back.
 */
export function cleanScope(scope: string | null | undefined): string | null {
 if (!scope) return null;
 const cleaned = scope
  .split(/\s+/)
  .filter((s) => s && s !== "nonce" && !s.startsWith("site:"))
  .join(" ");
 return cleaned.length > 0 ? cleaned : null;
}

export function toTokenSet(data: TokenResponse): Result<SaveTokenInput> {
 const [claims, err] = decodeIdTokenClaims(data.id_token);
 if (err || !claims) {
  return [null, err];
 }
 const ttlMs = (data.expires_in ?? 3600) * 1000;
 return [
  {
   accessToken: data.access_token as string,
   refreshToken: data.refresh_token ?? null,
   expiresAt: new Date(Date.now() + ttlMs - SKEW_MS),
   scope: cleanScope(data.scope),
   subject: claims.subject,
  },
  null,
 ];
}

export async function getOpenEMRToken(
 userId: string,
 force = false,
): Promise<Result<string>> {
 try {
  const [tokens, err] = await getTokens(userId);
  if (err || !tokens) {
   return [null, err];
  }

  if (!force && Date.now() < tokens.expiresAt.getTime())
   return [tokens.accessToken, null];
  if (!tokens.refreshToken) {
   return [
    null,
    APIError.unauthorized("OpenEMR session expired. Reconnect your account."),
   ];
  }
  const body = new URLSearchParams({
   grant_type: "refresh_token",
   refresh_token: tokens.refreshToken,
  });
  const [data, er] = await tokenRequest(body);
  if (er || !data) {
   return [null, er];
  }
  const [refreshed, error] = toTokenSet(data);
  if (error || !refreshed) {
   return [null, error];
  }
  const [, ex] = await saveTokens(userId, refreshed);
  if (ex) return [null, ex];
  return [refreshed.accessToken, null];
 } catch (e) {
  return [null, toError(e)];
 }
}

export async function getTokens(
 userId: string,
): Promise<Result<OpenEMRTokenSet>> {
 try {
  const [row] = await db
   .select()
   .from(openemrTokens)
   .where(eq(openemrTokens.userId, userId))
   .limit(1);
  if (!row) {
   return [
    null,
    APIError.unauthorized(
     "Your OpenEMR account is not connected. Connect it to continue.",
    ),
   ];
  }
  return [row, null];
 } catch (e) {
  return [null, toError(e)];
 }
}

export async function clearTokens(userId: string): Promise<Result<void>> {
 try {
  await db.delete(openemrTokens).where(eq(openemrTokens.userId, userId));
  return [undefined, null];
 } catch (e) {
  return [null, toError(e)];
 }
}

/**
 * Invalidates the OpenEMR *access* token while retaining the refresh token.
 *
 * Used on logout for the "middle ground": the live session is severed
 * immediately (no usable access token), but the stored refresh token lets the
 * next login re-establish the OpenEMR session without re-running the password
 * grant — decoupling day-to-day auto-connect from OpenEMR's password policy
 * until the refresh token itself expires (~90 days).
 */
export async function clearAccessToken(userId: string): Promise<Result<void>> {
 try {
  await db
   .update(openemrTokens)
   .set({ accessToken: "", expiresAt: new Date() })
   .where(eq(openemrTokens.userId, userId));
  return [undefined, null];
 } catch (e) {
  return [null, toError(e)];
 }
}

export async function savePending(
 state: string,
 pending: PendingAuth,
): Promise<Result<void>> {
 try {
  await db
   .delete(openemrAuthStates)
   .where(
    lt(openemrAuthStates.createdAt, new Date(Date.now() - PENDING_TTL_MS)),
   );

  const values = {
   userId: pending.userId,
   verifier: pending.verifier,
   nonce: pending.nonce,
   createdAt: new Date(pending.createdAt),
  };
  await db
   .insert(openemrAuthStates)
   .values({ state, ...values })
   .onConflictDoUpdate({ target: openemrAuthStates.state, set: values });
  return [undefined, null];
 } catch (e) {
  return [null, toError(e)];
 }
}

export async function takePending(state: string): Promise<Result<PendingAuth>> {
 try {
  const [row] = await db
   .delete(openemrAuthStates)
   .where(eq(openemrAuthStates.state, state))
   .returning();
  if (!row) {
   return [null, APIError.badRequest("Invalid or expired authorization state")];
  }
  return [
   {
    userId: row.userId,
    verifier: row.verifier,
    nonce: row.nonce,
    createdAt: row.createdAt.getTime(),
   },
   null,
  ];
 } catch (e) {
  return [null, toError(e)];
 }
}

// ---------------------------------------------------------------------------
// App session tokens (JWT access token + opaque refresh token)
// ---------------------------------------------------------------------------

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

/**
 * Inactivity window (days). Refresh tokens rotate on every use, so the presented
 * token's `createdAt` is the last time the user did anything on the app. Once
 * that is older than this window, the session is considered abandoned and its
 * refresh tokens are revoked, forcing a fresh login.
 */
const IDLE_WINDOW_DAYS = 3;

export interface AuthResult {
 user: PublicUser;
 token: string;
 refreshToken: string;
}

/** Extracts the authenticated user id from the request JWT payload. */
export function requireUserId(req: { user: JwtPayload }): string {
 return req.user.userId;
}

export interface IssuedRefreshToken {
 token: string;
 expiresAt: Date;
}

/** Opaque high-entropy token (raw value returned to the client once). */
function generateToken(): string {
 return generateRandomState();
}

/** Tokens are persisted hashed so a DB leak cannot be replayed. */
function hashToken(raw: string): string {
 return createHash("sha256").update(raw).digest("hex");
}

/** Mints an app access token + refresh token for a newly authenticated user. */
export async function issueSession(user: User): Promise<Result<AuthResult>> {
 const token = await signAppToken({
  userId: user.id,
  role: user.role,
  email: user.email,
  sessionEpoch: user.sessionEpoch,
 });
 const [issued, err] = await issueRefreshToken(user.id);
 if (err || !issued) return [null, err];
 return [{ user: toPublicUser(user), token, refreshToken: issued.token }, null];
}

export async function issueRefreshToken(
 userId: string,
): Promise<Result<IssuedRefreshToken>> {
 try {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  await db.insert(refreshTokens).values({
   userId,
   tokenHash: hashToken(token),
   revoked: false,
   expiresAt,
  });
  return [{ token, expiresAt }, null];
 } catch (e) {
  return [null, toError(e)];
 }
}

export interface VerifiedRefreshToken {
 userId: string;
 /** When this token was issued; equals the last refresh = last app activity. */
 createdAt: Date;
}

/** Validates a refresh token and returns its owner + issue time (not revoked/expired). */
export async function verifyRefreshToken(
 raw: string,
): Promise<Result<VerifiedRefreshToken>> {
 try {
  const [row] = await db
   .select()
   .from(refreshTokens)
   .where(
    and(
     eq(refreshTokens.tokenHash, hashToken(raw)),
     eq(refreshTokens.revoked, false),
    ),
   )
   .limit(1);
  if (!row) return [null, APIError.unauthorized("Invalid refresh token")];
  if (row.expiresAt.getTime() < Date.now()) {
   return [null, APIError.unauthorized("Refresh token expired")];
  }
  return [{ userId: row.userId, createdAt: row.createdAt }, null];
 } catch (e) {
  return [null, toError(e)];
 }
}

/** True when the given last-activity time is older than the idle window. */
export function isIdle(lastActivity: Date): boolean {
 return isBefore(lastActivity, subDays(new Date(), IDLE_WINDOW_DAYS));
}

export async function revokeRefreshToken(raw: string): Promise<Result<void>> {
 try {
  await db
   .update(refreshTokens)
   .set({ revoked: true, revokedAt: new Date() })
   .where(eq(refreshTokens.tokenHash, hashToken(raw)));
  return [undefined, null];
 } catch (e) {
  return [null, toError(e)];
 }
}

export async function revokeUserRefreshTokens(
 userId: string,
): Promise<Result<void>> {
 try {
  await db
   .update(refreshTokens)
   .set({ revoked: true, revokedAt: new Date() })
   .where(
    and(eq(refreshTokens.userId, userId), eq(refreshTokens.revoked, false)),
   );
  return [undefined, null];
 } catch (e) {
  return [null, toError(e)];
 }
}

/** Issues a single-use password-reset token (raw value returned to the caller). */
export async function issuePasswordResetToken(
 userId: string,
): Promise<Result<string>> {
 try {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + RESET_TTL_MS);
  await db
   .insert(passwordResetTokens)
   .values({ userId, tokenHash: hashToken(token), expiresAt });
  return [token, null];
 } catch (e) {
  return [null, toError(e)];
 }
}

/** Consumes a reset token, returning the user id; marks the token used. */
export async function consumePasswordResetToken(
 raw: string,
): Promise<Result<string>> {
 try {
  const [row] = await db
   .select()
   .from(passwordResetTokens)
   .where(
    and(
     eq(passwordResetTokens.tokenHash, hashToken(raw)),
     isNull(passwordResetTokens.usedAt),
    ),
   )
   .limit(1);
  if (!row)
   return [null, APIError.badRequest("Invalid or expired reset token")];
  if (row.expiresAt.getTime() < Date.now()) {
   return [null, APIError.badRequest("Invalid or expired reset token")];
  }
  await db
   .update(passwordResetTokens)
   .set({ usedAt: new Date() })
   .where(eq(passwordResetTokens.id, row.id));
  return [row.userId, null];
 } catch (e) {
  return [null, toError(e)];
 }
}
