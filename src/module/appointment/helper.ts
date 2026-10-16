/** @format */
import { OpenEMR } from "@/env.ts";
import { roleSchema } from "@db/schema/role.ts";
import APIError from "@error/APIError.ts";
import type OpenEMRClient from "@module/openemr/client.ts";
import type {
 AppointmentPatientInput,
 AppointmentWindowInput,
 CreateAppointmentInput,
 SlotsQuery,
} from "@module/appointment/appointment.service.ts";
import { findUserById } from "@module/user/helper.ts";
import PatientService from "@module/patient/patient.service.ts";
import type { FhirAppointment, FhirValueSet } from "@shared/types/fhir.ts";
import type { Result } from "@shared/types.ts";
import { toDateString, toTimeString } from "@shared/utils/date.ts";
import { addMinutes, differenceInSeconds, isAfter } from "date-fns";
import { toError } from "@shared/error/error.ts";
import {
 mapAppointment,
 type MappedAppointment,
 type MappedParticipant,
} from "@shared/utils/fhir-mapper.ts";
import {
 getOverrides,
 overrideIsInactive,
} from "@module/appointment/overlay.ts";
import { resolveWorkingHours } from "@module/schedule/helper.ts";
import { z } from "zod";

const DEFAULT_DURATION_MINUTES = 30;

/**
 * Patient uuids a doctor is connected to through appointments.
 */

export interface AppointmentWindow {
 start: string;
 end: string;
}

export function appointmentWindow(
 input: AppointmentWindowInput,
): AppointmentWindow {
 const start = new Date(input.start);
 const end = input.end
  ? new Date(input.end)
  : addMinutes(start, input.durationMinutes ?? DEFAULT_DURATION_MINUTES);
 return { start: start.toISOString(), end: end.toISOString() };
}

export interface AppointmentBooking {
 patientId: string;
 window: AppointmentWindow;
}

export const bookingActorSchema = z.object({
 userId: z.string().min(1),
 role: roleSchema,
});
export type BookingActor = z.infer<typeof bookingActorSchema>;

/** Patients may only book for themselves; staff may book on behalf of any patient. */
export async function resolvePatientId(
 client: OpenEMRClient,
 input: AppointmentPatientInput,
 actor: BookingActor,
): Promise<Result<string>> {
 try {
  if (actor.role === "patient") {
   const [user, err] = await findUserById(actor.userId);
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
  }
  if (!input.patientId) {
   return [null, APIError.badRequest("patientId is required")];
  }
  // Verify the specified patient exists for non-patient actors
  const [, err] = await PatientService.get(client, input.patientId);
  if (err) return [null, APIError.badRequest("Invalid patientId")];
  return [input.patientId, null];
 } catch (e) {
  return [null, toError(e)];
 }
}

/** OpenEMR FHIR `appointment-type` ValueSet id that holds the visit types. */
const APPOINTMENT_TYPE_VALUESET = "appointment-type";

/** A bookable visit type; `code` is OpenEMR's `pc_constant_id`. */
export interface AppointmentCategory {
 code: string;
 name: string;
}

/**
 * Appointment categories (visit types) from OpenEMR's `appointment-type` FHIR
 * ValueSet, for booking UIs.
 *
 * OpenEMR has no standard REST endpoint for these — they live in
 * `openemr_postcalendar_categories` and are exposed only through this ValueSet.
 * The `_id` and `:uuid` reads are broken upstream (they filter on a nonexistent
 * `id` column), so fetch the collection and pick the `appointment-type` entry.
 */
export async function listCategories(
 client: OpenEMRClient,
): Promise<Result<AppointmentCategory[]>> {
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

/** Maps our input onto OpenEMR's Standard REST `pc_event` fields. */
export function buildAppointmentPayload(
 input: CreateAppointmentInput,
 booking: AppointmentBooking,
 providerId?: string,
): Record<string, unknown> {
 const start = new Date(booking.window.start);
 const durationSeconds = Math.max(
  1,
  differenceInSeconds(new Date(booking.window.end), start),
 );

 return {
  pc_catid: input.categoryId ?? OpenEMR.defaultAppointmentCategory,
  pc_title: input.type ?? "Visit",
  pc_duration: String(durationSeconds),
  pc_hometext: input.description ?? input.type ?? "Visit",
  pc_apptstatus: "-",
  pc_eventDate: toDateString(start),
  pc_startTime: toTimeString(start),
  pc_facility: input.facilityId ?? OpenEMR.defaultFacility,
  pc_billing_location:
   input.billingLocationId ?? OpenEMR.defaultBillingLocation,
  ...(providerId ? { pc_aid: providerId } : {}),
 };
}

/**
 * OpenEMR stores a provider on an appointment as the numeric `users.id` (`pc_aid`),
 * while our API/FHIR identify practitioners by uuid. Accept either and translate.
 */
export async function resolveProviderId(
 client: OpenEMRClient,
 providerId: string,
): Promise<Result<string>> {
 try {
  if (/^\d+$/.test(providerId)) return [providerId, null];
  const users = await client.standardGet<{
   id?: string | number;
   uuid?: string;
  }>("/api/user");
  const match = users.find((u) => u.uuid === providerId);
  if (!match?.id) return [null, APIError.badRequest("Invalid doctorId")];
  return [String(match.id), null];
 } catch (e) {
  return [null, toError(e)];
 }
}

interface TimeWindow {
 start: number;
 end: number;
}

/** Busy windows (epoch ms) for a provider on a given calendar day. */
async function fetchBookedWindows(
 client: OpenEMRClient,
 doctorId: string,
 date: string,
): Promise<Result<TimeWindow[]>> {
 try {
  const bundle = await client.fhirSearch("Appointment", {
   "actor:Practitioner": doctorId,
   date,
   _count: 100,
  });

  const appointments = (bundle.entry ?? [])
   .map((e) => e.resource as FhirAppointment)
   .filter((a) => a?.resourceType === "Appointment");

  const [overrides] = await getOverrides(
   appointments.map((a) => a.id).filter((id): id is string => Boolean(id)),
  );

  const windows = appointments
   .map((a) => {
    const override = a.id ? overrides?.get(a.id) : undefined;
    if (override && overrideIsInactive(override.status)) return null;
    const start = new Date(override?.start ?? a.start ?? 0);
    if (Number.isNaN(start.getTime())) return null;
    const rawEnd = override?.end ?? a.end;
    const end = rawEnd
     ? new Date(rawEnd)
     : addMinutes(start, DEFAULT_DURATION_MINUTES);
    return { start: start.getTime(), end: end.getTime() };
   })
   .filter((w): w is TimeWindow => w !== null);

  return [windows, null];
 } catch (e) {
  return [null, toError(e)];
 }
}

function overlaps(a: TimeWindow, b: TimeWindow): boolean {
 return a.start < b.end && b.start < a.end;
}

/** 409 when the provider already has a non-cancelled overlapping appointment. */
export async function assertNoConflict(
 client: OpenEMRClient,
 doctorId: string,
 window: AppointmentWindow,
): Promise<Result<void>> {
 try {
  const proposed: TimeWindow = {
   start: new Date(window.start).getTime(),
   end: new Date(window.end).getTime(),
  };
  const [booked, err] = await fetchBookedWindows(
   client,
   doctorId,
   toDateString(new Date(window.start)),
  );
  if (err || !booked) return [null, err];

  if (booked.some((b) => overlaps(proposed, b))) {
   return [
    null,
    APIError.conflict(
     "The provider already has an appointment in that time slot",
    ),
   ];
  }
  return [undefined, null];
 } catch (e) {
  return [null, toError(e)];
 }
}

export interface Slot {
 start: string;
 end: string;
 available: boolean;
}

/** Open/busy slots for a provider on a day, computed from working hours minus bookings. */
export async function computeSlots(
 client: OpenEMRClient,
 query: SlotsQuery,
): Promise<Result<Slot[]>> {
 try {
  const [year, month, day] = query.date.split("-").map(Number);
  const [schedule, serr] = await resolveWorkingHours(
   query.doctorId,
   new Date(year, month - 1, day),
  );
  if (serr || !schedule) {
   return [null, serr];
  }
  const slotMinutes =
   query.slotMinutes ?? schedule.slotMinutes ?? DEFAULT_DURATION_MINUTES;
  const hours = { start: schedule.start, end: schedule.end };
  const [startHour, startMinute] = hours.start.split(":").map(Number);
  const [endHour, endMinute] = hours.end.split(":").map(Number);

  const dayEnd = new Date(year, month - 1, day, endHour, endMinute, 0, 0);
  const [booked, err] = await fetchBookedWindows(
   client,
   query.doctorId,
   query.date,
  );
  if (err || !booked) return [null, err];

  const slots: Slot[] = [];
  for (
   let cursor = new Date(year, month - 1, day, startHour, startMinute, 0, 0),
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

/**
 * Fetch the exact appointment just created. The Standard `POST` returns only the numeric
 * `eid`; resolve its `pc_uuid` (== FHIR `id`) via the Standard read, then load it as FHIR.
 */
export async function findAppointment(
 client: OpenEMRClient,
 eid: string,
): Promise<Result<MappedAppointment | null>> {
 try {
  const [row] = await client.standardGet<{ pc_uuid?: string }>(
   `/api/appointment/${eid}`,
  );
  const uuid = row?.pc_uuid;
  if (!uuid) return [null, null];
  const appointment = await client.fhirRead<FhirAppointment>(
   "Appointment",
   uuid,
  );
  return [mapAppointment(appointment), null];
 } catch (e) {
  return [null, toError(e)];
 }
}

export function fallbackAppointment(
 input: CreateAppointmentInput,
 booking: AppointmentBooking,
): MappedAppointment {
 const participants: MappedParticipant[] = [
  {
   role: "PART",
   type: ["Patient"],
   actorType: "Patient",
   actorId: booking.patientId,
   status: "accepted",
  },
 ];
 if (input.doctorId) {
  participants.push({
   role: "PPRF",
   type: ["Primary Performer"],
   actorType: "Practitioner",
   actorId: input.doctorId,
   status: "accepted",
  });
 }
 return {
  resourceType: "Appointment",
  status: "booked",
  start: booking.window.start,
  end: booking.window.end,
  type: input.type ?? "Visit",
  description: input.description,
  participants,
  patientId: booking.patientId,
  doctorId: input.doctorId,
 };
}
