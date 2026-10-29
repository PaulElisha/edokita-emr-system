/** @format */

import { getOpenEMRClient } from "@openemr/context.ts";

import APIError from "@error/APIError.ts";
import type { CreatePatientInput } from "@module/patient/patient.service.ts";
import type { Result } from "@shared/types.ts";
import { toError } from "@shared/error/error.ts";
import { buildContactPoints, buildHumanName } from "@shared/utils/fhir.ts";

const UUID_RE =
 /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function resolveEncounterEid(
 patientId: string,
 encounterUuid: string,
): Promise<Result<string>> {
 const client = getOpenEMRClient();
 try {
  if (/^\d+$/.test(encounterUuid)) return [encounterUuid, null];
  if (!UUID_RE.test(encounterUuid)) return [encounterUuid, null];
  const encounters = await client.standardGet<Record<string, unknown>>(
   `/api/patient/${patientId}/encounter`,
  );
  const match = encounters.find((e) => e.euuid === encounterUuid);
  const eid = match?.eid;
  if (eid === undefined || eid === null) {
   return [
    null,
    APIError.badRequest("Could not resolve the encounter's EMR id"),
   ];
  }
  return [String(eid), null];
 } catch (e) {
  return [null, toError(e)];
 }
}

const GENDER_MAP: Record<string, string> = {
 male: "male",
 m: "male",
 M: "male",
 "1": "male",
 female: "female",
 f: "female",
 F: "female",
 "2": "female",
 other: "other",
 unknown: "unknown",
};

export function buildPatientResource(
 input: CreatePatientInput,
): Record<string, unknown> {
 const resource: Record<string, unknown> = {
  resourceType: "Patient",
  active: true,
  name: buildHumanName(input.fname, input.mname, input.lname),
  gender: GENDER_MAP[input.gender.toLowerCase()] ?? "unknown",
  birthDate: input.birthDate,
  telecom: buildContactPoints(input.email, input.phone, "home"),
 };

 if (
  input.street ||
  input.city ||
  input.state ||
  input.postalCode ||
  input.countryCode
 ) {
  resource.address = [
   {
    use: "home",
    line: input.street ? [input.street] : undefined,
    city: input.city,
    state: input.state,
    postalCode: input.postalCode,
    country: input.countryCode,
   },
  ];
 }

 return resource;
}
