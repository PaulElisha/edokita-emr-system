import APIError from "@error/APIError.ts";
import type OpenEMRClient from "@module/openemr/client.ts";
import type { CreatePatientInput } from "@module/patient/patient.service.ts";
import type { FhirPatient } from "@shared/types/fhir.ts";
import type { Result } from "@shared/types.ts";
import { toError } from "@shared/error/error.ts";
import { buildContactPoints, buildHumanName } from "@shared/utils/fhir.ts";
import { findUserById } from "@module/user/helper.ts";
import type { RequestActor } from "@module/auth/helper.ts";

const PID_SYSTEM = "http://terminology.hl7.org/CodeSystem/v2-0203";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export async function resolveEncounterEid(
 client: OpenEMRClient,
 patientId: string,
 encounterUuid: string,
): Promise<Result<string>> {
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

export async function resolveOwnPatientId(
 userId: string,
): Promise<Result<string>> {
 const [user, err] = await findUserById(userId);
 if (err || !user) return [null, err];
 const patientId = user.openemr.patientId;
 if (!patientId) {
  return [
   null,
   APIError.badRequest("Your account is not linked to an OpenEMR patient record"),
  ];
 }
 return [patientId, null];
}

export async function resolvePatientScope(
 actor: RequestActor,
 requested?: string,
): Promise<Result<string>> {
 if (actor.role === "patient") return resolveOwnPatientId(actor.userId);
 if (!requested) return [null, APIError.badRequest("patientId is required")];
 return [requested, null];
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
