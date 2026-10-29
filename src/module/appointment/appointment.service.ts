/** @format */

import { getOpenEMRClient, runWithOpenEMR } from "@openemr/context.ts";

import { z } from "zod";
import APIError from "@error/APIError.ts";
import {
 mapAppointment,
 type MappedAppointment,
} from "@shared/utils/fhir-mapper.ts";
import { openemr } from "../../config/openemr-client/client.ts";
import { countParam } from "@shared/schemas/common.ts";
import {
 appointmentSearchScope,
 appointmentWindow,
 APPOINTMENT_FETCH_CAP,
 assertNoConflict,
 buildAppointmentPayload,
 fallbackAppointment,
 findAppointment,
 resolveProviderId,
 type AppointmentBooking,
} from "@module/appointment/helper.ts";
import {
 AppointmentBase,
 type AppointmentCategory,
 type Slot,
} from "@module/appointment/appointment.base.ts";
import type { PublicUser } from "@module/user/helper.ts";
import {
 applyOverride,
 applyOverrides,
 removeOverride,
 upsertOverride,
 type OverrideInput,
} from "@module/appointment/overlay.ts";
import type { FhirAppointment } from "@shared/types/fhir.ts";
import type { ListResult, Result } from "@shared/types.ts";
import { toError } from "@shared/error/error.ts";
import { setDefined } from "@shared/utils/object.ts";

const appointmentStatusSchema = z.enum([
 "proposed",
 "pending",
 "awaiting-payment",
 "booked",
 "rescheduled",
 "arrived",
 "fulfilled",
 "cancelled",
 "noshow",
 "entered-in-error",
 "checked-in",
 "waitlist",
]);
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;

export const appointmentListQuerySchema = z.object({
 patient: z.string().optional(),
 practitioner: z.string().optional(),
 date: z.string().optional(),
 status: appointmentStatusSchema.optional(),
 _count: countParam.default(100),
});
export type AppointmentListQuery = z.infer<typeof appointmentListQuerySchema>;

const appointmentBaseSchema = z.object({
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

const appointmentWindowSchema = appointmentBaseSchema.pick({
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

export const appointmentRescheduleSchema = z.object({
 start: z.string().min(1),
 end: z.string().optional(),
 durationMinutes: z.coerce.number().int().min(5).max(600).optional(),
 note: z.string().optional(),
});
export type RescheduleAppointmentInput = z.infer<
 typeof appointmentRescheduleSchema
>;

type AppointmentListResult = ListResult<MappedAppointment>;

class AppointmentService {
 getAppointments = async (
  query: AppointmentListQuery,
  user: PublicUser,
 ): Promise<Result<AppointmentListResult>> => {
  const client = getOpenEMRClient();
  try {
   const [scope, serr] = await appointmentSearchScope(query, user);
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

 getAppointment = (id: string) => {
  return AppointmentBase.loadAppointment(id);
 };

 updateAppointment = async (
  id: string,
  input: UpdateAppointmentInput,
  userId: string,
 ): Promise<Result<MappedAppointment>> => {
  try {
   const [appointment, loadErr] = await AppointmentBase.loadAppointment(id);
   if (loadErr || !appointment) return [null, loadErr];

   const override: OverrideInput = {};
   const set = setDefined(override);
   set("status", input.status);
   set("note", input.note);
   if (input.start) {
    const [window, rescheduleErr] = await AppointmentBase.prepareReschedule(
     appointment,
     {
      start: input.start,
      end: input.end,
      durationMinutes: input.durationMinutes,
     },
    );
    if (rescheduleErr || !window) return [null, rescheduleErr];
    override.start = window.start;
    override.end = window.end;
    if (!input.status) override.status = "rescheduled";
   }

   const [row, err] = await upsertOverride(id, override, userId);
   if (err || !row) return [null, err];

   return [applyOverride(appointment, row), null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 accept = async (
  id: string,
  userId: string,
 ): Promise<Result<MappedAppointment>> => {
  const [appointment, err] = await AppointmentBase.loadAppointment(id);
  if (err || !appointment) return [null, err];
  return AppointmentBase.setStatus(appointment, "awaiting-payment", userId);
 };

 confirm = async (
  id: string,
  userId: string,
 ): Promise<Result<MappedAppointment>> => {
  const [appointment, err] = await AppointmentBase.loadAppointment(id);
  if (err || !appointment) return [null, err];
  return AppointmentBase.setStatus(appointment, "booked", userId);
 };

 reschedule = async (
  id: string,
  input: RescheduleAppointmentInput,
  userId: string,
 ): Promise<Result<MappedAppointment>> => {
  try {
   const [appointment, loadErr] = await AppointmentBase.loadAppointment(id);
   if (loadErr || !appointment) return [null, loadErr];

   const [window, windowErr] = await AppointmentBase.prepareReschedule(
    appointment,
    input,
   );
   if (windowErr || !window) return [null, windowErr];

   const [row, err] = await upsertOverride(
    id,
    {
     status: "rescheduled",
     start: window.start,
     end: window.end,
     note: input.note,
    },
    userId,
   );
   if (err || !row) return [null, err];

   return [applyOverride(appointment, row), null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 done = async (
  id: string,
  userId: string,
 ): Promise<Result<MappedAppointment>> => {
  const [appointment, err] = await AppointmentBase.loadAppointment(id);
  if (err || !appointment) return [null, err];
  return AppointmentBase.setStatus(appointment, "fulfilled", userId);
 };

 cancel = async (
  id: string,
  userId: string,
 ): Promise<Result<MappedAppointment>> => {
  const [appointment, err] = await AppointmentBase.loadAppointment(id);
  if (err || !appointment) return [null, err];
  return AppointmentBase.setStatus(appointment, "cancelled", userId);
 };

 remove = async (
  id: string,
  user: PublicUser,
 ): Promise<Result<{ success: true }>> => {
  const client = getOpenEMRClient();
  try {
   const [appointment, loadErr] = await AppointmentBase.loadAppointment(id);
   if (loadErr || !appointment) return [null, loadErr];
   const patientId = (appointment.patientId ?? user.openemr.patientId)!;
   const pid = user.openemr.patientPid ?? patientId;

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
  input: CreateAppointmentInput,
  user: PublicUser,
 ): Promise<Result<MappedAppointment>> => {
  const client = getOpenEMRClient();
  try {
   const patientId = user.openemr.patientId;
   if (!patientId) {
    return [null, APIError.badRequest("Patient profile is not linked")];
   }
   const pid = user.openemr.patientPid ?? patientId;

   const window = appointmentWindow(input);
   const [[providerId, providerErr], [, conflict]] = await Promise.all([
    runWithOpenEMR(openemr, () => resolveProviderId(input.doctorId)),
    assertNoConflict(input.doctorId, window),
   ]);
   if (providerErr || !providerId) return [null, providerErr];
   if (conflict) return [null, conflict];

   const booking: AppointmentBooking = { patientId, window };
   const [created] = await client.standardPost<{ id?: string | number }>(
    `/api/patient/${pid}/appointment`,
    buildAppointmentPayload(input, booking, providerId),
   );
   const eid = created?.id != null ? String(created.id) : undefined;
   if (!eid) return [fallbackAppointment(input, booking), null];

   const [appointment, ex] = await findAppointment(eid);
   if (ex || !appointment) return [fallbackAppointment(input, booking), null];
   if (!appointment.id) return [appointment, null];

   const [row, overrideErr] = await upsertOverride(
    appointment.id,
    { status: "pending" },
    user.id,
   );
   if (overrideErr || !row) return [null, overrideErr];
   return [applyOverride(appointment, row), null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 categories = (): Promise<Result<AppointmentCategory[]>> =>
  runWithOpenEMR(openemr, () => AppointmentBase.listCategories());

 slots = (query: SlotsQuery): Promise<Result<Slot[]>> => {
  return AppointmentBase.computeSlots(query);
 };
}

export default new AppointmentService();
