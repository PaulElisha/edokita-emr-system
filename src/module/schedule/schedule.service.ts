/** @format */

import { z } from "zod";
import { db } from "@db/db.ts";
import { withTransaction } from "@db/transaction.ts";
import { providerSchedules } from "@db/schema/appointment.ts";
import type { Result } from "@shared/types.ts";
import { toError } from "@shared/error/error.ts";
import { eq } from "drizzle-orm";
import { toEntry, type ScheduleEntry } from "@module/schedule/helper.ts";

export type { ScheduleEntry, WorkingHours } from "@module/schedule/helper.ts";

export const timeSchema = z
 .string()
 .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:mm");

export const scheduleEntrySchema = z
 .object({
  weekday: z.coerce.number().int().min(0).max(6),
  startTime: timeSchema,
  endTime: timeSchema,
  slotMinutes: z.coerce.number().int().min(5).max(240).optional(),
 })
 .refine((e) => e.startTime < e.endTime, {
  message: "startTime must be before endTime",
  path: ["startTime"],
 });
export type ScheduleEntryInput = z.infer<typeof scheduleEntrySchema>;

export const scheduleBodySchema = z.object({
 entries: z.array(scheduleEntrySchema),
});
export type UpdateScheduleInput = z.infer<typeof scheduleBodySchema>;

export const practitionerParamSchema = z.object({
 practitionerId: z.string().min(1),
});
export type PractitionerParam = z.infer<typeof practitionerParamSchema>;

class ScheduleService {
 list = async (practitionerId: string): Promise<Result<ScheduleEntry[]>> => {
  try {
   const rows = await db
    .select()
    .from(providerSchedules)
    .where(eq(providerSchedules.practitionerId, practitionerId));
   return [rows.map(toEntry), null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 updateSchedule = async (
  practitionerId: string,
  input: UpdateScheduleInput,
 ): Promise<Result<ScheduleEntry[]>> => {
  try {
   await withTransaction(async (tx) => {
    await tx
     .delete(providerSchedules)
     .where(eq(providerSchedules.practitionerId, practitionerId));
    if (input.entries.length > 0) {
     await tx.insert(providerSchedules).values(
      input.entries.map((e) => ({
       practitionerId,
       weekday: e.weekday,
       startTime: e.startTime,
       endTime: e.endTime,
       slotMinutes: e.slotMinutes ?? 30,
      })),
     );
    }
   });
   return this.list(practitionerId);
  } catch (e) {
   return [null, toError(e)];
  }
 };
}

export default new ScheduleService();
