/** @format */

import { getOpenEMRClient } from "@openemr/context.ts";

import type {
 OpenEMRProvision,
 OpenEMRCredentials,
} from "@module/user/helper.ts";
import type { Result } from "@shared/types.ts";
import { toError } from "@shared/error/error.ts";
import APIError from "@error/APIError.ts";
import { forget, remember } from "@epic-web/remember";
import { randomInt } from "node:crypto";

export interface OpenEMRProvisionResult {
 link: OpenEMRProvision;
 credentials?: OpenEMRCredentials;
}

export interface OpenEMRUser {
 id?: number | string;
 uuid?: string;
 username?: string;
 email?: string;
 fname?: string;
 lname?: string;
 specialty?: string | null;
 npi?: string | null;
}

const USERS_KEY = "openemr:user-directory";
const USERS_TTL_MS = 60_000;
let usersExpiresAt = 0;

export function listOpenEMRUsers(
): Promise<OpenEMRUser[]> {
 const client = getOpenEMRClient();
 if (Date.now() >= usersExpiresAt) forget(USERS_KEY);
 return remember(USERS_KEY, async () => {
  const users = await client.standardGet<OpenEMRUser>("/api/user");
  usersExpiresAt = Date.now() + USERS_TTL_MS;
  return users;
 }).catch((e) => {
  usersExpiresAt = 0;
  forget(USERS_KEY);
  throw e;
 });
}

export async function resolveAccountByEmail(
 email: string,
): Promise<Result<{ id: number; uuid: string }>> {
 try {
  const target = email.toLowerCase();
  const users = await listOpenEMRUsers();
  const found = users.find(
   (u) => (u.email ?? "").toLowerCase() === target && u.uuid,
  );
  if (!found?.uuid) {
   return [
    null,
    APIError.openEmr(`OpenEMR user not found after creation: ${email}`),
   ];
  }
  return [{ id: Number(found.id), uuid: found.uuid }, null];
 } catch (e) {
  return [null, toError(e, "resolveAccountByEmail")];
 }
}

export function generateOpenEMRPassword(): string {
 const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
 const lower = "abcdefghijkmnpqrstuvwxyz";
 const digits = "23456789";
 const special = "!@#$%_-+=";
 const all = upper + lower + digits + special;
 const pick = (s: string) => s[randomInt(s.length)];
 const chars = [pick(upper), pick(lower), pick(digits), pick(special)];
 for (let i = 0; i < 14; i++) chars.push(pick(all));
 for (let i = chars.length - 1; i > 0; i--) {
  const j = randomInt(i + 1);
  [chars[i], chars[j]] = [chars[j], chars[i]];
 }
 return chars.join("");
}
