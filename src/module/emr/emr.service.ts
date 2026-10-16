/** @format */
import { z } from "zod";
import {
 type MappedClinical,
 type MappedEncounter,
} from "@shared/utils/fhir-mapper.ts";
import type OpenEMRClient from "@module/openemr/client.ts";
import {
 buildAllergyPayload,
 buildConditionPayload,
 buildEncounterPayload,
 buildMedicationPayload,
 buildVitalsPayload,
 searchClinical,
 searchObservations,
} from "@module/emr/helper.ts";
import type { FhirEncounter } from "@shared/types/fhir.ts";
import type { ListResult, Result } from "@shared/types.ts";
import { toError } from "@shared/error/error.ts";
import { resolvePatientPid } from "@module/patient/helper.ts";

export const clinicalKindSchema = z.enum([
 "conditions",
 "allergies",
 "medications",
 "immunizations",
 "procedures",
 "encounters",
]);
export type ClinicalKind = z.infer<typeof clinicalKindSchema>;

export const emrPatientParamSchema = z.object({
 patientId: z.string().min(1),
});
export type EmrPatientParam = z.infer<typeof emrPatientParamSchema>;

export const emrClinicalParamSchema = emrPatientParamSchema.extend({
 kind: clinicalKindSchema,
});
export type EmrClinicalParam = z.infer<typeof emrClinicalParamSchema>;

export const emrEncounterParamSchema = emrPatientParamSchema.extend({
 encounterId: z.string().min(1),
});
export type EmrEncounterParam = z.infer<typeof emrEncounterParamSchema>;

export const encounterBodySchema = z.object({
 date: z.string().optional(),
 reason: z.string().optional(),
 categoryId: z.string().optional(),
 facilityId: z.string().optional(),
 billingFacility: z.string().optional(),
 providerId: z.string().optional(),
 classCode: z.string().optional(),
 sensitivity: z.string().optional(),
});
export type CreateEncounterInput = z.infer<typeof encounterBodySchema>;

export const vitalsBodySchema = z.object({
 date: z.string().optional(),
 systolic: z.coerce.number().optional(),
 diastolic: z.coerce.number().optional(),
 weightKg: z.coerce.number().positive().optional(),
 heightCm: z.coerce.number().positive().optional(),
 temperatureC: z.coerce.number().optional(),
 temperatureMethod: z.string().optional(),
 pulse: z.coerce.number().optional(),
 respiration: z.coerce.number().optional(),
 oxygenSaturation: z.coerce.number().optional(),
 waistCircumference: z.coerce.number().positive().optional(),
 headCircumference: z.coerce.number().positive().optional(),
 note: z.string().optional(),
});
export type RecordVitalsInput = z.infer<typeof vitalsBodySchema>;

/** OpenEMR problem-list / allergy codes are `<codetype>:<code>` (e.g. `ICD10:H02.839`). */
const diagnosisSchema = z
 .string()
 .regex(/^[A-Za-z0-9_-]+:.+$/, "Expected `<codetype>:<code>`");
const isoDateSchema = z
 .string()
 .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

export const conditionBodySchema = z.object({
 title: z.string().min(1),
 beginDate: isoDateSchema,
 endDate: isoDateSchema.optional(),
 diagnosis: diagnosisSchema.optional(),
});
export type ConditionInput = z.infer<typeof conditionBodySchema>;

export const allergyBodySchema = conditionBodySchema.extend({
 comments: z.string().optional(),
});
export type AllergyInput = z.infer<typeof allergyBodySchema>;

export const medicationBodySchema = z.object({
 title: z.string().min(1),
 beginDate: isoDateSchema.optional(),
 endDate: isoDateSchema.optional(),
 diagnosis: diagnosisSchema.optional(),
});
export type MedicationInput = z.infer<typeof medicationBodySchema>;

export const soapNoteBodySchema = z.object({
 subjective: z.string().min(2).max(65535),
 objective: z.string().min(2).max(65535),
 assessment: z.string().min(2).max(65535),
 plan: z.string().min(2).max(65535),
});
export type SoapNoteInput = z.infer<typeof soapNoteBodySchema>;

/** Param schema for a nested clinical record (condition/allergy/medication id). */
export const emrClinicalItemParamSchema = emrPatientParamSchema.extend({
 itemId: z.string().min(1),
});
export type EmrClinicalItemParam = z.infer<typeof emrClinicalItemParamSchema>;

export const emrSoapNoteParamSchema = emrEncounterParamSchema.extend({
 noteId: z.string().min(1),
});
export type EmrSoapNoteParam = z.infer<typeof emrSoapNoteParamSchema>;

export const emrVitalItemParamSchema = emrEncounterParamSchema.extend({
 vitalId: z.string().min(1),
});
export type EmrVitalItemParam = z.infer<typeof emrVitalItemParamSchema>;

export type StandardResource = Record<string, unknown>;

export type ClinicalItem = MappedClinical | MappedEncounter;

export type ClinicalSearchResult = ListResult<ClinicalItem> & {
 kind: ClinicalKind;
};

export interface ObservationValue {
 value?: number | string | boolean;
 unit?: string;
}

export interface ObservationItem {
 id?: string;
 code?: string;
 category: string[];
 effective?: string;
 value?: ObservationValue;
 components?: Array<{ code?: string; value?: ObservationValue }>;
}

export type ObservationResult = ListResult<ObservationItem>;

export interface ClinicalSummary {
 patientId: string;
 conditions: ClinicalSearchResult;
 allergies: ClinicalSearchResult;
 medications: ClinicalSearchResult;
 immunizations: ClinicalSearchResult;
 procedures: ClinicalSearchResult;
 encounters: ClinicalSearchResult;
 vitals: ObservationResult;
 labs: ObservationResult;
}

class EmrService {
 summary = async (
  client: OpenEMRClient,
  patientId: string,
 ): Promise<Result<ClinicalSummary>> => {
  const [
   conditions,
   allergies,
   medications,
   immunizations,
   procedures,
   encounters,
   vitals,
   labs,
  ] = await Promise.all([
   searchClinical(client, "conditions", patientId),
   searchClinical(client, "allergies", patientId),
   searchClinical(client, "medications", patientId),
   searchClinical(client, "immunizations", patientId),
   searchClinical(client, "procedures", patientId),
   searchClinical(client, "encounters", patientId),
   searchObservations(client, patientId, "vital-signs"),
   searchObservations(client, patientId, "laboratory"),
  ]);

  const err =
   conditions[1] ??
   allergies[1] ??
   medications[1] ??
   immunizations[1] ??
   procedures[1] ??
   encounters[1] ??
   vitals[1] ??
   labs[1];
  if (err) return [null, err];

  return [
   {
    patientId,
    conditions: conditions[0] as ClinicalSearchResult,
    allergies: allergies[0] as ClinicalSearchResult,
    medications: medications[0] as ClinicalSearchResult,
    immunizations: immunizations[0] as ClinicalSearchResult,
    procedures: procedures[0] as ClinicalSearchResult,
    encounters: encounters[0] as ClinicalSearchResult,
    vitals: vitals[0] as ObservationResult,
    labs: labs[0] as ObservationResult,
   },
   null,
  ];
 };

 clinical = (
  client: OpenEMRClient,
  patientId: string,
  kind: ClinicalKind,
 ): Promise<Result<ClinicalSearchResult>> =>
  searchClinical(client, kind, patientId);

 observations = (
  client: OpenEMRClient,
  patientId: string,
  category: "vital-signs" | "laboratory",
 ): Promise<Result<ObservationResult>> =>
  searchObservations(client, patientId, category);

 encounter = async (
  client: OpenEMRClient,
  _patientId: string,
  encounterId: string,
 ): Promise<Result<FhirEncounter>> => {
  try {
   const encounter = await client.fhirRead<FhirEncounter>(
    "Encounter",
    encounterId,
   );
   return [encounter, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 createEncounter = async (
  client: OpenEMRClient,
  patientId: string,
  input: CreateEncounterInput,
 ): Promise<Result<StandardResource>> => {
  try {
   const created = await client.standardPost<StandardResource>(
    `/api/patient/${patientId}/encounter`,
    buildEncounterPayload(input),
   );
   return [created[0] ?? {}, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 recordVitals = async (
  client: OpenEMRClient,
  patientId: string,
  encounterId: string,
  input: RecordVitalsInput,
 ): Promise<Result<StandardResource>> => {
  try {
   const [pid, pe] = await resolvePatientPid(client, patientId);
   if (pe || !pid) {
    return [null, pe];
   }
   const created = await client.standardPost<StandardResource>(
    `/api/patient/${pid}/encounter/${encounterId}/vital`,
    buildVitalsPayload(input),
   );
   return [created[0] ?? {}, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 updateVitals = async (
  client: OpenEMRClient,
  patientId: string,
  encounterId: string,
  vitalId: string,
  input: RecordVitalsInput,
 ): Promise<Result<StandardResource>> => {
  try {
   const [pid, pe] = await resolvePatientPid(client, patientId);
   if (pe || !pid) {
    return [null, pe];
   }
   const updated = await client.standardPut<StandardResource>(
    `/api/patient/${pid}/encounter/${encounterId}/vital/${vitalId}`,
    buildVitalsPayload(input),
   );
   return [updated[0] ?? {}, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 createCondition = (
  client: OpenEMRClient,
  patientId: string,
  input: ConditionInput,
 ): Promise<Result<StandardResource>> =>
  this.writeStandard(
   client,
   "POST",
   `/api/patient/${patientId}/medical_problem`,
   buildConditionPayload(input),
  );

 updateCondition = (
  client: OpenEMRClient,
  patientId: string,
  itemId: string,
  input: ConditionInput,
 ): Promise<Result<StandardResource>> =>
  this.writeStandard(
   client,
   "PUT",
   `/api/patient/${patientId}/medical_problem/${itemId}`,
   buildConditionPayload(input),
  );

 deleteCondition = (
  client: OpenEMRClient,
  patientId: string,
  itemId: string,
 ): Promise<Result<StandardResource>> =>
  this.writeStandard(
   client,
   "DELETE",
   `/api/patient/${patientId}/medical_problem/${itemId}`,
  );

 createAllergy = (
  client: OpenEMRClient,
  patientId: string,
  input: AllergyInput,
 ): Promise<Result<StandardResource>> =>
  this.writeStandard(
   client,
   "POST",
   `/api/patient/${patientId}/allergy`,
   buildAllergyPayload(input),
  );

 updateAllergy = (
  client: OpenEMRClient,
  patientId: string,
  itemId: string,
  input: AllergyInput,
 ): Promise<Result<StandardResource>> =>
  this.writeStandard(
   client,
   "PUT",
   `/api/patient/${patientId}/allergy/${itemId}`,
   buildAllergyPayload(input),
  );

 deleteAllergy = (
  client: OpenEMRClient,
  patientId: string,
  itemId: string,
 ): Promise<Result<StandardResource>> =>
  this.writeStandard(
   client,
   "DELETE",
   `/api/patient/${patientId}/allergy/${itemId}`,
  );

 createMedication = async (
  client: OpenEMRClient,
  patientId: string,
  input: MedicationInput,
 ): Promise<Result<StandardResource>> => {
  const [pid, pe] = await resolvePatientPid(client, patientId);
  if (pe || !pid) return [null, pe];
  return this.writeStandard(
   client,
   "POST",
   `/api/patient/${pid}/medication`,
   buildMedicationPayload(input),
  );
 };

 updateMedication = async (
  client: OpenEMRClient,
  patientId: string,
  itemId: string,
  input: MedicationInput,
 ): Promise<Result<StandardResource>> => {
  const [pid, pe] = await resolvePatientPid(client, patientId);
  if (pe || !pid) return [null, pe];
  return this.writeStandard(
   client,
   "PUT",
   `/api/patient/${pid}/medication/${itemId}`,
   buildMedicationPayload(input),
  );
 };

 deleteMedication = async (
  client: OpenEMRClient,
  patientId: string,
  itemId: string,
 ): Promise<Result<StandardResource>> => {
  const [pid, pe] = await resolvePatientPid(client, patientId);
  if (pe || !pid) return [null, pe];
  return this.writeStandard(
   client,
   "DELETE",
   `/api/patient/${pid}/medication/${itemId}`,
  );
 };

 createSoapNote = async (
  client: OpenEMRClient,
  patientId: string,
  encounterId: string,
  input: SoapNoteInput,
 ): Promise<Result<StandardResource>> => {
  const [pid, pe] = await resolvePatientPid(client, patientId);
  if (pe || !pid) return [null, pe];
  return this.writeStandard(
   client,
   "POST",
   `/api/patient/${pid}/encounter/${encounterId}/soap_note`,
   input,
  );
 };

 updateSoapNote = async (
  client: OpenEMRClient,
  patientId: string,
  encounterId: string,
  noteId: string,
  input: SoapNoteInput,
 ): Promise<Result<StandardResource>> => {
  const [pid, pe] = await resolvePatientPid(client, patientId);
  if (pe || !pid) return [null, pe];
  return this.writeStandard(
   client,
   "PUT",
   `/api/patient/${pid}/encounter/${encounterId}/soap_note/${noteId}`,
   input,
  );
 };

 /** Runs a Standard write and normalizes the first unwrapped record. */
 private writeStandard = async (
  client: OpenEMRClient,
  method: "POST" | "PUT" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
 ): Promise<Result<StandardResource>> => {
  try {
   const result =
    method === "POST"
     ? await client.standardPost<StandardResource>(path, body ?? {})
     : method === "PUT"
      ? await client.standardPut<StandardResource>(path, body ?? {})
      : await client.standardDelete<StandardResource>(path);
   return [result[0] ?? {}, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };
}

export default new EmrService();
