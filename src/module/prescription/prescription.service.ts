/** @format */

import { getOpenEMRClient } from "@openemr/context.ts";

import { z } from "zod";
import { resolveProviderId } from "@module/appointment/helper.ts";
import { countParam } from "@shared/schemas/common.ts";
import type { PublicUser } from "@module/user/helper.ts";
import APIError from "@error/APIError.ts";
import type { ListResult, Result } from "@shared/types.ts";
import { toError } from "@shared/error/error.ts";
import { setDefined } from "@shared/utils/object.ts";

type PrescriptionRecord = Record<string, unknown>;

export const prescriptionListQuerySchema = z.object({
 patientId: z.string().optional(),
 _count: countParam.default(100),
});
export type PrescriptionListQuery = z.infer<typeof prescriptionListQuerySchema>;

export const prescriptionBodySchema = z.object({
 patientId: z.string().min(1),
 providerId: z.string().min(1),
 drug: z.string().min(1),
 drugId: z.string().optional(),
 rxnormDrugcode: z.string().optional(),
 dosage: z.coerce.number().optional(),
 quantity: z.string().optional(),
 size: z.string().optional(),
 unit: z.string().optional(),
 route: z.string().optional(),
 interval: z.string().optional(),
 refills: z.coerce.number().int().optional(),
 perRefill: z.coerce.number().int().optional(),
 form: z.string().optional(),
 note: z.string().optional(),
 medication: z.string().optional(),
 substitute: z.string().optional(),
 startDate: z.string().optional(),
 endDate: z.string().optional(),
 diagnosis: z.string().optional(),
 encounter: z.string().optional(),
 requestIntent: z.string().optional(),
 requestIntentTitle: z.string().optional(),
 usageCategory: z.string().optional(),
 usageCategoryTitle: z.string().optional(),
 drugDosageInstructions: z.string().optional(),
});
export type CreatePrescriptionInput = z.infer<typeof prescriptionBodySchema>;

type PrescriptionListResult = ListResult<PrescriptionRecord>;

class PrescriptionService {
 list = async (
  query: PrescriptionListQuery,
  user: PublicUser,
 ): Promise<Result<PrescriptionListResult>> => {
  const client = getOpenEMRClient();
  try {
   const patientId = (user.openemr.patientId ?? query.patientId)!;

   const params: Record<string, string | number> = {
    patient_uuid: patientId,
    _count: query._count,
   };
   const items = await client.standardGet<PrescriptionRecord>(
    "/api/prescription",
    params,
   );
   return [{ total: items.length, items }, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 get = async (
  id: string,
 ): Promise<Result<PrescriptionRecord>> => {
  const client = getOpenEMRClient();
  try {
   const [item] = await client.standardGet<PrescriptionRecord>(
    `/api/prescription/${id}`,
   );
   if (!item) return [null, APIError.notFound("Prescription not found")];
   return [item, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 create = async (
  input: CreatePrescriptionInput,
 ): Promise<Result<PrescriptionRecord>> => {
  const client = getOpenEMRClient();
  try {
   const pid = input.patientId;
   const [providerId, perr] = await resolveProviderId(
    input.providerId,
   );
   if (perr || !providerId) return [null, perr];

   const payload = buildPrescriptionPayload(input, pid);
   payload.provider_id = providerId;

   const [created] = await client.standardPost<PrescriptionRecord>(
    "/api/prescription",
    payload,
   );
   return [created ?? {}, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 remove = async (
  id: string,
  patientUuid?: string,
 ): Promise<Result<PrescriptionRecord>> => {
  const client = getOpenEMRClient();
  try {
   const [deleted] = await client.standardDelete<PrescriptionRecord>(
    `/api/prescription/${id}`,
    patientUuid ? { patient_uuid: patientUuid } : undefined,
   );
   return [deleted ?? {}, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };
}

function buildPrescriptionPayload(
 input: CreatePrescriptionInput,
 pid: string,
): Record<string, unknown> {
 const payload: Record<string, unknown> = {
  patient_id: Number(pid),
  drug: input.drug,
 };

 const set = setDefined(payload);
 set("drug_id", input.drugId);
 set("rxnorm_drugcode", input.rxnormDrugcode);
 set("dosage", input.dosage);
 set("quantity", input.quantity);
 set("size", input.size);
 set("unit", input.unit);
 set("route", input.route);
 set("interval", input.interval);
 set("refills", input.refills);
 set("per_refill", input.perRefill);
 set("form", input.form);
 set("note", input.note);
 set("medication", input.medication);
 set("substitute", input.substitute);
 set("start_date", input.startDate);
 set("end_date", input.endDate);
 set("diagnosis", input.diagnosis);
 set("encounter", input.encounter);
 set("request_intent", input.requestIntent);
 set("request_intent_title", input.requestIntentTitle);
 set("usage_category", input.usageCategory);
 set("usage_category_title", input.usageCategoryTitle);
 set("drug_dosage_instructions", input.drugDosageInstructions);

 return payload;
}

export default new PrescriptionService();
