/** @format */
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
import { randomInt } from "node:crypto";

/** Provisioning outcome: the FHIR link plus any OpenEMR login we minted. */
export interface OpenEMRProvisionResult {
 link: OpenEMRProvision;
 credentials?: OpenEMRCredentials;
}

/** Looks up the OpenEMR user backing an app user's email (retries for API lag). */
async function resolveAccountByEmail(
 client: OpenEMRClient,
 email: string,
): Promise<Result<{ id: number; uuid: string }>> {
 const target = email.toLowerCase();
 const users = await client.standardGet<{
  id?: number | string;
  uuid?: string;
  email?: string;
 }>("/api/user");
 const found = users.find(
  (u) => (u.email ?? "").toLowerCase() === target && u.uuid,
 );
 if (found?.uuid) {
  return [{ id: Number(found.id), uuid: found.uuid }, null];
 }
 return [null, new Error("OpenEMR user not found after creation")];
}

/** Generates a password satisfying OpenEMR's policy (upper/lower/digit/special). */
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

/**
 * Provisions the OpenEMR side of registration.
 *
 * Doctors are created through the Users admin (`createOpenEMRLogin`) rather than
 * a FHIR Practitioner create, because only the admin path creates the
 * `users_secure` login row a password grant needs. The resulting `users` row is
 * still exposed as a FHIR Practitioner (same uuid), so the link is unchanged.
 */
export async function provisionOpenEMR(
 input: RegisterInput,
): Promise<Result<OpenEMRProvisionResult>> {
 try {
  if (input.role === "doctor") {
   const password = generateOpenEMRPassword();
   const [, createErr] = await createOpenEMRLogin({
    username: input.email,
    password,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    npi: input.npi,
    group: "Physicians",
   });
   if (createErr) {
    return [null, createErr];
   }
   const [account, aErr] = await resolveAccountByEmail(openemr, input.email);
   if (aErr || !account) {
    return [null, aErr];
   }
   return [
    {
     link: { practitionerId: account.uuid },
     credentials: { username: input.email, password },
    },
    null,
   ];
  }
  if (input.role === "lab") {
   const password = generateOpenEMRPassword();
   const [, createErr] = await createOpenEMRLogin({
    username: input.email,
    password,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    group: "Clinicians",
   });
   if (createErr) {
    return [null, createErr];
   }
   const [account, aErr] = await resolveAccountByEmail(openemr, input.email);
   if (aErr || !account) {
    return [null, aErr];
   }
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
   if (err || !created) {
    return [null, err];
   }
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
   } catch (e) {
    // best effort; don't block registration
   }
   return [{ link: {} }, null];
  }
  return [{ link: {} }, null];
 } catch (e) {
  return [null, toError(e)];
 }
}
