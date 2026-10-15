/** @format */

import { db } from "@db/db.ts";
import type { DbClient } from "@db/transaction.ts";
import { roles, roleSchema, type UserRole } from "@db/schema/role.ts";
import { users } from "@db/schema/user.ts";
import APIError from "@error/APIError.ts";
import type { Result } from "@shared/types.ts";
import { eq } from "drizzle-orm";
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

export const userSchema = z.object({
 id: z.string(),
 email: z.string().email(),
 passwordHash: z.string(),
 role: roleSchema,
 firstName: z.string(),
 lastName: z.string(),
 clinicId: z.string().optional(),
 openemr: openEMRLinkSchema,
 createdAt: z.string(),
});
export type User = z.infer<typeof userSchema>;

export type PublicUser = Omit<User, "passwordHash">;

export const createUserSchema = userSchema
 .omit({ id: true, createdAt: true })
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
  createdAt: row.createdAt.toISOString(),
 };
}

export function toPublicUser(user: User): PublicUser {
 const { passwordHash: _passwordHash, ...publicUser } = user;
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
 if (link.subject !== undefined) patch.openemrSubject = link.subject;
 if (link.fhirUser !== undefined) patch.openemrFhirUser = link.fhirUser;
 if (link.patientId !== undefined) patch.openemrPatientId = link.patientId;
 if (link.practitionerId !== undefined) {
  patch.openemrPractitionerId = link.practitionerId;
 }
 return applyUserPatch(id, patch, client);
}

export async function updateUser(
 id: string,
 input: UpdateUserInput,
): Promise<Result<User>> {
 const patch: Partial<UserRow> = {};
 if (input.firstName !== undefined) patch.firstName = input.firstName;
 if (input.lastName !== undefined) patch.lastName = input.lastName;
 if (input.clinicId !== undefined) patch.clinicId = input.clinicId;
 return applyUserPatch(id, patch);
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
