/** @format */

import { getOpenEMRClient } from "@openemr/context.ts";

import { z } from "zod";
import type { PublicUser } from "@module/user/helper.ts";
import {
 findUserByPatientId,
 findUserByPractitionerId,
} from "@module/user/helper.ts";
import { recordEmrAuthor, recordEmrAuthors } from "@module/emr/helper.ts";
import { notify } from "@module/notification/notification.service.ts";
import APIError from "@error/APIError.ts";
import type { ListResult, Result } from "@shared/types.ts";
import { toError } from "@shared/error/error.ts";
import { setDefined } from "@shared/utils/object.ts";

type LabRecord = Record<string, unknown>;

const asString = (v: unknown): string | undefined =>
 typeof v === "string" && v ? v : undefined;

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

type LabListResult = ListResult<LabRecord>;

class LabService {
 listOrders = async (
  query: LabOrderListQuery,
  user: PublicUser,
 ): Promise<Result<LabListResult>> => {
  const client = getOpenEMRClient();
  try {
   const params: Record<string, string | number> = {};
   const pid =
    user.openemr.patientPid ?? user.openemr.patientId ?? query.patientId;
   if (pid) params.patient_id = pid;
   if (query.status) params.status = query.status;

   const providerUuid = user.openemr.patientId
    ? undefined
    : (query.doctorId ?? user.openemr.practitionerId);

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
  input: CreateLabOrderInput,
  user: PublicUser,
 ): Promise<Result<LabRecord>> => {
  const client = getOpenEMRClient();
  try {
   const pid = user.openemr.patientPid ?? input.patientId;

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
    await recordEmrAuthor(patientUuid, "lab_order", orderUuid, user.id);
   }
   return [order, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 listResults = async (
  query: LabResultListQuery,
  user: PublicUser,
 ): Promise<Result<LabListResult>> => {
  const client = getOpenEMRClient();
  try {
   const params: Record<string, string | number> = {};
   if (query.orderId) params.order_id = query.orderId;
   const pid =
    user.openemr.patientPid ?? user.openemr.patientId ?? query.patientId;
   if (pid) params.patient_id = pid;

   const providerUuid = user.openemr.patientId
    ? undefined
    : (query.doctorId ?? user.openemr.practitionerId);
   if (providerUuid) params.provider_uuid = providerUuid;

   if (!params.order_id && !params.patient_id && !params.provider_uuid) {
    return [
     null,
     APIError.badRequest("orderId, patientId or doctorId is required"),
    ];
   }

   const items = await client.standardGet<LabRecord>("/api/lab_result", params);
   return [{ total: items.length, items }, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 getResult = async (
  resultId: string,
  user: PublicUser,
 ): Promise<Result<LabRecord>> => {
  const client = getOpenEMRClient();
  try {
   const params: Record<string, string | number> = { result_uuid: resultId };
   const pid = user.openemr.patientPid ?? user.openemr.patientId;
   if (pid) params.patient_id = pid;
   const [item] = await client.standardGet<LabRecord>(
    "/api/lab_result",
    params,
   );
   if (!item) return [null, APIError.notFound("Lab result not found")];
   return [item, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 createResult = async (
  input: CreateLabResultInput,
  user: PublicUser,
 ): Promise<Result<LabRecord>> => {
  const client = getOpenEMRClient();
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
     user.id,
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
