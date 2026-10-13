/** @format */
import { mapPractitioner } from "@shared/lib/fhir-mapper.ts";
import { openemr, type QueryValue } from "@shared/lib/openemr.ts";
import type { FhirPractitioner } from "@shared/types/fhir.ts";

export interface DoctorListQuery {
  search?: string;
  family?: string;
  given?: string;
  active?: string;
  _count?: number;
}

export interface CreateDoctorInput {
  fname: string;
  lname: string;
  mname?: string;
  npi?: string;
  email?: string;
  phone?: string;
  specialty?: string;
}

export async function listDoctors(query: DoctorListQuery) {
  const params: Record<string, QueryValue> = {
    _count: query._count ?? 100,
  };
  if (query.family) params.family = query.family;
  if (query.given) params.given = query.given;
  if (query.active !== undefined) params.active = query.active === "true";
  if (query.search) params._content = query.search;

  const bundle = await openemr.fhirSearch("Practitioner", params);
  const resources = (bundle.entry ?? [])
    .map((e) => e.resource as FhirPractitioner)
    .filter((r) => r?.resourceType === "Practitioner")
    .map(mapPractitioner);

  return { total: bundle.total ?? resources.length, items: resources };
}

export async function getDoctor(id: string) {
  const doctor = await openemr.fhirRead<FhirPractitioner>("Practitioner", id);
  return mapPractitioner(doctor);
}

export async function createDoctor(input: CreateDoctorInput) {
   const resource = buildPractitionerResource(input);
   const created = await openemr.fhirCreate<FhirPractitioner>("Practitioner", resource);
   return mapPractitioner(created);
}

export async function updateDoctor(id: string, input: CreateDoctorInput) {
   const resource = buildPractitionerResource(input);
   const updated = await openemr.fhirUpdate<FhirPractitioner>("Practitioner", id, resource);
   return mapPractitioner(updated);
}

function buildPractitionerResource(input: CreateDoctorInput): Record<string, unknown> {
   const resource: Record<string, unknown> = {
    resourceType: "Practitioner",
    active: true,
    identifier: input.npi
     ? [{ system: "http://hl7.org/fhir/sid/us-npi", value: input.npi }]
     : [],
    name: [
     {
      use: "official",
      family: input.lname,
      given: [input.fname, input.mname].filter(Boolean),
     },
    ],
    telecom: [] as unknown[],
   };

   if (input.email) {
    (resource.telecom as unknown[]).push({ system: "email", value: input.email, use: "work" });
   }
   if (input.phone) {
    (resource.telecom as unknown[]).push({ system: "phone", value: input.phone, use: "work" });
   }

   if (input.specialty) {
    resource.qualification = [
     {
      code: { text: input.specialty },
     },
    ];
   }

   return resource;
}