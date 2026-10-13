/** Helpers to normalize FHIR resources into clean JSON for our API. */
import type {
  FhirAppointment,
  FhirClinicalResource,
  FhirCodeableConcept,
  FhirHumanName,
  FhirPatient,
  FhirPractitioner,
  FhirReference,
} from "@shared/types/fhir.ts";

export function conceptText(concept?: FhirCodeableConcept): string | undefined {
  if (!concept) return undefined;
  return concept.text ?? concept.coding?.[0]?.display ?? concept.coding?.[0]?.code;
}

export function normalizeName(name?: FhirHumanName[]): Record<string, unknown> {
  const official = name?.find((n) => n.use === "official") ?? name?.[0];
  if (!official) return {};
  return {
    given: official.given?.join(" ") ?? "",
    family: official.family ?? "",
    fullName: [official.given?.join(" "), official.family].filter(Boolean).join(" "),
  };
}

export function referenceId(ref?: FhirReference): string | undefined {
  return ref?.reference?.split("/").pop();
}

function isoDate(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return (record.dateTime as string) ?? (record.start as string) ?? (record.value as string);
  }
  return undefined;
}

export function mapPatient(patient: FhirPatient): Record<string, unknown> {
  const name = normalizeName(patient.name);
  const homePhone = patient.telecom?.find((t) => t.system === "phone");
  const email = patient.telecom?.find((t) => t.system === "email");
  const primaryAddress = patient.address?.[0];
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
    address: primaryAddress
      ? {
          line: primaryAddress.line?.join(", ") ?? "",
          city: primaryAddress.city,
          state: primaryAddress.state,
          postalCode: primaryAddress.postalCode,
          country: primaryAddress.country,
        }
      : undefined,
  };
}

export function mapPractitioner(p: FhirPractitioner): Record<string, unknown> {
  const name = normalizeName(p.name);
  const email = p.telecom?.find((t) => t.system === "email");
  const phone = p.telecom?.find((t) => t.system === "phone");
  const quals = (p.qualification ?? []).map((q) => ({
    npi: q.identifier?.value,
    specialty: conceptText(q.code),
  }));
  return {
    id: p.id,
    resourceType: p.resourceType,
    ...name,
    active: p.active ?? true,
    email: email?.value,
    phone: phone?.value,
    qualifications: quals,
    npi: quals.find((q) => q.npi)?.npi,
    specialty: quals.find((q) => q.specialty)?.specialty,
  };
}

export function mapClinical(
  resource: FhirClinicalResource,
  kind: string,
): Record<string, unknown> {
  return {
    id: resource.id,
    resourceType: resource.resourceType,
    kind,
    code: conceptText(resource.code),
    category: (resource.category ?? []).map(conceptText).filter(Boolean),
    clinicalStatus: conceptText(resource.clinicalStatus),
    verificationStatus: conceptText(resource.verificationStatus),
    status: resource.status,
    onset: isoDate(resource.onset),
    recordedDate: resource.recordedDate,
    date:
      isoDate(resource.occurrence) ??
      isoDate(resource.performed) ??
      isoDate(resource.effective),
    value: resource.value,
    subjectId: referenceId(resource.subject),
    encounterId: referenceId(resource.encounter),
  };
}

export function mapAppointment(a: FhirAppointment): Record<string, unknown> {
  const participants = (a.participant ?? []).map((p) => ({
    type: (p.type ?? []).map(conceptText).filter(Boolean),
    actorType: p.actor?.type ?? p.actor?.reference?.split("/")[0],
    actorId: referenceId(p.actor),
    actorDisplay: p.actor?.display,
    status: p.status,
  }));
  return {
    id: a.id,
    resourceType: a.resourceType,
    status: a.status,
    start: a.start,
    end: a.end,
    type: conceptText(a.appointmentType),
    description: a.description,
    participants,
    patientId: participants.find((p) => p.actorType === "Patient")?.actorId,
    doctorId: participants.find((p) => p.actorType === "Practitioner")?.actorId,
  };
}

export function mapEncounter(e: { id?: string; resourceType?: string; status?: string; class?: FhirCodeableConcept; type?: FhirCodeableConcept[]; reasonCode?: FhirCodeableConcept[]; period?: { start?: string; end?: string }; subject?: FhirReference }): Record<string, unknown> {
  return {
    id: e.id,
    resourceType: e.resourceType,
    status: e.status,
    class: conceptText(e.class),
    type: (e.type ?? []).map(conceptText).filter(Boolean),
    reasonCode: (e.reasonCode ?? []).map(conceptText).filter(Boolean),
    start: e.period?.start,
    end: e.period?.end,
    subjectId: referenceId(e.subject),
  };
}

export function calcAge(birthDate: string): number {
  const dob = new Date(birthDate);
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
  return age;
}