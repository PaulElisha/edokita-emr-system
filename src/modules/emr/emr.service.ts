/** @format */
import { mapClinical, mapEncounter } from "../../lib/fhir-mapper.ts";
import { openemr } from "../../lib/openemr.ts";
import type {
  FhirClinicalResource,
  FhirEncounter,
  FhirObservation,
  FhirResource,
} from "../../types/fhir.ts";

/** FHIR types that make up a patient chart. */
const CLINICAL_RESOURCES = {
  conditions: "Condition",
  allergies: "AllergyIntolerance",
  medications: "MedicationRequest",
  immunizations: "Immunization",
  procedures: "Procedure",
  encounters: "Encounter",
} as const;

export type ClinicalKind = keyof typeof CLINICAL_RESOURCES;

interface ClinicalSearchResult {
  kind: ClinicalKind;
  total: number;
  items: Record<string, unknown>[];
}

async function searchClinical(
  kind: ClinicalKind,
  patientId: string,
): Promise<ClinicalSearchResult> {
  const resourceType = CLINICAL_RESOURCES[kind];
  const bundle = await openemr.fhirSearch(resourceType, { patient: patientId, _count: 200 });

  const items = (bundle.entry ?? [])
    .map((e) => e.resource as FhirResource)
    .filter((r) => r?.resourceType === resourceType)
    .map((r) =>
      kind === "encounters"
        ? mapEncounter(r as FhirEncounter)
        : mapClinical(r as FhirClinicalResource, kind),
    );

  return { kind, total: bundle.total ?? items.length, items };
}

async function searchObservations(patientId: string, category: string) {
  const bundle = await openemr.fhirSearch("Observation", {
    patient: patientId,
    category,
    _count: 200,
  });
  const items = (bundle.entry ?? [])
    .map((e) => e.resource as FhirObservation)
    .filter((r) => r?.resourceType === "Observation")
    .map((o) => ({
      id: o.id,
      code: o.code?.text ?? o.code?.coding?.[0]?.display ?? o.code?.coding?.[0]?.code,
      category: (o.category ?? []).map((c) => c.text ?? c.coding?.[0]?.code).filter(Boolean),
      effective: typeof o.effective === "string" ? o.effective : undefined,
      value: o.value,
    }));
  return { total: bundle.total ?? items.length, items };
}

export async function getClinicalSummary(patientId: string) {
  const [conditions, allergies, medications, immunizations, procedures, encounters, vitals, labs] =
    await Promise.all([
      searchClinical("conditions", patientId),
      searchClinical("allergies", patientId),
      searchClinical("medications", patientId),
      searchClinical("immunizations", patientId),
      searchClinical("procedures", patientId),
      searchClinical("encounters", patientId),
      searchObservations(patientId, "vital-signs"),
      searchObservations(patientId, "laboratory"),
    ]);

  return {
    patientId,
    conditions,
    allergies,
    medications,
    immunizations,
    procedures,
    encounters,
    vitals,
    labs,
  };
}

export function getClinical(patientId: string, kind: ClinicalKind) {
  return searchClinical(kind, patientId);
}

export function getObservations(
  patientId: string,
  category: "vital-signs" | "laboratory",
) {
  return searchObservations(patientId, category);
}

export function getEncounter(patientId: string, encounterId: string) {
  return openemr.fhirRead<FhirEncounter>("Encounter", encounterId);
}