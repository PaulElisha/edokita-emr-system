import { OpenEMR } from "@/env.ts";
import APIError from "@error/APIError.ts";
import type OpenEMRClient from "@module/openemr/client.ts";
import { type QueryValue } from "@module/openemr/client.ts";
import type {
 AppointmentListQuery,
 AppointmentPatientInput,
 AppointmentWindowInput,
 CreateAppointmentInput,
 SlotsQuery,
} from "@module/appointment/appointment.service.ts";
import PatientService from "@module/patient/patient.service.ts";
import { resolveOwnPatientId } from "@module/patient/helper.ts";
import { findUserPractitionerId } from "@module/user/helper.ts";
import type { FhirAppointment, FhirValueSet } from "@shared/types/fhir.ts";
import type { Result } from "@shared/types.ts";
import { toDateString, toTimeString } from "@shared/utils/date.ts";
import {
 addMinutes,
 differenceInSeconds,
 isAfter,
 isValid,
 parseISO,
 set,
} from "date-fns";
import { toError } from "@shared/error/error.ts";
import { listOpenEMRUsers } from "@module/openemr/helpers.ts";
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
import type { RequestActor } from "@module/auth/helper.ts";

const DEFAULT_DURATION_MINUTES = 30;
export const APPOINTMENT_FETCH_CAP = 500;

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

export async function resolvePatientId(
 client: OpenEMRClient,
 input: AppointmentPatientInput,
 actor: RequestActor,
): Promise<Result<string>> {
 try {
  if (actor.role === "patient") return resolveOwnPatientId(actor.userId);
  if (!input.patientId) {
   return [null, APIError.badRequest("patientId is required")];
  }
  const [, err] = await PatientService.get(client, input.patientId);
  if (err) return [null, APIError.badRequest("Invalid patientId")];
  return [input.patientId, null];
 } catch (e) {
  return [null, toError(e)];
 }
}

export async function assertAppointmentAccess(
 appointment: MappedAppointment,
 actor: RequestActor,
): Promise<Result<void>> {
 if (actor.role !== "patient") return [undefined, null];
 const [ownId, err] = await resolveOwnPatientId(actor.userId);
 if (err || !ownId) return [null, err];
 if (appointment.patientId !== ownId) {
  return [null, APIError.notFound("Appointment not found")];
 }
 return [undefined, null];
}

export interface AppointmentSearchScope {
 params: Record<string, QueryValue>;
 practitionerId?: string;
}

export async function appointmentSearchScope(
 query: AppointmentListQuery,
 actor: RequestActor,
): Promise<Result<AppointmentSearchScope>> {
 if (actor.role === "patient") {
  const [patientId, err] = await resolveOwnPatientId(actor.userId);
  if (err || !patientId) return [null, err];
  return [{ params: { patient: patientId } }, null];
 }

 const params: Record<string, QueryValue> = {};
 if (query.patient) params.patient = query.patient;

 let practitionerId = query.practitioner;
 if (!practitionerId && actor.role === "doctor") {
  const [own, err] = await findUserPractitionerId(actor.userId);
  if (err || !own) return [null, err];
  practitionerId = own;
 }
 return [{ params, practitionerId }, null];
}

const APPOINTMENT_TYPE_VALUESET = "appointment-type";

export interface AppointmentCategory {
 code: string;
 name: string;
}

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

export async function resolveProviderId(
 client: OpenEMRClient,
 providerId: string,
): Promise<Result<string>> {
 try {
  if (/^\d+$/.test(providerId)) return [providerId, null];
  const users = await listOpenEMRUsers(client);
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

async function fetchBookedWindows(
 client: OpenEMRClient,
 doctorId: string,
 date: string,
): Promise<Result<TimeWindow[]>> {
 try {
  const bundle = await client.fhirSearch("Appointment", {
   date,
   _count: APPOINTMENT_FETCH_CAP,
  });

  const appointments = (bundle.entry ?? [])
   .map((e) => e.resource as FhirAppointment)
   .filter((a) => a?.resourceType === "Appointment")
   .filter((a) => mapAppointment(a).doctorId === doctorId);

  const [overrides] = await getOverrides(
   appointments.map((a) => a.id).filter((id): id is string => Boolean(id)),
  );

  const windows = appointments
   .map((a) => {
    const override = a.id ? overrides?.get(a.id) : undefined;
    if (override && overrideIsInactive(override.status)) return null;
    const start = new Date(override?.start ?? a.start ?? 0);
    if (!isValid(start)) return null;
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

export async function computeSlots(
 client: OpenEMRClient,
 query: SlotsQuery,
): Promise<Result<Slot[]>> {
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
  const [booked, err] = await fetchBookedWindows(
   client,
   query.doctorId,
   query.date,
  );
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
  {
   role: "PPRF",
   type: ["Primary Performer"],
   actorType: "Practitioner",
   actorId: input.doctorId,
   status: "accepted",
  },
 ];
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
