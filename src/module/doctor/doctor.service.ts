/** @format */

import { getOpenEMRClient } from "@openemr/context.ts";

import {
 mapPatient,
 mapPractitioner,
 type MappedPractitioner,
} from "@shared/utils/fhir-mapper.ts";
import {
 createdResourceId,
 type OpenEMRCreateResult,
 type QueryValue,
} from "../../config/openemr-client/client.ts";
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
import { chunk } from "@shared/utils/array.ts";
import { z } from "zod";

const PATIENT_ID_CHUNK = 50;

export const doctorListQuerySchema = fhirListQuerySchema.extend({
 active: z.enum(["true", "false"]).optional(),
});
export type DoctorListQuery = z.infer<typeof doctorListQuerySchema>;

const doctorAddressSchema = z.object({
 street: z.string().optional(),
 street2: z.string().optional(),
 city: z.string().optional(),
 state: z.string().optional(),
 zip: z.string().optional(),
 country: z.string().optional(),
});

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

type DoctorListResult = ListResult<MappedPractitioner>;

class DoctorService {
 list = async (
  query: DoctorListQuery,
 ): Promise<Result<DoctorListResult>> => {
  const client = getOpenEMRClient();
  try {
   const params: Record<string, QueryValue> = {
    _count: query._count,
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
  id: string,
 ): Promise<Result<MappedPractitioner>> => {
  const client = getOpenEMRClient();
  try {
   const doctor = await client.fhirRead<FhirPractitioner>("Practitioner", id);
   const profiles = await fetchPractitionerProfiles();
   return [applyPractitionerProfile(mapPractitioner(doctor), profiles), null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 create = async (
  input: CreateDoctorInput,
 ): Promise<Result<MappedPractitioner>> => {
  const client = getOpenEMRClient();
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
  id: string,
  input: CreateDoctorInput,
 ): Promise<Result<MappedPractitioner>> => {
  const client = getOpenEMRClient();
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
  userId: string,
 ): Promise<Result<PatientListResult>> => {
  const client = getOpenEMRClient();
  try {
   const [ids, err] = await findConnectedPatientIds( userId);
   if (err || !ids) return [null, err];
   if (ids.length === 0) return [{ total: 0, items: [] }, null];

   const bundles = await Promise.all(
    chunk(ids, PATIENT_ID_CHUNK).map((group) =>
     client.fhirSearch("Patient", {
      _id: group.join(","),
      _count: group.length,
     }),
    ),
   );
   const items = bundles
    .flatMap((bundle) => bundle.entry ?? [])
    .map((e) => e.resource as FhirPatient)
    .filter((r) => r?.resourceType === "Patient")
    .map(mapPatient);
   return [{ total: items.length, items }, null];
  } catch (e) {
   return [null, toError(e, "myPatients")];
  }
 };
}

export default new DoctorService();
