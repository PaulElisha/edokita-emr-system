/** @format */

import { db } from "@db/db.ts";
import type { DbClient } from "@db/transaction.ts";
import { roles, roleSchema, type UserRole } from "@db/schema/role.ts";
import { users } from "@db/schema/user.ts";
import APIError from "@error/APIError.ts";
import type { Result } from "@shared/types.ts";
import { toError } from "@shared/error/error.ts";
import { setDefined } from "@shared/utils/object.ts";
import { decryptSecret, encryptSecret } from "@shared/utils/secret.ts";
import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

export type UserRow = typeof users.$inferSelect;
type UserRecord = UserRow & { role: UserRole };

export const openEMRLinkSchema = z.object({
 subject: z.string().optional(),
 fhirUser: z.string().optional(),
 patientId: z.string().optional(),
 practitionerId: z.string().optional(),
});
export type OpenEMRLink = z.infer<typeof openEMRLinkSchema>;
export const openEMRLinkUpdateSchema = openEMRLinkSchema.partial();
export type OpenEMRLinkUpdate = z.infer<typeof openEMRLinkUpdateSchema>;

/** Fields OpenEMR provisioning can populate at registration time. */
export const openEMRProvisionSchema = openEMRLinkSchema.pick({
 patientId: true,
 practitionerId: true,
});
export type OpenEMRProvision = z.infer<typeof openEMRProvisionSchema>;

/** Per-user OpenEMR login credentials minted at provisioning time. */
export interface OpenEMRCredentials {
 username: string;
 password: string;
}

export const userSchema = z.object({
 id: z.string(),
 email: z.string().email(),
 passwordHash: z.string(),
 role: roleSchema,
 firstName: z.string(),
 lastName: z.string(),
 clinicId: z.string().optional(),
 openemr: openEMRLinkSchema,
 sessionEpoch: z.number().int(),
 createdAt: z.string(),
});
export type User = z.infer<typeof userSchema>;

// `sessionEpoch` is an internal revocation counter (embedded in the JWT), never
// exposed to clients.
export type PublicUser = Omit<User, "passwordHash" | "sessionEpoch">;

export const createUserSchema = userSchema
 .omit({ id: true, createdAt: true, sessionEpoch: true })
 .extend({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
 });
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = createUserSchema
 .pick({ firstName: true, lastName: true, clinicId: true })
 .partial();
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export function toUser(row: UserRecord): User {
 return {
  id: row.id,
  email: row.email,
  passwordHash: row.passwordHash,
  role: row.role,
  firstName: row.firstName,
  lastName: row.lastName,
  clinicId: row.clinicId ?? undefined,
  openemr: {
   subject: row.openemrSubject ?? undefined,
   fhirUser: row.openemrFhirUser ?? undefined,
   patientId: row.openemrPatientId ?? undefined,
   practitionerId: row.openemrPractitionerId ?? undefined,
  },
  sessionEpoch: row.sessionEpoch,
  createdAt: row.createdAt.toISOString(),
 };
}

export function toPublicUser(user: User): PublicUser {
 const { passwordHash: _passwordHash, sessionEpoch: _sessionEpoch, ...publicUser } = user;
 return publicUser;
}

export async function findUserByEmail(email: string): Promise<Result<User>> {
 const [row] = await db
  .select({ user: users, role: roles.name })
  .from(users)
  .innerJoin(roles, eq(users.roleId, roles.id))
  .where(eq(users.email, email.toLowerCase()))
  .limit(1);

 if (!row) return [null, APIError.notFound("User not found")];

 return [toUser({ ...row.user, role: row.role as UserRole }), null];
}

export async function findUserById(
 id: string,
 client: DbClient = db,
): Promise<Result<User>> {
 const [row] = await client
  .select({ user: users, role: roles.name })
  .from(users)
  .innerJoin(roles, eq(users.roleId, roles.id))
  .where(eq(users.id, id))
  .limit(1);

 if (!row) return [null, APIError.notFound("User not found")];

 return [toUser({ ...row.user, role: row.role as UserRole }), null];
}

/** Finds the app user linked to an OpenEMR patient uuid (if any). */
export async function findUserByPatientId(
 patientId: string,
): Promise<Result<User>> {
 const [row] = await db
  .select({ user: users, role: roles.name })
  .from(users)
  .innerJoin(roles, eq(users.roleId, roles.id))
  .where(eq(users.openemrPatientId, patientId))
  .limit(1);
 if (!row) return [null, APIError.notFound("User not found")];
 return [toUser({ ...row.user, role: row.role as UserRole }), null];
}

/** Finds the app user linked to an OpenEMR practitioner uuid (if any). */
export async function findUserByPractitionerId(
 practitionerId: string,
): Promise<Result<User>> {
 const [row] = await db
  .select({ user: users, role: roles.name })
  .from(users)
  .innerJoin(roles, eq(users.roleId, roles.id))
  .where(eq(users.openemrPractitionerId, practitionerId))
  .limit(1);
 if (!row) return [null, APIError.notFound("User not found")];
 return [toUser({ ...row.user, role: row.role as UserRole }), null];
}

/**
 * Maps OpenEMR practitioner uuids to clinician display names ("First Last").
 * Used to attribute EMR records to the doctor OpenEMR reports as author.
 */
export async function findUserNamesByPractitionerIds(
 ids: string[],
): Promise<Map<string, string>> {
 const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
 if (unique.length === 0) return new Map();
 const rows = await db
  .select({
   practitionerId: users.openemrPractitionerId,
   firstName: users.firstName,
   lastName: users.lastName,
  })
  .from(users)
  .where(inArray(users.openemrPractitionerId, unique));
 return new Map(
  rows
   .filter((r): r is typeof r & { practitionerId: string } =>
    Boolean(r.practitionerId),
   )
   .map((r) => [
    r.practitionerId,
    [r.firstName, r.lastName].filter(Boolean).join(" ").trim(),
   ]),
 );
}

/**
 * Resolves the OpenEMR practitioner uuid linked to a doctor's account.
 */
export async function findUserPractitionerId(
 userId: string,
): Promise<Result<string>> {
 const [user, err] = await findUserById(userId);
 if (err || !user) return [null, err];
 const practitionerId = user.openemr.practitionerId;
 if (!practitionerId) {
  return [
   null,
   APIError.badRequest(
    "Your account is not linked to an OpenEMR practitioner record",
   ),
  ];
 }
 return [practitionerId, null];
}

export async function createUser(
 input: CreateUserInput,
): Promise<Result<User>> {
 const email = input.email.toLowerCase();
 const [existing] = await findUserByEmail(email);
 if (existing) {
  return [null, APIError.conflict("A user with this email already exists")];
 }

 const [role] = await db
  .select({ id: roles.id })
  .from(roles)
  .where(eq(roles.name, input.role))
  .limit(1);
 if (!role) return [null, APIError.badRequest("Unknown role")];

 const [row] = await db
  .insert(users)
  .values({
   email,
   passwordHash: input.passwordHash,
   roleId: role.id,
   firstName: input.firstName,
   lastName: input.lastName,
   clinicId: input.clinicId ?? "",
   openemrSubject: input.openemr.subject,
   openemrFhirUser: input.openemr.fhirUser,
   openemrPatientId: input.openemr.patientId,
   openemrPractitionerId: input.openemr.practitionerId,
  })
  .returning();

 if (!row) return [null, APIError.internalServer("Failed to create user")];

 return [toUser({ ...row, role: input.role }), null];
}

export async function linkOpenEMR(
 id: string,
 link: OpenEMRLinkUpdate,
 client: DbClient = db,
): Promise<Result<User>> {
 const patch: Partial<UserRow> = {};
 const set = setDefined(patch);
 set("openemrSubject", link.subject);
 set("openemrFhirUser", link.fhirUser);
 set("openemrPatientId", link.patientId);
 set("openemrPractitionerId", link.practitionerId);
 return applyUserPatch(id, patch, client);
}

export async function updateUser(
 id: string,
 input: UpdateUserInput,
): Promise<Result<User>> {
 const patch: Partial<UserRow> = {};
 const set = setDefined(patch);
 set("firstName", input.firstName);
 set("lastName", input.lastName);
 set("clinicId", input.clinicId);
 return applyUserPatch(id, patch);
}

/** Persists a new password hash for a user (password change/reset flows). */
export async function updatePasswordHash(
 id: string,
 passwordHash: string,
): Promise<Result<void>> {
 const [row] = await db
  .update(users)
  .set({ passwordHash })
  .where(eq(users.id, id))
  .returning({ id: users.id });
 if (!row) return [null, APIError.notFound("User not found")];
 return [undefined, null];
}

/**
 * Advances the user's session epoch, instantly invalidating every access JWT
 * already minted for them (they carry the old epoch). Used on logout and on
 * credential changes to force re-authentication immediately.
 */
export async function bumpSessionEpoch(id: string): Promise<Result<void>> {
 const [row] = await db
  .update(users)
  .set({ sessionEpoch: sql`${users.sessionEpoch} + 1` })
  .where(eq(users.id, id))
  .returning({ id: users.id });
 if (!row) return [null, APIError.notFound("User not found")];
 return [undefined, null];
}

/**
 * Persists the per-user OpenEMR login used for password-grant auto-connect. The
 * password is encrypted with the shared AES-256-GCM secret key.
 */
export async function saveOpenEMRCredentials(
 id: string,
 credentials: OpenEMRCredentials,
 client: DbClient = db,
 ): Promise<Result<void>> {
  try {
   const encrypted = await encryptSecret(credentials.password);
   const [row] = await client
    .update(users)
    .set({
     openemrUsername: credentials.username,
     openemrPassword: encrypted,
    })
    .where(eq(users.id, id))
    .returning({ id: users.id });
  if (!row) return [null, APIError.notFound("User not found")];
  return [undefined, null];
 } catch (e) {
  return [null, toError(e)];
 }
}

/** Returns the decrypted OpenEMR login for a user, or an error if not stored. */
export async function getOpenEMRCredentials(
 id: string,
): Promise<Result<OpenEMRCredentials>> {
 const [row] = await db
  .select({
   username: users.openemrUsername,
   password: users.openemrPassword,
  })
  .from(users)
  .where(eq(users.id, id))
  .limit(1);
 if (!row) return [null, APIError.notFound("User not found")];
 if (!row.username || !row.password) {
  return [null, APIError.badRequest("No OpenEMR credentials stored")];
 }
 return [
  { username: row.username, password: await decryptSecret(row.password) },
  null,
 ];
}

/** Applies a partial update and returns the refreshed user (no-op if empty). */
async function applyUserPatch(
 id: string,
 patch: Partial<UserRow>,
 client: DbClient = db,
): Promise<Result<User>> {
 if (Object.keys(patch).length === 0) return findUserById(id, client);

 const [row] = await client
  .update(users)
  .set(patch)
  .where(eq(users.id, id))
  .returning({ id: users.id });

 if (!row) return [null, APIError.notFound("User not found")];

 return findUserById(id, client);
}
