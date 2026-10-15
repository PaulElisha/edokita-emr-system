/** Helpers to normalize FHIR resources into clean JSON for our API. */
import { differenceInYears } from "date-fns";
import { IDENTIFIER_SYSTEM } from "@shared/utils/fhir.ts";
import type {
  FhirAddress,
  FhirAppointment,
  FhirClinicalResource,
  FhirCodeableConcept,
  FhirEncounter,
  FhirHumanName,
  FhirPatient,
  FhirPractitioner,
  FhirReference,
} from "@shared/types/fhir.ts";

export interface NameParts {
  given: string;
  family: string;
  fullName: string;
}

export interface MappedAddress {
  line: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface MappedPatient extends NameParts {
  id?: string;
  resourceType: string;
  gender?: string;
  birthDate?: string;
  ageYears?: number;
  active: boolean;
  phone?: string;
  email?: string;
  address?: MappedAddress;
}

export interface MappedQualification {
 npi?: string;
 specialty?: string;
}

export interface MappedPractitioner extends NameParts {
 id?: string;
 resourceType: string;
 active: boolean;
 title?: string;
 suffix?: string;
 email?: string;
 phone?: string;
 mobile?: string;
 homePhone?: string;
 fax?: string;
 address?: MappedAddress;
 qualifications: MappedQualification[];
 npi?: string;
 specialty?: string;
 physicianType?: string;
 stateLicenseNumber?: string;
}

export interface MappedClinical {
  id?: string;
  resourceType: string;
  kind: string;
  code?: string;
  category: string[];
  clinicalStatus?: string;
  verificationStatus?: string;
  status?: string;
  onset?: string;
  recordedDate?: string;
  date?: string;
  value?: { value?: number | string; unit?: string };
  subjectId?: string;
  encounterId?: string;
}

export interface MappedParticipant {
 /** HL7 participation code: `PART` (patient), `PPRF` (primary performer), `LOC` (location). */
 role?: string;
 type: string[];
 actorType?: string;
 actorId?: string;
 actorDisplay?: string;
 status?: string;
}

export interface MappedAppointment {
 id?: string;
 resourceType: string;
 status?: string;
 start?: string;
 end?: string;
 type?: string;
 typeCode?: string;
 description?: string;
 participants: MappedParticipant[];
 patientId?: string;
 doctorId?: string;
 locationId?: string;
}

export interface MappedEncounter {
  id?: string;
  resourceType: string;
  status?: string;
  class?: string;
  type: string[];
  reasonCode: string[];
  start?: string;
  end?: string;
  subjectId?: string;
}

export function conceptText(concept?: FhirCodeableConcept): string | undefined {
  if (!concept) return undefined;
  return concept.text ?? concept.coding?.[0]?.display ?? concept.coding?.[0]?.code;
}

export function normalizeName(name?: FhirHumanName[]): NameParts {
  const official = name?.find((n) => n.use === "official") ?? name?.[0];
  if (!official) return { given: "", family: "", fullName: "" };
  return {
    given: official.given?.join(" ") ?? "",
    family: official.family ?? "",
    fullName: [official.given?.join(" "), official.family].filter(Boolean).join(" "),
  };
}

export function referenceId(ref?: FhirReference): string | undefined {
  return ref?.reference?.split("/").pop();
}

export function mapAddress(address?: FhirAddress): MappedAddress | undefined {
  if (!address) return undefined;
  return {
    line: address.line?.join(", ") ?? "",
    city: address.city,
    state: address.state,
    postalCode: address.postalCode,
    country: address.country,
  };
}

export function mapPatient(patient: FhirPatient): MappedPatient {
  const name = normalizeName(patient.name);
  const homePhone = patient.telecom?.find((t) => t.system === "phone");
  const email = patient.telecom?.find((t) => t.system === "email");
  return {
    id: patient.id,
    resourceType: patient.resourceType,
    ...name,
    gender: patient.gender,
    birthDate: patient.birthDate,
    ageYears: patient.birthDate ? calcAge(patient.birthDate) : undefined,
    active: patient.active ?? true,
    phone: homePhone?.value,
    email: email?.value,
    address: mapAddress(patient.address?.[0]),
  };
}

export function mapPractitioner(p: FhirPractitioner): MappedPractitioner {
  const name = normalizeName(p.name);
  const official = p.name?.find((n) => n.use === "official") ?? p.name?.[0];
  const telecomValue = (system: string, use?: string): string | undefined =>
    p.telecom?.find((t) => t.system === system && (use === undefined || t.use === use))?.value;
  const identifier = p.identifier ?? [];
  const npi = identifier.find((i) => i.system === IDENTIFIER_SYSTEM.npi)?.value;
  const stateLicenseNumber = identifier.find(
    (i) => i.system === IDENTIFIER_SYSTEM.stateLicense,
  )?.value;
  const quals: MappedQualification[] = (p.qualification ?? []).map((q) => ({
    npi: q.identifier?.find((i) => i.value)?.value,
    specialty: conceptText(q.code),
  }));
  return {
    id: p.id,
    resourceType: p.resourceType,
    ...name,
    active: p.active ?? true,
    title: official?.prefix?.[0],
    suffix: official?.suffix?.[0],
    email: telecomValue("email"),
    phone: telecomValue("phone", "work") ?? telecomValue("phone"),
    mobile: telecomValue("phone", "mobile"),
    homePhone: telecomValue("phone", "home"),
    fax: telecomValue("fax"),
    address: mapAddress(p.address?.[0]),
    qualifications: quals,
    npi: npi ?? quals.find((q) => q.npi)?.npi,
    specialty: quals.find((q) => q.specialty)?.specialty,
    stateLicenseNumber,
  };
}

/** Each clinical resource spells its "code" differently. */
function clinicalCode(r: FhirClinicalResource): string | undefined {
  if ("code" in r) return conceptText(r.code);
  if ("medicationCodeableConcept" in r) return conceptText(r.medicationCodeableConcept);
  if ("vaccineCode" in r) return conceptText(r.vaccineCode);
  return undefined;
}

/** `category` is `CodeableConcept[]`, except AllergyIntolerance's `string[]`. */
function clinicalCategory(r: FhirClinicalResource): string[] {
  if (!("category" in r) || !r.category) return [];
  const cats = Array.isArray(r.category) ? r.category : [r.category];
  return cats
    .map((c) => (typeof c === "string" ? c : conceptText(c)))
    .filter((c): c is string => Boolean(c));
}

/** Onset differs between Condition/AllergyIntolerance; absent elsewhere. */
function clinicalOnset(r: FhirClinicalResource): string | undefined {
  if ("onsetDateTime" in r) return r.onsetDateTime;
  if ("onsetPeriod" in r) return r.onsetPeriod?.start;
  if ("onsetString" in r) return r.onsetString;
  return undefined;
}

/** Clinically-relevant date, spread across several FHIR fields. */
function clinicalDate(r: FhirClinicalResource): string | undefined {
  if ("occurrenceDateTime" in r) return r.occurrenceDateTime;
  if ("occurrenceString" in r) return r.occurrenceString;
  if ("performedDateTime" in r) return r.performedDateTime;
  if ("performedPeriod" in r) return r.performedPeriod?.start;
  if ("performedString" in r) return r.performedString;
  if ("authoredOn" in r) return r.authoredOn;
  return undefined;
}

/** Some resources reference the patient via `subject`, others via `patient`. */
function clinicalSubjectId(r: FhirClinicalResource): string | undefined {
  if ("subject" in r) return referenceId(r.subject);
  if ("patient" in r) return referenceId(r.patient);
  return undefined;
}

export function mapClinical(
  resource: FhirClinicalResource,
  kind: string,
): MappedClinical {
  return {
    id: resource.id,
    resourceType: resource.resourceType,
    kind,
    code: clinicalCode(resource),
    category: clinicalCategory(resource),
    clinicalStatus:
      "clinicalStatus" in resource
        ? conceptText(resource.clinicalStatus)
        : undefined,
    verificationStatus:
      "verificationStatus" in resource
        ? conceptText(resource.verificationStatus)
        : undefined,
    status: "status" in resource ? resource.status : undefined,
    onset: clinicalOnset(resource),
    recordedDate:
      "recordedDate" in resource ? resource.recordedDate : undefined,
    date: clinicalDate(resource),
    subjectId: clinicalSubjectId(resource),
    encounterId: referenceId(resource.encounter),
  };
}

export function mapAppointment(a: FhirAppointment): MappedAppointment {
 const participants: MappedParticipant[] = (a.participant ?? []).map((p) => ({
  role: p.type?.[0]?.coding?.[0]?.code,
  type: (p.type ?? []).map(conceptText).filter((t): t is string => Boolean(t)),
  actorType: p.actor?.type ?? p.actor?.reference?.split("/")[0],
  actorId: referenceId(p.actor),
  actorDisplay: p.actor?.display,
  status: p.status,
 }));
 // Identify by participation code first, falling back to the actor reference type.
 // A provider without an NPI is returned as a `Person` (not `Practitioner`) actor.
 const byRole = (code: string): string | undefined =>
  participants.find((p) => p.role === code)?.actorId;
 const byActor = (actorType: string): string | undefined =>
  participants.find((p) => p.actorType === actorType)?.actorId;
 return {
  id: a.id,
  resourceType: a.resourceType,
  status: a.status,
  start: a.start,
  end: a.end,
  type: conceptText(a.appointmentType),
  typeCode: a.appointmentType?.coding?.[0]?.code,
  description: a.description,
  participants,
  patientId: byRole("PART") ?? byActor("Patient"),
  doctorId: byRole("PPRF") ?? byActor("Practitioner") ?? byActor("Person"),
  locationId: byRole("LOC") ?? byActor("Location"),
 };
}

export function mapEncounter(e: FhirEncounter): MappedEncounter {
  return {
    id: e.id,
    resourceType: e.resourceType,
    status: e.status,
    class: e.class?.display ?? e.class?.code,
    type: (e.type ?? []).map(conceptText).filter((t): t is string => Boolean(t)),
    reasonCode: (e.reasonCode ?? [])
      .map(conceptText)
      .filter((c): c is string => Boolean(c)),
    start: e.period?.start,
    end: e.period?.end,
    subjectId: referenceId(e.subject),
  };
}

export function calcAge(birthDate: string): number {
 const age = differenceInYears(new Date(), new Date(birthDate));
 return age < 0 ? 0 : age;
}

// /**
//  * Hand-rolled age computation, replaced by date-fns `differenceInYears`.
//  */
// export function calcAge(birthDate: string): number {
//  const dob = new Date(birthDate);
//  const now = new Date();
//  let age = now.getFullYear() - dob.getFullYear();
//  const m = now.getMonth() - dob.getMonth();
//  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
//  return age < 0 ? 0 : age;
// }
