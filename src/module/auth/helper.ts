/** @format */
import { db } from "@db/db.ts";
import type { DbClient } from "@db/transaction.ts";
import { openemrAuthStates, openemrTokens } from "@db/schema/openemr.ts";
import APIError from "@error/APIError.ts";
import type { Result } from "@shared/types.ts";
import { toError } from "@shared/error/error.ts";
import { decodeJwtPayload } from "@auth/jwt.ts";
import {
 authorizationServer,
 clientAuth,
 oauthClient,
 oauthOptions,
} from "@auth/oauth.ts";
import { eq, lt } from "drizzle-orm";
import {
 ResponseBodyError,
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
   clientAuth,
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

// /**
//  * Hand-rolled token request, replaced by oauth4webapi
//  * (`genericTokenEndpointRequest` + `processGenericTokenEndpointResponse`).
//  */
// export async function tokenRequest(
//  body: URLSearchParams,
// ): Promise<Result<TokenResponse>> {
//  try {
//   const res = await fetch(OpenEMR.oauthUrl, {
//    method: "POST",
//    headers: { "Content-Type": "application/x-www-form-urlencoded" },
//    body,
//   });
//   const data = await res.json();
//   if (!res.ok || data.error || !data.access_token) {
//    return [
//     null,
//     APIError.openEmr(
//      `OpenEMR token request failed: ${data.error_description || data.error || res.status}`,
//      res.status,
//     ),
//    ];
//   }
//   return [data, null];
//  } catch (e) {
//   return [null, toError(e)];
//  }
// }

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
  return [null, err ?? APIError.openEmr("Invalid id_token")];
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
   return [null, er ?? APIError.openEmr("OpenEMR token request failed")];
  }
  const [refreshed, error] = toTokenSet(data);
  if (error || !refreshed) {
   return [null, error ?? APIError.openEmr("Failed to build token set")];
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
