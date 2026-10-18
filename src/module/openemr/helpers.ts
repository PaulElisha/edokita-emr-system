import OpenEMRClient, { openemr } from "@module/openemr/client.ts";
import type { RegisterInput } from "@module/auth/auth.service.ts";
import PatientService from "@module/patient/patient.service.ts";
import type {
 OpenEMRProvision,
 OpenEMRCredentials,
} from "@module/user/helper.ts";
import type { Result } from "@shared/types.ts";
import { toError } from "@shared/error/error.ts";
import { createOpenEMRLogin } from "@module/openemr/admin-ui.ts";
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
 client: OpenEMRClient = openemr,
): Promise<OpenEMRUser[]> {
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

async function resolveAccountByEmail(
 client: OpenEMRClient,
 email: string,
): Promise<Result<{ id: number; uuid: string }>> {
 try {
  const target = email.toLowerCase();
  const users = await listOpenEMRUsers(client);
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

export async function provisionOpenEMR(
 input: RegisterInput,
): Promise<Result<OpenEMRProvisionResult>> {
 try {
  if (input.role === "doctor" || input.role === "lab") {
   const password = generateOpenEMRPassword();
   const [, createErr] = await createOpenEMRLogin({
    username: input.email,
    password,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    npi: input.npi,
    group: input.role === "doctor" ? "Physicians" : "Clinicians",
   });
   if (createErr) return [null, createErr];

   const [account, aErr] = await resolveAccountByEmail(openemr, input.email);
   if (aErr || !account) return [null, aErr];
   return [
    {
     link: { practitionerId: account.uuid },
     credentials: { username: input.email, password },
    },
    null,
   ];
  }

  if (input.role === "patient") {
   const [created, err] = await PatientService.create(openemr, {
    fname: input.firstName,
    lname: input.lastName,
    birthDate: input.birthDate,
    gender: input.gender,
    email: input.email,
    phone: input.phone,
   });
   if (err || !created) return [null, err];
   return [
    { link: { patientId: created.id ? String(created.id) : undefined } },
    null,
   ];
  }

  if (input.role === "admin") {
   try {
    await createOpenEMRLogin({
     username: input.email,
     password: input.password,
     firstName: input.firstName,
     lastName: input.lastName,
     email: input.email,
     group: "Administrators",
    });
   } catch {
    // Admins can log into OpenEMR later; never block registration on this.
   }
  }
  return [{ link: {} }, null];
 } catch (e) {
  return [null, toError(e, "provisionOpenEMR")];
 }
}
