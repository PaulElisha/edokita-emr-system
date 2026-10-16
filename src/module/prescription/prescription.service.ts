/** @format */
import { z } from "zod";
import type OpenEMRClient from "@module/openemr/client.ts";
import { resolvePatientPid } from "@module/patient/helper.ts";
import { resolveProviderId } from "@module/appointment/helper.ts";
import { countParam } from "@shared/schemas/common.ts";
import { roleSchema } from "@db/schema/role.ts";
import { findUserById } from "@module/user/helper.ts";
import APIError from "@error/APIError.ts";
import type { ListResult, Result } from "@shared/types.ts";
import { toError } from "@shared/error/error.ts";
import { setDefined } from "@shared/utils/object.ts";

export type PrescriptionRecord = Record<string, unknown>;

export interface PrescriptionActor {
 role: z.infer<typeof roleSchema>;
 userId: string;
}

export const prescriptionListQuerySchema = z.object({
 patientId: z.string().optional(),
 _count: countParam,
});
export type PrescriptionListQuery = z.infer<typeof prescriptionListQuerySchema>;

/**
 * Subset of OpenEMR's `POST /api/prescription` allowlist our API exposes, in
 * camelCase. `patientId` (uuid) is translated to OpenEMR's numeric `patient_id`.
 */
export const prescriptionBodySchema = z.object({
 patientId: z.string().min(1),
 providerId: z.string().optional(),
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

export type PrescriptionListResult = ListResult<PrescriptionRecord>;

class PrescriptionService {
 list = async (
  client: OpenEMRClient,
  query: PrescriptionListQuery,
  actor: PrescriptionActor,
 ): Promise<Result<PrescriptionListResult>> => {
  try {
   const [patientId, perr] = await this.resolveListPatient(
    actor,
    query.patientId,
   );
   if (perr || !patientId) {
    return [null, perr];
   }

   const params: Record<string, string | number> = {
    patient_uuid: patientId,
    _count: query._count ?? 100,
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
  client: OpenEMRClient,
  id: string,
 ): Promise<Result<PrescriptionRecord>> => {
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
  client: OpenEMRClient,
  input: CreatePrescriptionInput,
 ): Promise<Result<PrescriptionRecord>> => {
  try {
   const [pid, pe] = await resolvePatientPid(client, input.patientId);
   if (pe || !pid) return [null, pe];

   const payload = buildPrescriptionPayload(input, pid);
   if (input.providerId) {
    const [provider, per] = await resolveProviderId(client, input.providerId);
    if (per || !provider) return [null, per];
    payload.provider_id = provider;
   }

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
  client: OpenEMRClient,
  id: string,
  patientUuid?: string,
 ): Promise<Result<PrescriptionRecord>> => {
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

 /** Patients may only list their own prescriptions; staff must name a patient. */
 private resolveListPatient = async (
  actor: PrescriptionActor,
  requested?: string,
 ): Promise<Result<string>> => {
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
  if (!requested) return [null, APIError.badRequest("patientId is required")];
  return [requested, null];
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
