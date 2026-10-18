import { z } from "zod";
import type OpenEMRClient from "@module/openemr/client.ts";
import {
 resolvePatientPid,
 resolveOwnPatientId,
} from "@module/patient/helper.ts";
import type { RequestActor } from "@module/auth/helper.ts";
import {
 findUserByPatientId,
 findUserByPractitionerId,
 findUserPractitionerId,
} from "@module/user/helper.ts";
import { recordEmrAuthor, recordEmrAuthors } from "@module/emr/helper.ts";
import { notify } from "@module/notification/notification.service.ts";
import APIError from "@error/APIError.ts";
import type { ListResult, Result } from "@shared/types.ts";
import { toError } from "@shared/error/error.ts";
import { setDefined } from "@shared/utils/object.ts";

export type LabRecord = Record<string, unknown>;

const asString = (v: unknown): string | undefined =>
 typeof v === "string" && v ? v : undefined;

export type LabActor = RequestActor;

export const labOrderListQuerySchema = z.object({
 patientId: z.string().optional(),
 doctorId: z.string().optional(),
 status: z.string().optional(),
});
export type LabOrderListQuery = z.infer<typeof labOrderListQuerySchema>;

export const labOrderBodySchema = z.object({
 patientId: z.string().min(1),
 orderCode: z.string().min(1),
 orderName: z.string().optional(),
 procedureType: z.string().optional(),
 encounterId: z.coerce.number().int().optional(),
 dateCollected: z.string().optional(),
 orderPriority: z.string().optional(),
 patientInstructions: z.string().optional(),
});
export type CreateLabOrderInput = z.infer<typeof labOrderBodySchema>;

export const labResultListQuerySchema = z.object({
 orderId: z.string().optional(),
 patientId: z.string().optional(),
 doctorId: z.string().optional(),
});
export type LabResultListQuery = z.infer<typeof labResultListQuerySchema>;

export const labResultParamSchema = z.object({
 resultId: z.string().min(1),
});
export type LabResultParam = z.infer<typeof labResultParamSchema>;

export const labResultBodySchema = z.object({
 orderId: z.union([z.string(), z.number()]),
 reportStatus: z.string().optional(),
 dateReport: z.string().optional(),
 specimenNum: z.string().optional(),
 results: z
  .array(
   z.object({
    resultCode: z.string().min(1),
    resultText: z.string().optional(),
    result: z.union([z.string(), z.number()]).optional(),
    units: z.string().optional(),
    range: z.string().optional(),
    abnormal: z.string().optional(),
    resultStatus: z.string().optional(),
    comments: z.string().optional(),
    date: z.string().optional(),
   }),
  )
  .min(1),
});
export type CreateLabResultInput = z.infer<typeof labResultBodySchema>;

export type LabListResult = ListResult<LabRecord>;

class LabService {
 listOrders = async (
  client: OpenEMRClient,
  query: LabOrderListQuery,
  actor: LabActor,
 ): Promise<Result<LabListResult>> => {
  try {
   const params: Record<string, string | number> = {};
   if (actor.role === "patient") {
    const [ownId, perr] = await resolveOwnPatientId(actor.userId);
    if (perr || !ownId) return [null, perr];
    const [pid, rperr] = await resolvePatientPid(client, ownId);
    if (rperr || !pid) return [null, rperr];
    params.patient_id = pid;
   } else if (query.patientId) {
    const [pid, perr] = await resolvePatientPid(client, query.patientId);
    if (perr || !pid) return [null, perr];
    params.patient_id = pid;
   }
   if (query.status) params.status = query.status;

   let providerUuid: string | undefined;
   if (actor.role !== "patient") {
    const doctorUserId = query.doctorId ?? (actor.role === "doctor" ? actor.userId : undefined);
    if (doctorUserId) {
     const [uuid, derr] = await findUserPractitionerId(doctorUserId);
     if (derr || !uuid) return [null, derr];
     providerUuid = uuid;
    }
   }

   let items = await client.standardGet<LabRecord>("/api/lab_order", params);
   if (providerUuid) {
    items = items.filter((o) => asString(o.provider_uuid) === providerUuid);
   }
   return [{ total: items.length, items }, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 createOrder = async (
  client: OpenEMRClient,
  input: CreateLabOrderInput,
  actor: LabActor,
 ): Promise<Result<LabRecord>> => {
  try {
   const [pid, perr] = await resolvePatientPid(client, input.patientId);
   if (perr || !pid) return [null, perr];

   const payload: Record<string, unknown> = { patient_id: Number(pid) };
   const set = setDefined(payload);
   set("order_code", input.orderCode);
   set("order_name", input.orderName);
   set("procedure_type", input.procedureType);
   set("encounter_id", input.encounterId);
   set("date_collected", input.dateCollected);
   set("order_priority", input.orderPriority);
   set("patient_instructions", input.patientInstructions);

   const [created] = await client.standardPost<LabRecord>(
    "/api/lab_order",
    payload,
   );
   const order = created ?? {};
   const patientUuid = asString(order.patient_uuid);
   const orderUuid = asString(order.order_uuid);
   if (patientUuid && orderUuid) {
    await recordEmrAuthor(patientUuid, "lab_order", orderUuid, actor.userId);
   }
   return [order, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 listResults = async (
  client: OpenEMRClient,
  query: LabResultListQuery,
  actor: LabActor,
 ): Promise<Result<LabListResult>> => {
  try {
   const params: Record<string, string | number> = {};
   if (query.orderId) params.order_id = query.orderId;
   if (actor.role === "patient") {
    const [ownId, perr] = await resolveOwnPatientId(actor.userId);
    if (perr || !ownId) return [null, perr];
    const [pid, rperr] = await resolvePatientPid(client, ownId);
    if (rperr || !pid) return [null, rperr];
    params.patient_id = pid;
   } else if (query.patientId) {
    const [pid, perr] = await resolvePatientPid(client, query.patientId);
    if (perr || !pid) return [null, perr];
    params.patient_id = pid;
   }

   if (actor.role !== "patient") {
    const doctorUserId = query.doctorId ?? (actor.role === "doctor" ? actor.userId : undefined);
    if (doctorUserId) {
     const [uuid, derr] = await findUserPractitionerId(doctorUserId);
     if (derr || !uuid) return [null, derr];
     params.provider_uuid = uuid;
    }
   }

   if (!params.order_id && !params.patient_id && !params.provider_uuid) {
    return [null, APIError.badRequest("orderId, patientId or doctorId is required")];
   }

   const items = await client.standardGet<LabRecord>("/api/lab_result", params);
   return [{ total: items.length, items }, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

  getResult = async (
   client: OpenEMRClient,
   resultId: string,
   actor: LabActor,
  ): Promise<Result<LabRecord>> => {
   try {
    const params: Record<string, string | number> = { result_uuid: resultId };
    if (actor.role === "patient") {
     const [ownId, perr] = await resolveOwnPatientId(actor.userId);
     if (perr || !ownId) return [null, perr];
     const [pid, rperr] = await resolvePatientPid(client, ownId);
     if (rperr || !pid) return [null, rperr];
     params.patient_id = pid;
    }
    const [item] = await client.standardGet<LabRecord>("/api/lab_result", params);
    if (!item) return [null, APIError.notFound("Lab result not found")];
    return [item, null];
   } catch (e) {
    return [null, toError(e)];
   }
  };

  createResult = async (
  client: OpenEMRClient,
  input: CreateLabResultInput,
  actor: LabActor,
 ): Promise<Result<LabRecord>> => {
  try {
   const payload: Record<string, unknown> = {
    order_id: Number(input.orderId),
    results: input.results.map((r) => ({
     result_code: r.resultCode,
     result_text: r.resultText,
     result: r.result,
     units: r.units,
     range: r.range,
     abnormal: r.abnormal,
     result_status: r.resultStatus,
     comments: r.comments,
     date: r.date,
    })),
   };
   const set = setDefined(payload);
   set("report_status", input.reportStatus);
   set("date_report", input.dateReport);
   set("specimen_num", input.specimenNum);

   const [created] = await client.standardPost<LabRecord>(
    "/api/lab_result",
    payload,
   );
   const report = created ?? {};
   const patientUuid = asString(report.patient_uuid);
   const results = Array.isArray(report.results) ? report.results : [];

   if (patientUuid) {
    await recordEmrAuthors(
     patientUuid,
     actor.userId,
     results
      .map((r) => asString((r as LabRecord).result_uuid))
      .filter((id): id is string => Boolean(id))
      .map((resourceId) => ({
       resourceType: "lab_result" as const,
       resourceId,
      })),
    );
   }

   const providerUuid = asString(report.provider_uuid);
   if (providerUuid && patientUuid) {
    const [[doctor], [patient]] = await Promise.all([
     findUserByPractitionerId(providerUuid),
     findUserByPatientId(patientUuid),
    ]);
    if (doctor) {
     const who = patient
      ? `${patient.firstName ?? ""} ${patient.lastName ?? ""}`.trim()
      : "a patient";
     await notify(doctor.id, {
      type: "lab_result",
      title: "Lab results available",
      body: `Lab results for ${who || "a patient"} are ready to review.`,
      data: { patientId: patientUuid, orderId: report.order_id },
     });
    }
   }
   return [report, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };
}

export default new LabService();
