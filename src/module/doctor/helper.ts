/** @format */
import type { CreateDoctorInput } from "@module/doctor/doctor.service.ts";
import { openemr } from "@module/openemr/client.ts";
import type OpenEMRClient from "@module/openemr/client.ts";
import {
 mapAppointment,
 type MappedPractitioner,
 type MappedQualification,
} from "@shared/utils/fhir-mapper.ts";
import { buildHumanName, buildTelecom, IDENTIFIER_SYSTEM } from "@shared/utils/fhir.ts";
import type { Result } from "@shared/types.ts";
import type { FhirAppointment } from "@shared/types/fhir.ts";
import { toError } from "@shared/error/error.ts";
import { findUserPractitionerId } from "@module/user/helper.ts";

const CONNECTED_PATIENT_APPOINTMENT_FETCH = 500;
interface UserProfileRecord {
 uuid?: string;
 specialty?: string | null;
 npi?: string | null;
}

/** Maps doctor input onto the FHIR `Practitioner` fields OpenEMR understands. */
export function buildDoctorResource(
 input: CreateDoctorInput,
): Record<string, unknown> {
 const identifier: Array<{ system: string; value: string }> = [];
 if (input.npi) identifier.push({ system: IDENTIFIER_SYSTEM.npi, value: input.npi });
 if (input.stateLicenseNumber) {
  identifier.push({
   system: IDENTIFIER_SYSTEM.stateLicense,
   value: input.stateLicenseNumber,
  });
 }

 const resource: Record<string, unknown> = {
  resourceType: "Practitioner",
  active: input.active ?? true,
  identifier,
  name: buildHumanName(input.fname, input.mname, input.lname, {
   prefix: input.title,
   suffix: input.suffix,
  }),
  telecom: buildTelecom({
   email: input.email || undefined,
   work: input.phone,
   home: input.homePhone,
   mobile: input.mobile,
   fax: input.fax,
  }),
 };

 if (input.address && Object.values(input.address).some(Boolean)) {
  const { street, street2, city, state, zip, country } = input.address;
  const line = [street, street2].filter((v): v is string => Boolean(v));
  resource.address = [
   {
    use: "work",
    ...(line.length > 0 ? { line } : {}),
    ...(city ? { city } : {}),
    ...(state ? { state } : {}),
    ...(zip ? { postalCode: zip } : {}),
    ...(country ? { country } : {}),
   },
  ];
 }

 const qualification: Array<Record<string, unknown>> = [];
 if (input.specialty) {
  qualification.push({ code: { text: input.specialty } });
 }
 if (input.physicianType) {
  qualification.push({
   code: { text: input.physicianType },
   identifier: [{ system: "physician_type", value: input.physicianType }],
  });
 }
 if (qualification.length > 0) resource.qualification = qualification;

 return resource;
}

/**
 * OpenEMR's FHIR `Practitioner` neither reads nor writes `qualification`; the
 * provider specialty lives in `users.specialty` and is only exposed by the
 * Standard user API. Keyed by practitioner uuid.
 */
export async function fetchPractitionerProfiles(): Promise<
 Map<string, MappedQualification>
> {
 const profiles = new Map<string, MappedQualification>();
 try {
  const users = await openemr.standardGet<UserProfileRecord>("/api/user");
  for (const user of users) {
   if (!user.uuid) continue;
   const specialty = user.specialty?.trim() || undefined;
   const npi = user.npi?.trim() || undefined;
   if (!specialty && !npi) continue;
   profiles.set(user.uuid, { specialty, npi });
  }
 } catch {
  return profiles;
 }
 return profiles;
}

export function applyPractitionerProfile(
 practitioner: MappedPractitioner,
 profiles: Map<string, MappedQualification>,
): MappedPractitioner {
 const profile = practitioner.id ? profiles.get(practitioner.id) : undefined;
 if (!profile) return practitioner;
 const specialty = profile.specialty ?? practitioner.specialty;
 const qualifications: MappedQualification[] =
  specialty || profile.npi
   ? [{ specialty, npi: profile.npi ?? practitioner.npi }]
   : practitioner.qualifications;
 return {
  ...practitioner,
  npi: practitioner.npi ?? profile.npi,
  specialty,
  qualifications,
 };
}

export async function findConnectedPatientIds(
 client: OpenEMRClient,
 userId: string,
): Promise<Result<string[]>> {
 try {
  const [practitionerId, err] = await findUserPractitionerId(userId);
  if (err || !practitionerId) return [null, err];

  const bundle = await client.fhirSearch("Appointment", {
   _count: CONNECTED_PATIENT_APPOINTMENT_FETCH,
  });
  const ids = [
   ...new Set(
    (bundle.entry ?? [])
     .map((e) => e.resource as FhirAppointment)
     .filter((r) => r?.resourceType === "Appointment")
     .map(mapAppointment)
     .filter((a) => a.doctorId === practitionerId)
     .map((a) => a.patientId)
     .filter((id): id is string => Boolean(id)),
   ),
  ];
  return [ids, null];
 } catch (e) {
  return [null, toError(e)];
 }
}
