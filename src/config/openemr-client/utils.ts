/** @format */

import { db } from "@db/db.ts";
import { openemrTokens } from "@db/schema/openemr.ts";
import { DbClient } from "@db/transaction.ts";
import { OpenEMRTokenSet, SaveTokenInput } from "@module/auth/helper.ts";
import APIError from "@shared/error/APIError.ts";
import { toError } from "@shared/error/error.ts";
import { Result } from "@shared/types.ts";
import { eq } from "drizzle-orm";

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

export async function saveTokens(
 userId: string,
 tokens: SaveTokenInput,
 client: DbClient = db,
): Promise<Result<void>> {
 try {
  const values = {
   accessToken: tokens.accessToken,
   refreshToken: tokens.refreshToken,
   refreshExpiresAt: tokens.refreshExpiresAt,
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
