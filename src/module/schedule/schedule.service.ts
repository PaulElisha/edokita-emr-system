/** @format */

import { z } from "zod";
import { db } from "@db/db.ts";
import { Transactional } from "@db/transaction.ts";
import { providerSchedules } from "@db/schema/appointment.ts";
import type { Result } from "@shared/types.ts";
import { toError } from "@shared/error/error.ts";
import { eq } from "drizzle-orm";
import { toEntry, type ScheduleEntry } from "@module/schedule/helper.ts";

const timeSchema = z
 .string()
 .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Expected HH:mm");

const scheduleEntrySchema = z
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

 async updateSchedule(
  practitionerId: string,
  input: UpdateScheduleInput,
 ): Promise<Result<ScheduleEntry[]>> {
  try {
   await this.replaceSchedule(practitionerId, input);
   return this.list(practitionerId);
  } catch (e) {
   return [null, toError(e)];
  }
 }

 @Transactional()
 private async replaceSchedule(
  practitionerId: string,
  input: UpdateScheduleInput,
 ): Promise<void> {
  await db
   .delete(providerSchedules)
   .where(eq(providerSchedules.practitionerId, practitionerId));
  if (input.entries.length > 0) {
   await db.insert(providerSchedules).values(
    input.entries.map((e) => ({
     practitionerId,
     weekday: e.weekday,
     startTime: e.startTime,
     endTime: e.endTime,
     slotMinutes: e.slotMinutes ?? 30,
    })),
   );
  }
 }
}

export default new ScheduleService();
