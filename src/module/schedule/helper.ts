import { db } from "@db/db.ts";
import { providerSchedules } from "@db/schema/appointment.ts";
import { OpenEMR } from "@/env.ts";
import type { Result } from "@shared/types.ts";
import { toError } from "@shared/error/error.ts";
import { and, eq } from "drizzle-orm";

export interface ScheduleEntry {
 id: string;
 practitionerId: string;
 weekday: number;
 startTime: string;
 endTime: string;
 slotMinutes: number;
 active: boolean;
}

export interface WorkingHours {
 start: string;
 end: string;
 slotMinutes: number;
}

export function toEntry(
 row: typeof providerSchedules.$inferSelect,
): ScheduleEntry {
 return {
  id: row.id,
  practitionerId: row.practitionerId,
  weekday: row.weekday,
  startTime: row.startTime,
  endTime: row.endTime,
  slotMinutes: row.slotMinutes,
  active: row.active === 1,
 };
}

export async function resolveWorkingHours(
 practitionerId: string,
 date: Date,
): Promise<Result<WorkingHours>> {
 try {
  const [row] = await db
   .select()
   .from(providerSchedules)
   .where(
    and(
     eq(providerSchedules.practitionerId, practitionerId),
     eq(providerSchedules.weekday, date.getDay()),
     eq(providerSchedules.active, 1),
    ),
   )
   .limit(1);
  if (row) {
   return [
    {
     start: row.startTime,
     end: row.endTime,
     slotMinutes: row.slotMinutes,
    },
    null,
   ];
  }
  return [
   {
    start: OpenEMR.workingHoursStart,
    end: OpenEMR.workingHoursEnd,
    slotMinutes: 30,
   },
   null,
  ];
 } catch (e) {
  return [null, toError(e)];
 }
}
