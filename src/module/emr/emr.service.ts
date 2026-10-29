/** @format */

import { getOpenEMRClient } from "@openemr/context.ts";

import { z } from "zod";
import {
 type MappedClinical,
 type MappedEncounter,
 type MappedProvider,
} from "@shared/utils/fhir-mapper.ts";
import {
 buildAllergyPayload,
 buildConditionPayload,
 buildEncounterPayload,
 buildMedicationPayload,
 buildObservationPayload,
 buildVitalsPayload,
 findEmrAuthorsByPatient,
 getObservationResource,
 listObservations,
 searchClinical,
 searchObservations,
} from "@module/emr/helper.ts";
import type { FhirEncounter } from "@shared/types/fhir.ts";
import type { ListResult, Result } from "@shared/types.ts";
import APIError from "@error/APIError.ts";
import AppError from "@error/app-error.ts";
import HttpStatus from "@enum/http.ts";
import { toError } from "@shared/error/error.ts";
import { resolveEncounterEid } from "@module/patient/helper.ts";

const clinicalKindSchema = z.enum([
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

export const encounterBodySchema = z
 .object({
  date: z.string().optional(),
  reason: z.string().optional(),
  categoryId: z.string().optional(),
  facilityId: z.string().optional(),
  billingFacility: z.string().optional(),
  providerId: z.string().optional(),
  classCode: z.string().optional(),
  sensitivity: z.string().optional(),
 })
 .refine((v) => Object.values(v).some((x) => x !== undefined), {
  message: "At least one field must be provided",
 });
export type CreateEncounterInput = z.infer<typeof encounterBodySchema>;

const vitalMeasurementKeys = [
 "systolic",
 "diastolic",
 "weightKg",
 "heightCm",
 "temperatureC",
 "pulse",
 "respiration",
 "oxygenSaturation",
 "waistCircumference",
 "headCircumference",
] as const;

export const vitalsBodySchema = z
 .object({
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
 })
 .refine((v) => vitalMeasurementKeys.some((key) => v[key] !== undefined), {
  message: "At least one vital measurement is required",
 });
export type RecordVitalsInput = z.infer<typeof vitalsBodySchema>;

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

export const observationBodySchema = z.object({
 encounterId: z.string().min(1),
 category: z.string().optional(),
 code: z.string().min(1),
 codeType: z.string().optional(),
 description: z.string().min(1),
 value: z.string().optional(),
 unit: z.string().optional(),
 status: z.string().optional(),
 type: z.string().optional(),
 date: z.string().optional(),
 endDate: z.string().optional(),
 note: z.string().optional(),
});
export type ObservationInput = z.infer<typeof observationBodySchema>;

export const observationUpdateSchema = observationBodySchema.partial();

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

export const emrObservationParamSchema = emrPatientParamSchema.extend({
 observationId: z.string().min(1),
});
export type EmrObservationParam = z.infer<typeof emrObservationParamSchema>;

export type StandardResource = Record<string, unknown>;

type SoapNote = StandardResource & {
 provider?: MappedProvider;
 authoredAt?: string;
};

export type ClinicalItem = MappedClinical | MappedEncounter;

export type ClinicalSearchResult = ListResult<ClinicalItem> & {
 kind: ClinicalKind;
};

export interface ObservationValue {
 value?: number | string | boolean;
 unit?: string;
}

interface ObservationReferenceRange {
 low?: number;
 high?: number;
 unit?: string;
 text?: string;
}

export interface ObservationItem {
 id?: string;
 code?: string;
 category: string[];
 effective?: string;
 value?: ObservationValue;
 referenceRange?: ObservationReferenceRange[];
 components?: Array<{ code?: string; value?: ObservationValue }>;
 encounterId?: string;
 provider?: MappedProvider;
 authoredAt?: string;
}

export type ObservationResult = ListResult<ObservationItem>;

export interface EmrObservation {
 id?: string;
 patientId?: string;
 encounterId?: string;
 category?: string;
 code?: string;
 codeType?: string;
 description?: string;
 value?: string;
 unit?: string;
 status?: string;
 type?: string;
 date?: string;
 endDate?: string;
 note?: string;
 provider?: MappedProvider;
 authoredAt?: string;
}

export type EmrObservationList = ListResult<EmrObservation>;

interface LastAttended {
 encounterId?: string;
 date?: string;
 provider?: MappedProvider;
 authoredAt?: string;
}

interface ClinicalSummary {
 patientId: string;
 conditions: ClinicalSearchResult;
 allergies: ClinicalSearchResult;
 medications: ClinicalSearchResult;
 immunizations: ClinicalSearchResult;
 procedures: ClinicalSearchResult;
 encounters: ClinicalSearchResult;
 vitals: ObservationResult;
 labs: ObservationResult;
 lastAttended?: LastAttended;
}

function latestEncounter(items: ClinicalItem[]): MappedEncounter | undefined {
 let latest: MappedEncounter | undefined;
 for (const item of items) {
  if (!("start" in item) || !item.start) continue;
  if (!latest?.start || item.start > latest.start) {
   latest = item;
   continue;
  }
  if (
   item.start === latest.start &&
   (item.authoredAt ?? "") > (latest.authoredAt ?? "")
  ) {
   latest = item;
  }
 }
 return latest;
}

const EMR_UUID_RE =
 /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function patientRef(patientId: string): Record<string, string> {
 return EMR_UUID_RE.test(patientId)
  ? { patient_uuid: patientId }
  : { patient_id: patientId };
}

class EmrService {
 summary = async (
  patientId: string,
 ): Promise<Result<ClinicalSummary>> => {
  const authors = await findEmrAuthorsByPatient(patientId);
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
   searchClinical( "conditions", patientId, authors),
   searchClinical( "allergies", patientId, authors),
   searchClinical( "medications", patientId, authors),
   searchClinical( "immunizations", patientId, authors),
   searchClinical( "procedures", patientId, authors),
   searchClinical( "encounters", patientId, authors),
   searchObservations( patientId, "vital-signs", authors),
   searchObservations( patientId, "laboratory", authors),
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

  const last = latestEncounter((encounters[0] as ClinicalSearchResult).items);

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
    lastAttended: last
     ? {
        encounterId: last.id,
        date: last.start,
        provider: last.provider,
        authoredAt: last.authoredAt,
       }
     : undefined,
   },
   null,
  ];
 };

 clinical = (
  patientId: string,
  kind: ClinicalKind,
 ): Promise<Result<ClinicalSearchResult>> =>
  {
  return searchClinical( kind, patientId);
 };

 observations = (
  patientId: string,
  category?: string,
 ): Promise<Result<EmrObservationList>> =>
  {
  return listObservations( patientId, category);
 };

 observation = (
  patientId: string,
  observationId: string,
 ): Promise<Result<EmrObservation>> =>
  {
  return getObservationResource( patientId, observationId);
 };

 vitalObservations = (
  patientId: string,
 ): Promise<Result<ObservationResult>> =>
  {
  return searchObservations( patientId, "vital-signs");
 };

 createObservation = async (
  patientId: string,
  input: ObservationInput,
 ): Promise<Result<StandardResource>> => {
  const client = getOpenEMRClient();
  try {
   const created = await client.standardPost<StandardResource>(
    "/api/observation",
    { ...buildObservationPayload(input), ...patientRef(patientId) },
   );
   return [created[0] ?? {}, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 updateObservation = async (
  observationId: string,
  input: Partial<ObservationInput>,
 ): Promise<Result<StandardResource>> => {
  const client = getOpenEMRClient();
  try {
   const updated = await client.standardPut<StandardResource>(
    `/api/observation/${observationId}`,
    buildObservationPayload(input),
   );
   return [updated[0] ?? {}, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 deleteObservation = async (
  patientId: string,
  observationId: string,
 ): Promise<Result<StandardResource>> => {
  const client = getOpenEMRClient();
  try {
   const deleted = await client.standardDelete<StandardResource>(
    `/api/observation/${observationId}`,
    { ...patientRef(patientId) },
   );
   return [deleted[0] ?? {}, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 encounter = async (
  patientId: string,
  encounterId: string,
 ): Promise<Result<FhirEncounter>> => {
  const client = getOpenEMRClient();
  try {
   const bundle = await client.fhirSearch("Encounter", {
    patient: patientId,
    _id: encounterId,
   });
   const encounter = (bundle.entry ?? [])
    .map((entry) => entry.resource as FhirEncounter)
    .find((resource) => resource?.id === encounterId);
   if (!encounter) return [null, APIError.notFound("Encounter not found")];
   return [encounter, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 createEncounter = async (
  patientId: string,
  input: CreateEncounterInput,
 ): Promise<Result<StandardResource>> => {
  const client = getOpenEMRClient();
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
  patientId: string,
  encounterId: string,
  input: RecordVitalsInput,
 ): Promise<Result<StandardResource>> => {
  const client = getOpenEMRClient();
  try {
   const [eid, ee] = await resolveEncounterEid(
    patientId,
    encounterId,
   );
   if (ee || !eid) return [null, ee];
   const created = await client.standardPost<StandardResource>(
    `/api/patient/${patientId}/encounter/${eid}/vital`,
    buildVitalsPayload(input),
   );
   return [created[0] ?? {}, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 updateVitals = async (
  patientId: string,
  encounterId: string,
  vitalId: string,
  input: RecordVitalsInput,
 ): Promise<Result<StandardResource>> => {
  const client = getOpenEMRClient();
  try {
   const [eid, ee] = await resolveEncounterEid(
    patientId,
    encounterId,
   );
   if (ee || !eid) return [null, ee];
   const updated = await client.standardPut<StandardResource>(
    `/api/patient/${patientId}/encounter/${eid}/vital/${vitalId}`,
    buildVitalsPayload(input),
   );
   return [updated[0] ?? {}, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 createCondition = (
  patientId: string,
  input: ConditionInput,
 ): Promise<Result<StandardResource>> =>
  {
  return this.writeStandard(
   "POST",
   `/api/patient/${patientId}/medical_problem`,
   buildConditionPayload(input),
  );
 };

 updateCondition = (
  patientId: string,
  itemId: string,
  input: ConditionInput,
 ): Promise<Result<StandardResource>> =>
  {
  return this.writeStandard(
   "PUT",
   `/api/patient/${patientId}/medical_problem/${itemId}`,
   buildConditionPayload(input),
  );
 };

 deleteCondition = (
  patientId: string,
  itemId: string,
 ): Promise<Result<StandardResource>> =>
  {
  return this.writeStandard(
   "DELETE",
   `/api/patient/${patientId}/medical_problem/${itemId}`,
  );
 };

 createAllergy = (
  patientId: string,
  input: AllergyInput,
 ): Promise<Result<StandardResource>> =>
  {
  return this.writeStandard(
   "POST",
   `/api/patient/${patientId}/allergy`,
   buildAllergyPayload(input),
  );
 };

 updateAllergy = (
  patientId: string,
  itemId: string,
  input: AllergyInput,
 ): Promise<Result<StandardResource>> =>
  {
  return this.writeStandard(
   "PUT",
   `/api/patient/${patientId}/allergy/${itemId}`,
   buildAllergyPayload(input),
  );
 };

 deleteAllergy = (
  patientId: string,
  itemId: string,
 ): Promise<Result<StandardResource>> =>
  {
  return this.writeStandard(
   "DELETE",
   `/api/patient/${patientId}/allergy/${itemId}`,
  );
 };

 createMedication = async (
  patientId: string,
  input: MedicationInput,
 ): Promise<Result<StandardResource>> => {
  const pid = patientId;
  const [created, err] = await this.writeStandard(
   "POST",
   `/api/patient/${pid}/medication`,
   buildMedicationPayload(input),
  );
  if (err) return [null, err];
  const record = created ?? {};
  if (record.id !== undefined) {
   const uuid = await this.findMedicationUuid( pid, record.id);
   if (uuid) return [{ ...record, uuid }, null];
  }
  return [record, null];
 };

 updateMedication = async (
  patientId: string,
  itemId: string,
  input: MedicationInput,
 ): Promise<Result<StandardResource>> => {
  const pid = patientId;
  return this.writeStandard(
   "PUT",
   `/api/patient/${pid}/medication/${itemId}`,
   buildMedicationPayload(input),
  );
 };

 deleteMedication = async (
  patientId: string,
  itemId: string,
 ): Promise<Result<StandardResource>> => {
  const pid = patientId;
  return this.writeStandard(
   "DELETE",
   `/api/patient/${pid}/medication/${itemId}`,
  );
 };

 createSoapNote = async (
  patientId: string,
  encounterId: string,
  input: SoapNoteInput,
 ): Promise<Result<StandardResource>> => {
  const [eid, ee] = await resolveEncounterEid(
   patientId,
   encounterId,
  );
  if (ee || !eid) return [null, ee];
  return this.writeStandard(
   "POST",
   `/api/patient/${patientId}/encounter/${eid}/soap_note`,
   input,
  );
 };

 updateSoapNote = async (
  patientId: string,
  encounterId: string,
  noteId: string,
  input: SoapNoteInput,
 ): Promise<Result<StandardResource>> => {
  const [eid, ee] = await resolveEncounterEid(
   patientId,
   encounterId,
  );
  if (ee || !eid) return [null, ee];
  return this.writeStandard(
   "PUT",
   `/api/patient/${patientId}/encounter/${eid}/soap_note/${noteId}`,
   input,
  );
 };

 soapNotes = async (
  patientId: string,
  encounterId: string,
 ): Promise<Result<SoapNote[]>> => {
  const [eid, ee] = await resolveEncounterEid(
   patientId,
   encounterId,
  );
  if (ee || !eid) return [null, ee];
  try {
   const notes = await this.standardGetOptional<StandardResource>(
    `/api/patient/${patientId}/encounter/${eid}/soap_note`,
   );
   const authors = await findEmrAuthorsByPatient(patientId);
   return [
    notes.map((note) => {
     const author =
      note.id !== undefined
       ? authors.get(`soap_note:${String(note.id)}`)
       : undefined;
     return author
      ? { ...note, provider: author.provider, authoredAt: author.authoredAt }
      : note;
    }),
    null,
   ];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 soapNote = async (
  patientId: string,
  encounterId: string,
  noteId: string,
 ): Promise<Result<SoapNote>> => {
  const [eid, ee] = await resolveEncounterEid(
   patientId,
   encounterId,
  );
  if (ee || !eid) return [null, ee];
  try {
   const notes = await this.standardGetOptional<StandardResource>(
    `/api/patient/${patientId}/encounter/${eid}/soap_note/${noteId}`,
   );
   const note = notes[0];
   if (!note) return [{}, null];
   const authors = await findEmrAuthorsByPatient(patientId);
   const author = authors.get(`soap_note:${noteId}`);
   return [
    author
     ? { ...note, provider: author.provider, authoredAt: author.authoredAt }
     : note,
    null,
   ];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 private standardGetOptional = async <T>(
  path: string,
 ): Promise<T[]> => {
  const client = getOpenEMRClient();
  try {
   return await client.standardGet<T>(path);
  } catch (e) {
   if (e instanceof AppError && e.statusCode === HttpStatus.NOT_FOUND) {
    return [];
   }
   throw e;
  }
 };

 private findMedicationUuid = async (
  pid: string,
  listId: unknown,
 ): Promise<string | undefined> => {
  const client = getOpenEMRClient();
  try {
   await client.standardGet(`/api/patient/${pid}/medical_problem`);
   const meds = await client.standardGet<StandardResource>(
    `/api/patient/${pid}/medication`,
   );
   const match = meds.find((m) => String(m.id) === String(listId));
   return typeof match?.uuid === "string" ? match.uuid : undefined;
  } catch {
   return undefined;
  }
 };

 private writeStandard = async (
  method: "POST" | "PUT" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
 ): Promise<Result<StandardResource>> => {
  const client = getOpenEMRClient();
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
