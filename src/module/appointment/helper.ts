/** @format */

import { getOpenEMRClient } from "@openemr/context.ts";

import { OpenEMR } from "@/env.ts";
import APIError from "@error/APIError.ts";
import { type QueryValue } from "../../config/openemr-client/client.ts";
import type {
 AppointmentListQuery,
 AppointmentWindowInput,
 CreateAppointmentInput,
} from "@module/appointment/appointment.service.ts";
import type { FhirAppointment } from "@shared/types/fhir.ts";
import type { Result } from "@shared/types.ts";
import { toDateString, toTimeString } from "@shared/utils/date.ts";
import {
 addMinutes,
 differenceInSeconds,
 isValid,
} from "date-fns";
import { toError } from "@shared/error/error.ts";
import { listOpenEMRUsers } from "@module/openemr/helper.ts";
import {
 mapAppointment,
 type MappedAppointment,
 type MappedParticipant,
} from "@shared/utils/fhir-mapper.ts";
import { getOverrides, overrideIsInactive } from "@module/appointment/overlay.ts";
import type { PublicUser } from "@module/user/helper.ts";

export const DEFAULT_DURATION_MINUTES = 30;
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

export interface AppointmentSearchScope {
 params: Record<string, QueryValue>;
 practitionerId?: string;
}

export async function appointmentSearchScope(
 query: AppointmentListQuery,
 user: PublicUser,
): Promise<Result<AppointmentSearchScope>> {
 if (user.openemr.patientId) {
  return [{ params: { patient: user.openemr.patientId } }, null];
 }

 const params: Record<string, QueryValue> = {};
 if (query.patient) params.patient = query.patient;

 const practitionerId = user.openemr.practitionerId ?? query.practitioner;
 return [{ params, practitionerId }, null];
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
 providerId: string,
): Promise<Result<string>> {
 try {
  if (/^\d+$/.test(providerId)) return [providerId, null];
  const users = await listOpenEMRUsers();
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

export async function fetchBookedWindows(
 doctorId: string,
 date: string,
 excludeId?: string,
): Promise<Result<TimeWindow[]>> {
 const client = getOpenEMRClient();
 try {
  const bundle = await client.fhirSearch("Appointment", {
   date,
   _count: APPOINTMENT_FETCH_CAP,
  });

  const appointments = (bundle.entry ?? [])
   .map((e) => e.resource as FhirAppointment)
   .filter((a) => a?.resourceType === "Appointment")
   .filter((a) => !excludeId || a.id !== excludeId)
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

export function overlaps(a: TimeWindow, b: TimeWindow): boolean {
 return a.start < b.end && b.start < a.end;
}

export async function assertNoConflict(
 doctorId: string,
 window: AppointmentWindow,
 excludeId?: string,
): Promise<Result<void>> {
 try {
  const proposed: TimeWindow = {
   start: new Date(window.start).getTime(),
   end: new Date(window.end).getTime(),
  };
  const [booked, err] = await fetchBookedWindows(
   doctorId,
   toDateString(new Date(window.start)),
   excludeId,
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

export async function findAppointment(
 eid: string,
): Promise<Result<MappedAppointment | null>> {
 const client = getOpenEMRClient();
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
  status: "pending",
  start: booking.window.start,
  end: booking.window.end,
  type: input.type ?? "Visit",
  description: input.description,
  participants,
  patientId: booking.patientId,
  doctorId: input.doctorId,
 };
}
