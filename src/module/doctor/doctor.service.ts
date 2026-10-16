/** @format */
import {
 mapPatient,
 mapPractitioner,
 type MappedPractitioner,
} from "@shared/utils/fhir-mapper.ts";
import {
 createdResourceId,
 type OpenEMRCreateResult,
 type QueryValue,
} from "@module/openemr/client.ts";
import type OpenEMRClient from "@module/openemr/client.ts";
import APIError from "@error/APIError.ts";
import {
 applyPractitionerProfile,
 buildDoctorResource,
 fetchPractitionerProfiles,
} from "@module/doctor/helper.ts";
import {
 contactSchema,
 fhirListQuerySchema,
 nameSchema,
} from "@shared/schemas/common.ts";
import type { FhirPatient, FhirPractitioner } from "@shared/types/fhir.ts";
import type { ListResult, Result } from "@shared/types.ts";
import { toError } from "@shared/error/error.ts";
import { findConnectedPatientIds } from "@module/doctor/helper.ts";
import type { PatientListResult } from "@module/patient/patient.service.ts";
import { z } from "zod";

export const doctorListQuerySchema = fhirListQuerySchema.extend({
 active: z.enum(["true", "false"]).optional(),
});
export type DoctorListQuery = z.infer<typeof doctorListQuerySchema>;

export const doctorAddressSchema = z.object({
 street: z.string().optional(),
 street2: z.string().optional(),
 city: z.string().optional(),
 state: z.string().optional(),
 zip: z.string().optional(),
 country: z.string().optional(),
});
export type DoctorAddressInput = z.infer<typeof doctorAddressSchema>;

export const doctorBodySchema = nameSchema.merge(contactSchema).extend({
 suffix: z.string().optional(),
 title: z.string().optional(),
 specialty: z.string().optional(),
 physicianType: z.string().optional(),
 npi: z.string().optional(),
 stateLicenseNumber: z.string().optional(),
 federalTaxId: z.string().optional(),
 mobile: z.string().optional(),
 homePhone: z.string().optional(),
 fax: z.string().optional(),
 address: doctorAddressSchema.optional(),
 active: z.boolean().optional(),
});
export type CreateDoctorInput = z.infer<typeof doctorBodySchema>;

export type DoctorListResult = ListResult<MappedPractitioner>;

class DoctorService {
 list = async (
  client: OpenEMRClient,
  query: DoctorListQuery,
 ): Promise<Result<DoctorListResult>> => {
  try {
   const params: Record<string, QueryValue> = {
    _count: query._count ?? 100,
   };
   if (query.family) params.family = query.family;
   if (query.given) params.given = query.given;
   if (query.active !== undefined) params.active = query.active === "true";
   if (query.search) params._content = query.search;

   const bundle = await client.fhirSearch("Practitioner", params);
   const profiles = await fetchPractitionerProfiles();
   const items = (bundle.entry ?? [])
    .map((e) => e.resource as FhirPractitioner)
    .filter((r) => r?.resourceType === "Practitioner")
    .map(mapPractitioner)
    .map((p) => applyPractitionerProfile(p, profiles));

   return [{ total: bundle.total ?? items.length, items }, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 get = async (
  client: OpenEMRClient,
  id: string,
 ): Promise<Result<MappedPractitioner>> => {
  try {
   const doctor = await client.fhirRead<FhirPractitioner>("Practitioner", id);
   const profiles = await fetchPractitionerProfiles();
   return [applyPractitionerProfile(mapPractitioner(doctor), profiles), null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 create = async (
  client: OpenEMRClient,
  input: CreateDoctorInput,
 ): Promise<Result<MappedPractitioner>> => {
  try {
   const created = await client.fhirCreate<
    FhirPractitioner | OpenEMRCreateResult
   >("Practitioner", buildDoctorResource(input));
   const profiles = await fetchPractitionerProfiles();
   if ("resourceType" in created) {
    return [applyPractitionerProfile(mapPractitioner(created), profiles), null];
   }

   const id = createdResourceId(created);
   if (!id) {
    return [null, APIError.openEmr("OpenEMR did not return a practitioner id")];
   }
   const practitioner = await client.fhirRead<FhirPractitioner>(
    "Practitioner",
    id,
   );
   return [
    applyPractitionerProfile(mapPractitioner(practitioner), profiles),
    null,
   ];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 update = async (
  client: OpenEMRClient,
  id: string,
  input: CreateDoctorInput,
 ): Promise<Result<MappedPractitioner>> => {
  try {
   const updated = await client.fhirUpdate<FhirPractitioner>(
    "Practitioner",
    id,
    buildDoctorResource(input),
   );
   const profiles = await fetchPractitionerProfiles();
   return [applyPractitionerProfile(mapPractitioner(updated), profiles), null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 myPatients = async (
  client: OpenEMRClient,
  userId: string,
 ): Promise<Result<PatientListResult>> => {
  try {
   const [ids, err] = await findConnectedPatientIds(client, userId);
   if (err || !ids) return [null, err];
   const patients = await Promise.all(
    ids.map((id) => client.fhirRead<FhirPatient>("Patient", id)),
   );
   const items = patients.map(mapPatient);
   return [{ total: items.length, items }, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };
}

export default new DoctorService();
