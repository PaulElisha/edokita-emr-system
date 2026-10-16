/** @format */
import {
 calcAge,
 mapPatient,
 type MappedPatient,
} from "@shared/utils/fhir-mapper.ts";
import {
 createdResourceId,
 type OpenEMRCreateResult,
 type QueryValue,
} from "@module/openemr/client.ts";
import type OpenEMRClient from "@module/openemr/client.ts";
import APIError from "@error/APIError.ts";
import { buildPatientResource } from "@module/patient/helper.ts";
import {
 contactSchema,
 fhirListQuerySchema,
 genderSchema,
 nameSchema,
} from "@shared/schemas/common.ts";
import type { FhirPatient } from "@shared/types/fhir.ts";
import type { ListResult, Result } from "@shared/types.ts";
import { toError } from "@shared/error/error.ts";
import { z } from "zod";

export const patientListQuerySchema = fhirListQuerySchema.extend({
 gender: genderSchema.optional(),
});
export type PatientListQuery = z.infer<typeof patientListQuerySchema>;

export const patientBodySchema = nameSchema.merge(contactSchema).extend({
 birthDate: z.string().min(1),
 gender: genderSchema,
 address: z.string().optional(),
 street: z.string().optional(),
 city: z.string().optional(),
 state: z.string().optional(),
 postalCode: z.string().optional(),
 countryCode: z.string().optional(),
});
export type CreatePatientInput = z.infer<typeof patientBodySchema>;

export type PatientListResult = ListResult<MappedPatient>;

class PatientService {
 list = async (
  client: OpenEMRClient,
  query: PatientListQuery,
 ): Promise<Result<PatientListResult>> => {
  try {
   const params: Record<string, QueryValue> = {
    _count: query._count ?? 100,
   };
   if (query.family) params.family = query.family;
   if (query.given) params.given = query.given;
   if (query.gender) params.gender = query.gender;
   if (query.search) params._content = query.search;

   const bundle = await client.fhirSearch("Patient", params);
   let items = (bundle.entry ?? [])
    .map((e) => e.resource as FhirPatient)
    .filter((r) => r?.resourceType === "Patient")
    .map(mapPatient);

   return [{ total: bundle.total ?? items.length, items }, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 get = async (
  client: OpenEMRClient,
  id: string,
 ): Promise<Result<MappedPatient>> => {
  try {
   const patient = await client.fhirRead<FhirPatient>("Patient", id);
   return [mapPatient(patient), null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 create = async (
  client: OpenEMRClient,
  input: CreatePatientInput,
 ): Promise<Result<MappedPatient>> => {
  try {
   const created = await client.fhirCreate<FhirPatient | OpenEMRCreateResult>(
    "Patient",
    buildPatientResource(input),
   );
   if ("resourceType" in created) return [mapPatient(created), null];

   const id = createdResourceId(created);
   if (!id) {
    return [null, APIError.openEmr("OpenEMR did not return a patient id")];
   }
   const patient = await client.fhirRead<FhirPatient>("Patient", id);
   return [mapPatient(patient), null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 update = async (
  client: OpenEMRClient,
  id: string,
  input: CreatePatientInput,
 ): Promise<Result<MappedPatient>> => {
  try {
   const updated = await client.fhirUpdate<FhirPatient>(
    "Patient",
    id,
    buildPatientResource(input),
   );
   return [mapPatient(updated), null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 age = (birthDate: string): number => calcAge(birthDate);
}

export default new PatientService();
