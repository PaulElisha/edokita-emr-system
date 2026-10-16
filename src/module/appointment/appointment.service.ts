/** @format */
import { z } from "zod";
import APIError from "@error/APIError.ts";
import {
 mapAppointment,
 type MappedAppointment,
} from "@shared/utils/fhir-mapper.ts";
import { type QueryValue } from "@module/openemr/client.ts";
import type OpenEMRClient from "@module/openemr/client.ts";
import { openemr } from "@module/openemr/client.ts";
import { countParam } from "@shared/schemas/common.ts";
import {
 appointmentWindow,
 assertNoConflict,
 buildAppointmentPayload,
 computeSlots,
 fallbackAppointment,
 findAppointment,
 listCategories,
 resolvePatientId,
 resolveProviderId,
 type AppointmentBooking,
 type AppointmentCategory,
 type BookingActor,
 type Slot,
} from "@module/appointment/helper.ts";
import {
 applyOverride,
 applyOverrideById,
 applyOverrides,
 removeOverride,
 upsertOverride,
 type OverrideInput,
} from "@module/appointment/overlay.ts";
import type { FhirAppointment } from "@shared/types/fhir.ts";
import type { ListResult, Result } from "@shared/types.ts";
import { toError } from "@shared/error/error.ts";
import { setDefined } from "@shared/utils/object.ts";
import { resolvePatientPid } from "@module/patient/helper.ts";

export const appointmentListQuerySchema = z.object({
 patient: z.string().optional(),
 practitioner: z.string().optional(),
 date: z.string().optional(),
 status: z.string().optional(),
 _count: countParam,
});
export type AppointmentListQuery = z.infer<typeof appointmentListQuerySchema>;

export const appointmentBodySchema = z.object({
 patientId: z.string().min(1).optional(),
 doctorId: z.string().optional(),
 start: z.string().min(1),
 end: z.string().optional(),
 durationMinutes: z.coerce.number().int().min(5).max(600).optional(),
 type: z.string().optional(),
 description: z.string().optional(),
 categoryId: z.string().optional(),
 facilityId: z.string().optional(),
 billingLocationId: z.string().optional(),
});
export type CreateAppointmentInput = z.infer<typeof appointmentBodySchema>;

/** Subset required to resolve the owning patient of a booking. */
export const appointmentPatientSchema = appointmentBodySchema.pick({
 patientId: true,
});
export type AppointmentPatientInput = z.infer<typeof appointmentPatientSchema>;

/** Subset required to compute a scheduling window. */
export const appointmentWindowSchema = appointmentBodySchema.pick({
 start: true,
 end: true,
 durationMinutes: true,
});
export type AppointmentWindowInput = z.infer<typeof appointmentWindowSchema>;

export const slotsQuerySchema = z.object({
 doctorId: z.string().min(1),
 date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
 slotMinutes: z.coerce.number().int().min(5).max(240).optional(),
});
export type SlotsQuery = z.infer<typeof slotsQuerySchema>;

/** FHIR Appointment.status values accepted as local lifecycle overrides. */
export const appointmentStatusSchema = z.enum([
 "proposed",
 "pending",
 "booked",
 "arrived",
 "fulfilled",
 "cancelled",
 "noshow",
 "entered-in-error",
 "checked-in",
 "waitlist",
]);
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;

export const appointmentUpdateSchema = z
 .object({
  status: appointmentStatusSchema.optional(),
  start: z.string().min(1).optional(),
  end: z.string().optional(),
  durationMinutes: z.coerce.number().int().min(5).max(600).optional(),
  note: z.string().optional(),
 })
 .refine((v) => Object.values(v).some((x) => x !== undefined), {
  message: "At least one field must be provided",
 });
export type UpdateAppointmentInput = z.infer<typeof appointmentUpdateSchema>;

export type AppointmentListResult = ListResult<MappedAppointment>;

class AppointmentService {
 getAppointments = async (
  client: OpenEMRClient,
  query: AppointmentListQuery,
  actor: BookingActor,
 ): Promise<Result<AppointmentListResult>> => {
  try {
   const params: Record<string, QueryValue> = {
    _count: query._count ?? 100,
   };
   if (query.date) params.date = query.date;

   if (actor.role === "patient") {
    const [ownId, err] = await resolvePatientId(client, {}, actor);
    if (err || !ownId) return [null, err];
    params.patient = ownId;
   } else {
    if (query.patient) params.patient = query.patient;
    if (query.practitioner) params["actor:Practitioner"] = query.practitioner;
   }

   const bundle = await client.fhirSearch("Appointment", params);
   const mapped = (bundle.entry ?? [])
    .map((e) => e.resource as FhirAppointment)
    .filter((r) => r?.resourceType === "Appointment")
    .map(mapAppointment);

   const [items, err] = await applyOverrides(mapped);
   if (err || !items) return [null, err];

   const filtered = query.status
    ? items.filter((a) => a.status === query.status)
    : items;

   return [{ total: bundle.total ?? filtered.length, items: filtered }, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 getAppointment = async (
  client: OpenEMRClient,
  id: string,
  actor: BookingActor,
 ): Promise<Result<MappedAppointment>> => {
  try {
   const appointment = await client.fhirRead<FhirAppointment>(
    "Appointment",
    id,
   );
   const mapped = mapAppointment(appointment);
   if (actor.role === "patient") {
    const [ownId, err] = await resolvePatientId(client, {}, actor);
    if (err || !ownId) return [null, err];
    if (mapped.patientId !== ownId) {
     return [null, APIError.notFound("Appointment not found")];
    }
   }
   return applyOverrideById(mapped);
  } catch (e) {
   return [null, toError(e)];
  }
 };

 updateAppointment = async (
  client: OpenEMRClient,
  id: string,
  input: UpdateAppointmentInput,
  actor: BookingActor,
 ): Promise<Result<MappedAppointment>> => {
  try {
   const appointment = await client.fhirRead<FhirAppointment>(
    "Appointment",
    id,
   );
   const mapped = mapAppointment(appointment);
   if (actor.role === "patient") {
    const [ownId, err] = await resolvePatientId(client, {}, actor);
    if (err || !ownId) return [null, err];
    if (mapped.patientId !== ownId) {
     return [null, APIError.notFound("Appointment not found")];
    }
   }

   const override: OverrideInput = {};
   const set = setDefined(override);
   set("status", input.status);
   set("note", input.note);
   if (input.start) {
    const window = appointmentWindow({
     start: input.start,
     end: input.end,
     durationMinutes: input.durationMinutes,
    });
    override.start = new Date(window.start);
    override.end = new Date(window.end);
   }

   const [row, err] = await upsertOverride(id, override, actor.userId);
   if (err || !row) return [null, err];

   return [applyOverride(mapped, row), null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 remove = async (
  client: OpenEMRClient,
  id: string,
  actor: BookingActor,
 ): Promise<Result<{ success: true }>> => {
  try {
   const appointment = await client.fhirRead<FhirAppointment>(
    "Appointment",
    id,
   );
   const mapped = mapAppointment(appointment);
   if (actor.role === "patient") {
    const [ownId, err] = await resolvePatientId(client, {}, actor);
    if (err || !ownId) return [null, err];
    if (mapped.patientId !== ownId) {
     return [null, APIError.notFound("Appointment not found")];
    }
   }
   if (!mapped.patientId) {
    return [null, APIError.badRequest("Appointment has no patient")];
   }

   const [pid, pe] = await resolvePatientPid(client, mapped.patientId);
   if (pe || !pid) {
    return [null, pe];
   }

   const rows = await client.standardGet<{ pc_eid?: string | number; pc_uuid?: string }>(
    `/api/patient/${pid}/appointment`,
   );
   const match = rows.find((r) => r.pc_uuid === id);
   if (!match?.pc_eid) {
    return [null, APIError.notFound("Appointment not found")];
   }

   await client.standardDelete(`/api/patient/${pid}/appointment/${match.pc_eid}`);
   await removeOverride(id);
   return [{ success: true }, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 create = async (
  client: OpenEMRClient,
  input: CreateAppointmentInput,
  actor: BookingActor,
 ): Promise<Result<MappedAppointment>> => {
  try {
   const [patientId, err] = await resolvePatientId(client, input, actor);
   if (err || !patientId) {
    return [null, err];
   }
   const window = appointmentWindow(input);
   if (input.doctorId) {
    const [, er] = await assertNoConflict(client, input.doctorId, window);
    if (er) return [null, er];
   }

   const [pid, pe] = await resolvePatientPid(client, patientId);
   if (pe || !pid) {
    return [null, pe];
   }

   // A provider directory read is shared/read-only, so resolve it with the service
   // account regardless of whose token is booking.
   let providerId: string | undefined;
   if (input.doctorId) {
    const [provider, per] = await resolveProviderId(openemr, input.doctorId);
    if (per || !provider) {
     return [null, per];
    }
    providerId = provider;
   }

   const booking: AppointmentBooking = { patientId, window };
   const [created] = await client.standardPost<{ id?: string | number }>(
    `/api/patient/${pid}/appointment`,
    buildAppointmentPayload(input, booking, providerId),
   );
   const eid = created?.id != null ? String(created.id) : undefined;
   if (!eid) return [fallbackAppointment(input, booking), null];

   const [appointment, ex] = await findAppointment(client, eid);
   if (ex || !appointment) return [fallbackAppointment(input, booking), null];
   return [appointment, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 // Visit types come from a ValueSet gated behind OpenEMR's `admin/super` ACL,
 // so always read them with the service account rather than the caller's token.
 categories = (): Promise<Result<AppointmentCategory[]>> =>
  listCategories(openemr);

 slots = (client: OpenEMRClient, query: SlotsQuery): Promise<Result<Slot[]>> =>
  computeSlots(client, query);
}

export default new AppointmentService();
