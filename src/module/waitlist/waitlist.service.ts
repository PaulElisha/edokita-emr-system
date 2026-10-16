/** @format */
import { z } from "zod";
import { db } from "@db/db.ts";
import { appointmentWaitlist } from "@db/schema/appointment.ts";
import { roleSchema } from "@db/schema/role.ts";
import { findUserById } from "@module/user/helper.ts";
import APIError from "@error/APIError.ts";
import { countParam } from "@shared/schemas/common.ts";
import type { ListResult, Result } from "@shared/types.ts";
import { toError } from "@shared/error/error.ts";
import { and, desc, eq } from "drizzle-orm";

export interface WaitlistActor {
 role: z.infer<typeof roleSchema>;
 userId: string;
}

export const waitlistBodySchema = z.object({
 patientId: z.string().optional(),
 practitionerId: z.string().optional(),
 preferredDate: z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
  .optional(),
 reason: z.string().max(2000).optional(),
});
export type CreateWaitlistInput = z.infer<typeof waitlistBodySchema>;

export const waitlistQuerySchema = z.object({
 status: z.string().optional(),
 patientId: z.string().optional(),
 _count: countParam,
});
export type WaitlistQuery = z.infer<typeof waitlistQuerySchema>;

export type WaitlistEntry = typeof appointmentWaitlist.$inferSelect;
export type WaitlistListResult = ListResult<WaitlistEntry>;

class WaitlistService {
 list = async (
  query: WaitlistQuery,
  actor: WaitlistActor,
 ): Promise<Result<WaitlistListResult>> => {
  try {
   const conditions = [];
   if (actor.role === "patient") {
    const [patientId, err] = await this.ownPatientId(actor.userId);
    if (err || !patientId) return [null, err];
    conditions.push(eq(appointmentWaitlist.patientId, patientId));
   } else if (query.patientId) {
    conditions.push(eq(appointmentWaitlist.patientId, query.patientId));
   }
   if (query.status) {
    conditions.push(eq(appointmentWaitlist.status, query.status));
   }

   const rows = await db
    .select()
    .from(appointmentWaitlist)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(appointmentWaitlist.createdAt))
    .limit(Number(query._count ?? 100));

   return [{ total: rows.length, items: rows }, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 create = async (
  input: CreateWaitlistInput,
  actor: WaitlistActor,
 ): Promise<Result<WaitlistEntry>> => {
  try {
   let patientId = input.patientId;
   if (actor.role === "patient") {
    const [own, err] = await this.ownPatientId(actor.userId);
    if (err || !own) return [null, err];
    patientId = own;
   }
   if (!patientId) return [null, APIError.badRequest("patientId is required")];

   const [row] = await db
    .insert(appointmentWaitlist)
    .values({
     patientId,
     practitionerId: input.practitionerId,
     preferredDate: input.preferredDate,
     reason: input.reason,
    })
    .returning();
   if (!row) return [null, toError("Failed to create waitlist entry")];
   return [row, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 remove = async (
  id: string,
  actor: WaitlistActor,
 ): Promise<Result<{ success: true }>> => {
  try {
   const [row] = await db
    .select()
    .from(appointmentWaitlist)
    .where(eq(appointmentWaitlist.id, id))
    .limit(1);
   if (!row) return [null, APIError.notFound("Waitlist entry not found")];

   if (actor.role === "patient") {
    const [own, err] = await this.ownPatientId(actor.userId);
    if (err || !own) return [null, err];
    if (row.patientId !== own) {
     return [null, APIError.notFound("Waitlist entry not found")];
    }
   }

   await db.delete(appointmentWaitlist).where(eq(appointmentWaitlist.id, id));
   return [{ success: true }, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 private ownPatientId = async (userId: string): Promise<Result<string>> => {
  const [user, err] = await findUserById(userId);
  if (err || !user) return [null, err];
  const patientId = user.openemr.patientId;
  if (!patientId) {
   return [
    null,
    APIError.badRequest(
     "Your account is not linked to an OpenEMR patient record",
    ),
   ];
  }
  return [patientId, null];
 };
}

export default new WaitlistService();
