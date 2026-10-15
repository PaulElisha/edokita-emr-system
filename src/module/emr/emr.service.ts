/** @format */
import { z } from "zod";
import {
 type MappedClinical,
 type MappedEncounter,
} from "@shared/utils/fhir-mapper.ts";
import type OpenEMRClient from "@module/openemr/client.ts";
import {
 buildEncounterPayload,
 buildVitalsPayload,
 searchClinical,
 searchObservations,
} from "@module/emr/helper.ts";
import type { FhirEncounter } from "@shared/types/fhir.ts";
import type { ListResult, Result } from "@shared/types.ts";
import { toError } from "@shared/error/error.ts";

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
   const created = await client.standardPost<StandardResource>(
    `/api/patient/${patientId}/encounter/${encounterId}/vital`,
    buildVitalsPayload(input),
   );
   return [created[0] ?? {}, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };
}

export default new EmrService();
