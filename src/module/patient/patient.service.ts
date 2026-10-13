/** @format */
import { calcAge, mapPatient } from "@shared/lib/fhir-mapper.ts";
import { openemr, type QueryValue } from "@shared/lib/openemr.ts";
import type { FhirPatient } from "@shared/types/fhir.ts";

export interface PatientListQuery {
  search?: string;
  given?: string;
  family?: string;
  gender?: string;
  birthDate?: string;
  _count?: number;
}

export interface CreatePatientInput {
  fname: string;
  mname?: string;
  lname: string;
  birthDate: string;
  gender: string;
  phone?: string;
  email?: string;
  street?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  countryCode?: string;
}

const GENDER_MAP: Record<string, string> = {
  male: "male",
  "m": "male",
  "M": "male",
  "1": "male",
  female: "female",
  "f": "female",
  "F": "female",
  "2": "female",
  other: "other",
  unknown: "unknown",
};

export async function listPatients(query: PatientListQuery) {
  const params: Record<string, QueryValue> = {
    _count: query._count ?? 100,
  };
  if (query.search) params._content = query.search;
  if (query.family) params.family = query.family;
  if (query.given) params.given = query.given;
  if (query.gender) params.gender = GENDER_MAP[query.gender.toLowerCase()] ?? query.gender;
  if (query.birthDate) params.birthdate = query.birthDate;

  const bundle = await openemr.fhirSearch("Patient", params);
  const resources = (bundle.entry ?? [])
    .map((e) => e.resource as FhirPatient)
    .filter((r) => r?.resourceType === "Patient")
    .map(mapPatient);

  return { total: bundle.total ?? resources.length, items: resources };
}

export async function getPatient(id: string) {
  const patient = await openemr.fhirRead<FhirPatient>("Patient", id);
  return mapPatient(patient);
}

export async function createPatient(input: CreatePatientInput) {
  const resource: Record<string, unknown> = {
    resourceType: "Patient",
    active: true,
    name: [
      {
        use: "official",
        family: input.lname,
        given: [input.fname, input.mname].filter(Boolean),
      },
    ],
    gender: GENDER_MAP[input.gender.toLowerCase()] ?? "unknown",
    birthDate: input.birthDate,
    telecom: [] as unknown[],
  };

  if (input.phone) {
    (resource.telecom as unknown[]).push({ system: "phone", value: input.phone, use: "home" });
  }
  if (input.email) {
    (resource.telecom as unknown[]).push({ system: "email", value: input.email, use: "home" });
  }
  if (input.street || input.city || input.state || input.postalCode || input.countryCode) {
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

  const created = await openemr.fhirCreate<FhirPatient>("Patient", resource);
  return mapPatient(created);
}

export function patientAge(birthDate: string): number {
  return calcAge(birthDate);
}