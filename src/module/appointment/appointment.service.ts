/** @format */

import { z } from "zod";
import APIError from "@error/APIError.ts";
import {
 mapAppointment,
 type MappedAppointment,
} from "@shared/utils/fhir-mapper.ts";
import type OpenEMRClient from "@module/openemr/client.ts";
import { openemr } from "@module/openemr/client.ts";
import { countParam } from "@shared/schemas/common.ts";
import {
 appointmentSearchScope,
 appointmentWindow,
 APPOINTMENT_FETCH_CAP,
 assertAppointmentAccess,
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
 type Slot,
} from "@module/appointment/helper.ts";
import type { RequestActor } from "@module/auth/helper.ts";
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
 _count: countParam.default(100),
});
export type AppointmentListQuery = z.infer<typeof appointmentListQuerySchema>;

const appointmentBaseSchema = z.object({
 patientId: z.string().min(1).optional(),
 doctorId: z.string().min(1),
 start: z.string().min(1),
 end: z.string().optional(),
 durationMinutes: z.coerce.number().int().min(5).max(600).optional(),
 type: z.string().optional(),
 description: z.string().optional(),
 categoryId: z.string().optional(),
 facilityId: z.string().optional(),
 billingLocationId: z.string().optional(),
});

export const appointmentBodySchema = appointmentBaseSchema.refine(
 (v) => v.end !== undefined || v.durationMinutes !== undefined,
 { message: "end or durationMinutes is required", path: ["end"] },
);
export type CreateAppointmentInput = z.infer<typeof appointmentBodySchema>;

export const appointmentPatientSchema = appointmentBaseSchema.pick({
 patientId: true,
});
export type AppointmentPatientInput = z.infer<typeof appointmentPatientSchema>;

export const appointmentWindowSchema = appointmentBaseSchema.pick({
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
  actor: RequestActor,
 ): Promise<Result<AppointmentListResult>> => {
  try {
   const [scope, serr] = await appointmentSearchScope(query, actor);
   if (serr || !scope) return [null, serr];

   const bundle = await client.fhirSearch("Appointment", {
    _count: APPOINTMENT_FETCH_CAP,
    date: query.date,
    ...scope.params,
   });
   const mapped = (bundle.entry ?? [])
    .map((e) => e.resource as FhirAppointment)
    .filter((r) => r?.resourceType === "Appointment")
    .map(mapAppointment)
    .filter(
     (a) => !scope.practitionerId || a.doctorId === scope.practitionerId,
    );

   const [withOverrides, err] = await applyOverrides(mapped);
   if (err || !withOverrides) return [null, err];

   const filtered = query.status
    ? withOverrides.filter((a) => a.status === query.status)
    : withOverrides;

   const items = filtered.slice(0, query._count);
   return [{ total: filtered.length, items }, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 getAppointment = async (
  client: OpenEMRClient,
  id: string,
  actor: RequestActor,
 ): Promise<Result<MappedAppointment>> => {
  try {
   const appointment = await client.fhirRead<FhirAppointment>(
    "Appointment",
    id,
   );
   const mapped = mapAppointment(appointment);
   const [, accessErr] = await assertAppointmentAccess(mapped, actor);
   if (accessErr) return [null, accessErr];
   return applyOverrideById(mapped);
  } catch (e) {
   return [null, toError(e)];
  }
 };

 updateAppointment = async (
  client: OpenEMRClient,
  id: string,
  input: UpdateAppointmentInput,
  actor: RequestActor,
 ): Promise<Result<MappedAppointment>> => {
  try {
   const appointment = await client.fhirRead<FhirAppointment>(
    "Appointment",
    id,
   );
   const mapped = mapAppointment(appointment);
   const [, accessErr] = await assertAppointmentAccess(mapped, actor);
   if (accessErr) return [null, accessErr];

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
  actor: RequestActor,
 ): Promise<Result<{ success: true }>> => {
  try {
   const appointment = await client.fhirRead<FhirAppointment>(
    "Appointment",
    id,
   );
   const mapped = mapAppointment(appointment);
   const [, accessErr] = await assertAppointmentAccess(mapped, actor);
   if (accessErr) return [null, accessErr];
   if (!mapped.patientId) {
    return [null, APIError.badRequest("Appointment has no patient")];
   }

   const [pid, pe] = await resolvePatientPid(client, mapped.patientId);
   if (pe || !pid) {
    return [null, pe];
   }

   const rows = await client.standardGet<{
    pc_eid?: string | number;
    pc_uuid?: string;
   }>(`/api/patient/${pid}/appointment`);
   const match = rows.find((r) => r.pc_uuid === id);
   if (!match?.pc_eid) {
    return [null, APIError.notFound("Appointment not found")];
   }

   await client.standardDelete(
    `/api/patient/${pid}/appointment/${match.pc_eid}`,
   );
   await removeOverride(id);
   return [{ success: true }, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 create = async (
  client: OpenEMRClient,
  input: CreateAppointmentInput,
  actor: RequestActor,
 ): Promise<Result<MappedAppointment>> => {
  try {
   const [patientId, err] = await resolvePatientId(client, input, actor);
   if (err || !patientId) return [null, err];

   const window = appointmentWindow(input);
   const [[pid, pe], [providerId, providerErr], [, conflict]] =
    await Promise.all([
     resolvePatientPid(client, patientId),
     resolveProviderId(openemr, input.doctorId),
     assertNoConflict(client, input.doctorId, window),
    ]);
   if (pe || !pid) return [null, pe];
   if (providerErr || !providerId) return [null, providerErr];
   if (conflict) return [null, conflict];

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

 categories = (): Promise<Result<AppointmentCategory[]>> =>
  listCategories(openemr);

 slots = (client: OpenEMRClient, query: SlotsQuery): Promise<Result<Slot[]>> =>
  computeSlots(client, query);
}

export default new AppointmentService();
