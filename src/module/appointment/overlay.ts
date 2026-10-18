import { db } from "@db/db.ts";
import { appointmentOverrides } from "@db/schema/appointment.ts";
import type { MappedAppointment } from "@shared/utils/fhir-mapper.ts";
import type { Result } from "@shared/types.ts";
import { toError } from "@shared/error/error.ts";
import { setDefined } from "@shared/utils/object.ts";
import { inArray, eq } from "drizzle-orm";

export type AppointmentOverride = typeof appointmentOverrides.$inferSelect;

export interface OverrideInput {
 status?: string;
 start?: Date;
 end?: Date;
 note?: string;
}

const INACTIVE_STATUSES = new Set(["cancelled", "entered-in-error", "noshow"]);

export function overrideIsInactive(status?: string | null): boolean {
 return status ? INACTIVE_STATUSES.has(status) : false;
}

export async function getOverrides(
 uuids: string[],
): Promise<Result<Map<string, AppointmentOverride>>> {
 try {
  if (uuids.length === 0) return [new Map(), null];
  const rows = await db
   .select()
   .from(appointmentOverrides)
   .where(inArray(appointmentOverrides.appointmentUuid, uuids));
  return [new Map(rows.map((r) => [r.appointmentUuid, r])), null];
 } catch (e) {
  return [null, toError(e)];
 }
}

async function getOverride(
 uuid: string,
): Promise<Result<AppointmentOverride | null>> {
 try {
  const [row] = await db
   .select()
   .from(appointmentOverrides)
   .where(eq(appointmentOverrides.appointmentUuid, uuid))
   .limit(1);
  return [row ?? null, null];
 } catch (e) {
  return [null, toError(e)];
 }
}

export function applyOverride(
 appointment: MappedAppointment,
 override?: AppointmentOverride,
): MappedAppointment {
 if (!override) return appointment;
 return {
  ...appointment,
  status: override.status ?? appointment.status,
  start: override.start ? override.start.toISOString() : appointment.start,
  end: override.end ? override.end.toISOString() : appointment.end,
 };
}

export async function applyOverrides(
 appointments: MappedAppointment[],
): Promise<Result<MappedAppointment[]>> {
 const uuids = appointments
  .map((a) => a.id)
  .filter((id): id is string => Boolean(id));
 const [overrides, err] = await getOverrides(uuids);
 if (err || !overrides)
  return [null, err];
 return [
  appointments.map((a) => (a.id ? applyOverride(a, overrides.get(a.id)) : a)),
  null,
 ];
}

export async function applyOverrideById(
 appointment: MappedAppointment,
): Promise<Result<MappedAppointment>> {
 if (!appointment.id) return [appointment, null];
 const [override, err] = await getOverride(appointment.id);
 if (err) return [null, err];
 return [applyOverride(appointment, override ?? undefined), null];
}

export async function upsertOverride(
 appointmentUuid: string,
 input: OverrideInput,
 updatedBy: string,
): Promise<Result<AppointmentOverride>> {
 try {
  const patch: Partial<typeof appointmentOverrides.$inferInsert> = {
   updatedBy,
   updatedAt: new Date(),
  };
  const set = setDefined(patch);
  set("status", input.status);
  set("start", input.start);
  set("end", input.end);
  set("note", input.note);

  const [row] = await db
   .insert(appointmentOverrides)
   .values({
    appointmentUuid,
    status: input.status,
    start: input.start,
    end: input.end,
    note: input.note,
    updatedBy,
   })
   .onConflictDoUpdate({
    target: appointmentOverrides.appointmentUuid,
    set: patch,
   })
   .returning();
  if (!row) return [null, toError("Failed to persist appointment override")];
  return [row, null];
 } catch (e) {
  return [null, toError(e)];
 }
}

export async function removeOverride(uuid: string): Promise<Result<void>> {
 try {
  await db
   .delete(appointmentOverrides)
   .where(eq(appointmentOverrides.appointmentUuid, uuid));
  return [undefined, null];
 } catch (e) {
  return [null, toError(e)];
 }
}
