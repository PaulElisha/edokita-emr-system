import { z } from "zod";
import { db } from "@db/db.ts";
import { appointmentWaitlist } from "@db/schema/appointment.ts";
import type { PublicUser } from "@module/user/helper.ts";
import APIError from "@error/APIError.ts";
import { countParam } from "@shared/schemas/common.ts";
import type { ListResult, Result } from "@shared/types.ts";
import { toError } from "@shared/error/error.ts";
import { and, desc, eq } from "drizzle-orm";


export const waitlistBodySchema = z
 .object({
  patientId: z.string().optional(),
  practitionerId: z.string().optional(),
  preferredDate: z
   .string()
   .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD")
   .optional(),
  reason: z.string().max(2000).optional(),
 })
 .refine((v) => v.preferredDate !== undefined || v.reason !== undefined, {
  message: "preferredDate or reason is required",
  path: ["reason"],
 });
export type CreateWaitlistInput = z.infer<typeof waitlistBodySchema>;

export const waitlistQuerySchema = z.object({
 status: z.string().optional(),
 patientId: z.string().optional(),
 _count: countParam.default(100),
});
export type WaitlistQuery = z.infer<typeof waitlistQuerySchema>;

type WaitlistEntry = typeof appointmentWaitlist.$inferSelect;
type WaitlistListResult = ListResult<WaitlistEntry>;

class WaitlistService {
 list = async (
  query: WaitlistQuery,
  user: PublicUser,
 ): Promise<Result<WaitlistListResult>> => {
  try {
   const conditions = [];
   const patientId = user.openemr.patientId ?? query.patientId;
   if (patientId) {
    conditions.push(eq(appointmentWaitlist.patientId, patientId));
   }
   if (query.status) {
    conditions.push(eq(appointmentWaitlist.status, query.status));
   }

   const rows = await db
    .select()
    .from(appointmentWaitlist)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(appointmentWaitlist.createdAt))
    .limit(query._count);

   return [{ total: rows.length, items: rows }, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 create = async (
  input: CreateWaitlistInput,
  user: PublicUser,
 ): Promise<Result<WaitlistEntry>> => {
  try {
   const patientId = (user.openemr.patientId ?? input.patientId)!;

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
  user: PublicUser,
 ): Promise<Result<{ success: true }>> => {
  try {
   const [row] = await db
    .select()
    .from(appointmentWaitlist)
    .where(eq(appointmentWaitlist.id, id))
    .limit(1);
   if (!row) return [null, APIError.notFound("Waitlist entry not found")];

   if (user.openemr.patientId && row.patientId !== user.openemr.patientId) {
    return [null, APIError.notFound("Waitlist entry not found")];
   }

   await db.delete(appointmentWaitlist).where(eq(appointmentWaitlist.id, id));
   return [{ success: true }, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };
}

export default new WaitlistService();
