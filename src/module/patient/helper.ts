/** @format */
import APIError from "@error/APIError.ts";
import type OpenEMRClient from "@module/openemr/client.ts";
import type { CreatePatientInput } from "@module/patient/patient.service.ts";
import type { FhirPatient } from "@shared/types/fhir.ts";
import type { Result } from "@shared/types.ts";
import { toError } from "@shared/error/error.ts";
import { buildContactPoints, buildHumanName } from "@shared/utils/fhir.ts";

/** OpenEMR stores the numeric `pid` as an official FHIR Patient identifier. */
const PID_SYSTEM = "http://terminology.hl7.org/CodeSystem/v2-0203";

/**
 * OpenEMR's Standard API keys most patient sub-routes off the numeric `pid`, while FHIR
 * (and our API) use the Patient uuid. Resolve one from the other via the FHIR Patient.
 */
export async function resolvePatientPid(
 client: OpenEMRClient,
 patientUuid: string,
): Promise<Result<string>> {
 try {
  if (/^\d+$/.test(patientUuid)) return [patientUuid, null];
  const patient = await client.fhirRead<FhirPatient>("Patient", patientUuid);
  const pid = patient.identifier?.find((i) => i.system === PID_SYSTEM)?.value;
  if (!pid) {
   return [null, APIError.badRequest("Could not resolve the patient's EMR id")];
  }
  return [pid, null];
 } catch (e) {
  return [null, toError(e)];
 }
}

export const GENDER_MAP: Record<string, string> = {
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
