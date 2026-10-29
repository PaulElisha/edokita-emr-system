/** @format */

import { getOpenEMRClient } from "@openemr/context.ts";

import { addMinutes, isAfter, isValid, parseISO, set } from "date-fns";
import APIError from "@error/APIError.ts";
import type {
 AppointmentStatus,
 SlotsQuery,
} from "@module/appointment/appointment.service.ts";
import {
 appointmentWindow,
 assertNoConflict,
 DEFAULT_DURATION_MINUTES,
 fetchBookedWindows,
 overlaps,
} from "@module/appointment/helper.ts";
import {
 applyOverride,
 applyOverrideById,
 upsertOverride,
} from "@module/appointment/overlay.ts";
import { resolveWorkingHours } from "@module/schedule/helper.ts";
import { toError } from "@shared/error/error.ts";
import type { FhirAppointment, FhirValueSet } from "@shared/types/fhir.ts";
import type { Result } from "@shared/types.ts";
import {
 mapAppointment,
 type MappedAppointment,
} from "@shared/utils/fhir-mapper.ts";

const APPOINTMENT_TYPE_VALUESET = "appointment-type";

export interface AppointmentCategory {
 code: string;
 name: string;
}

export interface Slot {
 start: string;
 end: string;
 available: boolean;
}

export class AppointmentBase {
 static async loadAppointment(id: string): Promise<Result<MappedAppointment>> {
  const client = getOpenEMRClient();
  try {
   const resource = await client.fhirRead<FhirAppointment>("Appointment", id);
   return applyOverrideById(mapAppointment(resource));
  } catch (e) {
   return [null, toError(e)];
  }
 }

 static async prepareReschedule(
  appointment: MappedAppointment,
  input: {
   start: string;
   end?: string;
   durationMinutes?: number;
  },
 ): Promise<Result<{ start: Date; end: Date }>> {
  const id = appointment.id!;
  if (!appointment.start) {
   return [null, APIError.badRequest("Appointment has no scheduled start")];
  }
  if (new Date(appointment.start).getTime() <= Date.now()) {
   return [
    null,
    APIError.badRequest(
     "Appointments can only be rescheduled before their scheduled start",
    ),
   ];
  }

  let durationMinutes = input.durationMinutes;
  if (input.end === undefined && durationMinutes === undefined) {
   const currentStart = new Date(appointment.start).getTime();
   const currentEnd = appointment.end
    ? new Date(appointment.end).getTime()
    : undefined;
   if (currentEnd && currentEnd > currentStart) {
    durationMinutes = Math.max(
     1,
     Math.round((currentEnd - currentStart) / 60000),
    );
   }
  }

  const window = appointmentWindow({
   start: input.start,
   end: input.end,
   durationMinutes,
  });
  if (new Date(window.start).getTime() <= Date.now()) {
   return [
    null,
    APIError.badRequest("The new appointment time must be in the future"),
   ];
  }
  if (new Date(window.end).getTime() <= new Date(window.start).getTime()) {
   return [null, APIError.badRequest("end must be after start")];
  }

  if (appointment.doctorId) {
   const [, conflict] = await assertNoConflict(
    appointment.doctorId,
    window,
    id,
   );
   if (conflict) return [null, conflict];
  }

  return [{ start: new Date(window.start), end: new Date(window.end) }, null];
 }

 static async setStatus(
  appointment: MappedAppointment,
  status: AppointmentStatus,
  userId: string,
 ): Promise<Result<MappedAppointment>> {
  try {
   const id = appointment.id!;
   if (appointment.status === status) return [appointment, null];

   const [row, err] = await upsertOverride(id, { status }, userId);
   if (err || !row) return [null, err];

   return [applyOverride(appointment, row), null];
  } catch (e) {
   return [null, toError(e)];
  }
 }

 static async computeSlots(query: SlotsQuery): Promise<Result<Slot[]>> {
  try {
   const day = parseISO(query.date);
   if (!isValid(day)) return [null, APIError.badRequest("Invalid date")];
   const [schedule, serr] = await resolveWorkingHours(query.doctorId, day);
   if (serr || !schedule) {
    return [null, serr];
   }
   const slotMinutes =
    query.slotMinutes ?? schedule.slotMinutes ?? DEFAULT_DURATION_MINUTES;
   const [startHour, startMinute] = schedule.start.split(":").map(Number);
   const [endHour, endMinute] = schedule.end.split(":").map(Number);

   const dayEnd = set(day, {
    hours: endHour,
    minutes: endMinute,
    seconds: 0,
    milliseconds: 0,
   });
   const [booked, err] = await fetchBookedWindows(query.doctorId, query.date);
   if (err || !booked) return [null, err];

   const slots: Slot[] = [];
   for (
    let cursor = set(day, {
      hours: startHour,
      minutes: startMinute,
      seconds: 0,
      milliseconds: 0,
     }),
     end = addMinutes(cursor, slotMinutes);
    !isAfter(end, dayEnd);
    cursor = end, end = addMinutes(cursor, slotMinutes)
   ) {
    slots.push({
     start: cursor.toISOString(),
     end: end.toISOString(),
     available: !booked.some((b) =>
      overlaps({ start: cursor.getTime(), end: end.getTime() }, b),
     ),
    });
   }

   return [slots, null];
  } catch (e) {
   return [null, toError(e)];
  }
 }

 static async listCategories(): Promise<Result<AppointmentCategory[]>> {
  const client = getOpenEMRClient();
  try {
   const bundle = await client.fhirSearch("ValueSet", {});
   const entry = (bundle.entry ?? []).find(
    (e) =>
     e.resource?.resourceType === "ValueSet" &&
     e.resource.id === APPOINTMENT_TYPE_VALUESET,
   );
   const valueSet = entry?.resource as FhirValueSet | undefined;
   const categories = (valueSet?.compose?.include ?? []).flatMap((include) =>
    (include.concept ?? []).map((concept) => ({
     code: concept.code ?? "",
     name: concept.display ?? "",
    })),
   );
   return [categories, null];
  } catch (e) {
   return [null, toError(e)];
  }
 }
}
