/** @format */

import { Env } from "@/env.ts";
import { db } from "@db/db.ts";
import { emrAccessRequests } from "@db/schema/emr.ts";
import { users } from "@db/schema/user.ts";
import APIError from "@error/APIError.ts";
import type { AuthUser } from "@module/user/helper.ts";
import { toError } from "@shared/error/error.ts";
import type { ListResult, Result } from "@shared/types.ts";
import { and, desc, eq, gt, or } from "drizzle-orm";
import { z } from "zod";

export const emrAccessPatientParamSchema = z.object({
 patientId: z.string().min(1),
});
export type EmrAccessPatientParam = z.infer<typeof emrAccessPatientParamSchema>;

export const emrAccessRequestSchema = z.object({
 reason: z.string().trim().max(500).optional(),
});
export type EmrAccessRequestInput = z.infer<typeof emrAccessRequestSchema>;

export const emrAccessReviewSchema = z.object({
 status: z.enum(["approved", "denied"]),
});
export type EmrAccessReviewInput = z.infer<typeof emrAccessReviewSchema>;

export const emrAccessRequestParamSchema = z.object({
 requestId: z.string().uuid(),
});
export type EmrAccessRequestParam = z.infer<typeof emrAccessRequestParamSchema>;

type AccessRequestRow = typeof emrAccessRequests.$inferSelect;

interface MappedEmrAccessRequest extends AccessRequestRow {
 doctor?: {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
 };
}

const ttlMs = Env.EMR_ACCESS_TTL_HOURS * 60 * 60 * 1000;

class EmrAccessService {
 request = async (
  patientId: string,
  user: AuthUser,
  input: EmrAccessRequestInput,
 ): Promise<Result<AccessRequestRow>> => {
  try {
   const now = new Date();
   const [existing] = await db
    .select()
    .from(emrAccessRequests)
    .where(
     and(
      eq(emrAccessRequests.patientId, patientId),
      eq(emrAccessRequests.doctorUserId, user.userId),
      or(
       eq(emrAccessRequests.status, "pending"),
       and(
        eq(emrAccessRequests.status, "approved"),
        gt(emrAccessRequests.expiresAt, now),
       ),
      ),
     ),
    )
    .orderBy(desc(emrAccessRequests.requestedAt))
    .limit(1);
   if (existing) return [existing, null];

   const [row] = await db
    .insert(emrAccessRequests)
    .values({
     patientId,
     doctorUserId: user.userId,
     reason: input.reason,
    })
    .returning();
   if (!row) return [null, toError("Failed to create EMR access request")];
   return [row, null];
  } catch (e) {
   return [null, toError(e, "requestEmrAccess")];
  }
 };

 list = async (
  user: AuthUser,
 ): Promise<Result<ListResult<MappedEmrAccessRequest>>> => {
  try {
   const patientId = user.openemr.patientId;
   if (!patientId) {
    return [null, APIError.badRequest("Patient profile is not linked")];
   }

   const rows = await db
    .select({
     request: emrAccessRequests,
     doctorId: users.id,
     doctorFirstName: users.firstName,
     doctorLastName: users.lastName,
     doctorEmail: users.email,
    })
    .from(emrAccessRequests)
    .leftJoin(users, eq(emrAccessRequests.doctorUserId, users.id))
    .where(eq(emrAccessRequests.patientId, patientId))
    .orderBy(desc(emrAccessRequests.requestedAt));

   const items = rows.map((row) => ({
    ...row.request,
    doctor:
     row.doctorId &&
     row.doctorFirstName !== null &&
     row.doctorLastName !== null &&
     row.doctorEmail !== null
      ? {
         id: row.doctorId,
         firstName: row.doctorFirstName,
         lastName: row.doctorLastName,
         email: row.doctorEmail,
        }
      : undefined,
   }));
   return [{ total: items.length, items }, null];
  } catch (e) {
   return [null, toError(e, "listEmrAccessRequests")];
  }
 };

 review = async (
  requestId: string,
  user: AuthUser,
  input: EmrAccessReviewInput,
 ): Promise<Result<AccessRequestRow>> => {
  try {
   const patientId = user.openemr.patientId;
   if (!patientId) {
    return [null, APIError.badRequest("Patient profile is not linked")];
   }

   const now = new Date();
   const expiresAt =
    input.status === "approved" ? new Date(now.getTime() + ttlMs) : null;
   const [row] = await db
    .update(emrAccessRequests)
    .set({
     status: input.status,
     reviewedAt: now,
     reviewedBy: user.userId,
     expiresAt,
    })
    .where(
     and(
      eq(emrAccessRequests.id, requestId),
      eq(emrAccessRequests.patientId, patientId),
      eq(emrAccessRequests.status, "pending"),
     ),
    )
    .returning();
   if (row) return [row, null];

   const [existing] = await db
    .select()
    .from(emrAccessRequests)
    .where(
     and(
      eq(emrAccessRequests.id, requestId),
      eq(emrAccessRequests.patientId, patientId),
     ),
    )
    .limit(1);
   if (!existing) return [null, APIError.notFound("Access request not found")];
   return [null, APIError.conflict("Access request has already been reviewed")];
  } catch (e) {
   return [null, toError(e, "reviewEmrAccessRequest")];
  }
 };
}

export async function hasEmrAccess(
 doctorUserId: string,
 patientId: string,
): Promise<Result<boolean>> {
 try {
  const [row] = await db
   .select({ id: emrAccessRequests.id })
   .from(emrAccessRequests)
   .where(
    and(
     eq(emrAccessRequests.doctorUserId, doctorUserId),
     eq(emrAccessRequests.patientId, patientId),
     eq(emrAccessRequests.status, "approved"),
     gt(emrAccessRequests.expiresAt, new Date()),
    ),
   )
   .limit(1);
  return [Boolean(row), null];
 } catch (e) {
  return [null, toError(e, "hasEmrAccess")];
 }
}

export default new EmrAccessService();
