/** @format */
import { z } from "zod";
import {
 type MappedClinical,
 type MappedEncounter,
 type MappedProvider,
} from "@shared/utils/fhir-mapper.ts";
import type OpenEMRClient from "@module/openemr/client.ts";
import {
 buildAllergyPayload,
 buildConditionPayload,
 buildEncounterPayload,
 buildMedicationPayload,
 buildVitalsPayload,
 findEmrAuthorsByPatient,
 searchClinical,
 searchObservations,
} from "@module/emr/helper.ts";
import type { FhirEncounter } from "@shared/types/fhir.ts";
import type { ListResult, Result } from "@shared/types.ts";
import APIError from "@error/APIError.ts";
import { toError } from "@shared/error/error.ts";
import {
 resolveEncounterEid,
 resolvePatientPid,
} from "@module/patient/helper.ts";

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

/** A SOAP note with our recorded author attached on read. */
export type SoapNote = StandardResource & {
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

export interface ObservationItem {
 id?: string;
 code?: string;
 category: string[];
 effective?: string;
 value?: ObservationValue;
 components?: Array<{ code?: string; value?: ObservationValue }>;
 encounterId?: string;
 /** Clinician who recorded this observation (resolved via its encounter). */
 provider?: MappedProvider;
 authoredAt?: string;
}

export type ObservationResult = ListResult<ObservationItem>;

/** Who last attended the patient and when (derived from encounters). */
export interface LastAttended {
 encounterId?: string;
 date?: string;
 provider?: MappedProvider;
 authoredAt?: string;
}

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
 lastAttended?: LastAttended;
}

/** The encounter with the latest clinical date (drives "last attended"). */
function latestEncounter(items: ClinicalItem[]): MappedEncounter | undefined {
 let latest: MappedEncounter | undefined;
 for (const item of items) {
  if (!("start" in item) || !item.start) continue;
  if (!latest?.start || item.start > latest.start) {
   latest = item;
   continue;
  }
  // Encounter dates are day-level; break ties by when we recorded them.
  if (
   item.start === latest.start &&
   (item.authoredAt ?? "") > (latest.authoredAt ?? "")
  ) {
   latest = item;
  }
 }
 return latest;
}

class EmrService {
 summary = async (
  client: OpenEMRClient,
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
   searchClinical(client, "conditions", patientId, authors),
   searchClinical(client, "allergies", patientId, authors),
   searchClinical(client, "medications", patientId, authors),
   searchClinical(client, "immunizations", patientId, authors),
   searchClinical(client, "procedures", patientId, authors),
   searchClinical(client, "encounters", patientId, authors),
   searchObservations(client, patientId, "vital-signs", authors),
   searchObservations(client, patientId, "laboratory", authors),
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
  patientId: string,
  encounterId: string,
 ): Promise<Result<FhirEncounter>> => {
  try {
   // OpenEMR denies a bare FHIR `Encounter/{id}` read ("Organization policy
   // does not have permit access resource"); a patient-scoped search is
   // allowed, so resolve the encounter that way.
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
   const [eid, ee] = await resolveEncounterEid(client, patientId, encounterId);
   if (ee || !eid) return [null, ee];
   const created = await client.standardPost<StandardResource>(
    `/api/patient/${pid}/encounter/${eid}/vital`,
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
   const [eid, ee] = await resolveEncounterEid(client, patientId, encounterId);
   if (ee || !eid) return [null, ee];
   const updated = await client.standardPut<StandardResource>(
    `/api/patient/${pid}/encounter/${eid}/vital/${vitalId}`,
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
  const [created, err] = await this.writeStandard(
   client,
   "POST",
   `/api/patient/${pid}/medication`,
   buildMedicationPayload(input),
  );
  if (err) return [null, err];
  const record = created ?? {};
  // OpenEMR's create returns only the numeric list id; resolve the uuid our
  // reads (and attribution) key on.
  if (record.id !== undefined) {
   const uuid = await this.findMedicationUuid(client, pid, record.id);
   if (uuid) return [{ ...record, uuid }, null];
  }
  return [record, null];
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

 soapNotes = async (
  client: OpenEMRClient,
  patientId: string,
  encounterId: string,
 ): Promise<Result<SoapNote[]>> => {
  const [pid, pe] = await resolvePatientPid(client, patientId);
  if (pe || !pid) return [null, pe];
  try {
   const notes = await client.standardGet<StandardResource>(
    `/api/patient/${pid}/encounter/${encounterId}/soap_note`,
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
  client: OpenEMRClient,
  patientId: string,
  encounterId: string,
  noteId: string,
 ): Promise<Result<SoapNote>> => {
  const [pid, pe] = await resolvePatientPid(client, patientId);
  if (pe || !pid) return [null, pe];
  try {
   const notes = await client.standardGet<StandardResource>(
    `/api/patient/${pid}/encounter/${encounterId}/soap_note/${noteId}`,
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

 /** Resolves a medication's uuid from its numeric OpenEMR list id. */
 private findMedicationUuid = async (
  client: OpenEMRClient,
  pid: string,
  listId: unknown,
 ): Promise<string | undefined> => {
  try {
   // OpenEMR assigns `lists.uuid` lazily: any PatientIssues-service read
   // backfills missing uuids. Touch medical_problem to force it, otherwise the
   // medication list endpoint fails on the still-null uuid.
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
