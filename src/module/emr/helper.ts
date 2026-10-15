/** @format */
import { OpenEMR } from "@/env.ts";
import {
 conceptText,
 mapClinical,
 mapEncounter,
} from "@shared/utils/fhir-mapper.ts";
import convert from "convert-units";
import type OpenEMRClient from "@module/openemr/client.ts";
import type {
 CreateEncounterInput,
 RecordVitalsInput,
} from "@module/emr/emr.service.ts";
import type {
 FhirClinicalResource,
 FhirEncounter,
 FhirObservation,
 FhirQuantity,
 FhirResource,
} from "@shared/types/fhir.ts";
import type {
 ClinicalItem,
 ClinicalKind,
 ClinicalSearchResult,
 ObservationItem,
 ObservationResult,
 ObservationValue,
} from "@module/emr/emr.service.ts";
import type { Result } from "@shared/types.ts";
import { toDateString } from "@shared/utils/date.ts";
import { toError } from "@shared/error/error.ts";

/** FHIR resource type backing each clinical kind. */
const CLINICAL_RESOURCES: Record<ClinicalKind, string> = {
 conditions: "Condition",
 allergies: "AllergyIntolerance",
 medications: "MedicationRequest",
 immunizations: "Immunization",
 procedures: "Procedure",
 encounters: "Encounter",
};

export async function searchClinical(
 client: OpenEMRClient,
 kind: ClinicalKind,
 patientId: string,
): Promise<Result<ClinicalSearchResult>> {
 try {
  const resourceType = CLINICAL_RESOURCES[kind];
  const bundle = await client.fhirSearch(resourceType, {
   patient: patientId,
   _count: 200,
  });

  const items: ClinicalItem[] = (bundle.entry ?? [])
   .map((e) => e.resource as FhirResource)
   .filter((r) => r?.resourceType === resourceType)
   .map((r) =>
    kind === "encounters"
     ? mapEncounter(r as FhirEncounter)
     : mapClinical(r as FhirClinicalResource, kind),
   );

  return [{ kind, total: bundle.total ?? items.length, items }, null];
 } catch (e) {
  return [null, toError(e)];
 }
}

/** Normalizes any FHIR value slot into the `{ value, unit }` shape our API exposes. */
function toValue(
 quantity?: FhirQuantity,
 text?: string,
 integer?: number,
): ObservationValue | undefined {
 if (quantity && quantity.value !== undefined) {
  return { value: quantity.value, unit: quantity.unit ?? quantity.code };
 }
 if (typeof text === "string") return { value: text };
 if (typeof integer === "number") return { value: integer };
 return undefined;
}

/** Reads a top-level Observation value (vitals/labs use `valueQuantity`). */
function observationValue(o: FhirObservation): ObservationValue | undefined {
 const quantity = toValue(o.valueQuantity);
 if (quantity) return quantity;
 if (typeof o.valueString === "string") return { value: o.valueString };
 if (typeof o.valueInteger === "number") return { value: o.valueInteger };
 if (typeof o.valueBoolean === "boolean") return { value: o.valueBoolean };
 if (o.valueCodeableConcept) {
  const text = conceptText(o.valueCodeableConcept);
  if (text) return { value: text };
 }
 return undefined;
}

/**
 * OpenEMR emits vitals in imperial UCUM units (`form_vitals` storage format).
 * Convert the display value back to metric so reads round-trip with the metric
 * inputs our write API/MCP tools accept.
 */
function toMetric(value: ObservationValue): ObservationValue {
 const v = value.value;
 if (typeof v !== "number") return value;
 switch (value.unit) {
  case "in_i":
  case "[in_i]":
   return { value: round(convert(v).from("in").to("cm"), 1), unit: "cm" };
  case "lb_av":
  case "[lb_av]":
   return { value: round(convert(v).from("lb").to("kg"), 2), unit: "kg" };
  case "degF":
  case "[degF]":
   return { value: round(convert(v).from("F").to("C"), 1), unit: "Cel" };
  default:
   return value;
 }
}

export async function searchObservations(
 client: OpenEMRClient,
 patientId: string,
 category: string,
): Promise<Result<ObservationResult>> {
 try {
  const bundle = await client.fhirSearch("Observation", {
   patient: patientId,
   category,
   _count: 200,
  });
  const items: ObservationItem[] = (bundle.entry ?? [])
   .map((e) => e.resource as FhirObservation)
   .filter((r) => r?.resourceType === "Observation")
   .map((o) => {
    const components = (o.component ?? [])
     .map((c) => {
      const value =
       toValue(c.valueQuantity) ??
       toValue(undefined, c.valueString, c.valueInteger) ??
       (c.valueCodeableConcept
        ? { value: conceptText(c.valueCodeableConcept) }
        : undefined);
      return {
       code: conceptText(c.code),
       value: value ? toMetric(value) : undefined,
      };
     })
     .filter((c) => Boolean(c.code) && c.value !== undefined);
    const value = observationValue(o);
    const item: ObservationItem = {
     id: o.id,
     code: conceptText(o.code),
     category: (o.category ?? [])
      .map((c) => c.text ?? c.coding?.[0]?.code)
      .filter((c): c is string => Boolean(c)),
     effective: o.effectiveDateTime,
     value: value ? toMetric(value) : undefined,
    };
    return components.length > 0 ? { ...item, components } : item;
   });
  return [{ total: bundle.total ?? items.length, items }, null];
 } catch (e) {
  return [null, toError(e)];
 }
}

function round(value: number, decimals: number): number {
 const factor = 10 ** decimals;
 return Math.round(value * factor) / factor;
}

function num(value: string | number | undefined): number | undefined {
 if (value === undefined || value === null || value === "") return undefined;
 const n = typeof value === "number" ? value : Number(value);
 return Number.isFinite(n) ? n : undefined;
}

/**
 * OpenEMR's BMI category lower bounds (`BmiCategory::fromBmi`); the matched
 * string is stored verbatim in `form_vitals.BMI_status`.
 */
const BMI_CATEGORIES: Array<{ min: number; status: string }> = [
 { min: 42, status: "Obesity III" },
 { min: 34, status: "Obesity II" },
 { min: 30, status: "Obesity I" },
 { min: 27, status: "Overweight" },
 { min: 25, status: "Normal BL" },
 { min: 18.5, status: "Normal" },
 { min: 10, status: "Underweight" },
];

/** Maps a BMI value to the OpenEMR `BMI_status` label. */
function bmiStatus(bmi: number): string | undefined {
 return BMI_CATEGORIES.find((c) => bmi > c.min)?.status;
}

// /** OpenEMR's BMI category boundaries; value matches the `BmiCategory` enum it stores. */
// function bmiStatus(bmi: number): string | undefined {
//  if (bmi > 42) return "Obesity III";
//  if (bmi > 34) return "Obesity II";
//  if (bmi > 30) return "Obesity I";
//  if (bmi > 27) return "Overweight";
//  if (bmi > 25) return "Normal BL";
//  if (bmi > 18.5) return "Normal";
//  if (bmi > 10) return "Underweight";
//  return undefined;
// }

/**
 * Writes are issued through OpenEMR's Standard REST API (FHIR Encounter/Observation
 * are read-only). Payloads use OpenEMR's own field names: `pc_*` / `form_encounter`
 * columns for encounters, `form_vitals` columns for vitals.
 */
export function buildEncounterPayload(
 input: CreateEncounterInput,
): Record<string, unknown> {
 return {
  date: input.date ?? toDateString(new Date()),
  onset_date: "",
  reason: input.reason ?? "",
  pc_catid: input.categoryId ?? OpenEMR.defaultAppointmentCategory,
  facility_id: input.facilityId ?? OpenEMR.defaultFacility,
  billing_facility: input.billingFacility ?? OpenEMR.defaultBillingLocation,
  provider_id: input.providerId ?? "",
  sensitivity: input.sensitivity ?? "normal",
  class_code: input.classCode ?? "AMB",
  referral_source: "",
  pos_code: "0",
  external_id: "",
 };
}

/**
 * Our API takes metric inputs; OpenEMR's `form_vitals` stores imperial
 * (weight lb, height in, temperature °F), so conversions live here.
 */
export function buildVitalsPayload(
 input: RecordVitalsInput,
): Record<string, unknown> {
 const payload: Record<string, unknown> = {
  date: input.date ?? toDateString(new Date()),
 };

 const bps = num(input.systolic);
 if (bps !== undefined) payload.bps = bps;
 const bpd = num(input.diastolic);
 if (bpd !== undefined) payload.bpd = bpd;
 const pulse = num(input.pulse);
 if (pulse !== undefined) payload.pulse = pulse;
 const respiration = num(input.respiration);
 if (respiration !== undefined) payload.respiration = respiration;
 const spo2 = num(input.oxygenSaturation);
 if (spo2 !== undefined) payload.oxygen_saturation = spo2;

 const weightKg = num(input.weightKg);
 const weightLb =
  weightKg !== undefined
   ? round(convert(weightKg).from("kg").to("lb"), 2)
   : undefined;
 if (weightLb !== undefined) payload.weight = weightLb;
 const heightCm = num(input.heightCm);
 const heightIn =
  heightCm !== undefined
   ? round(convert(heightCm).from("cm").to("in"), 2)
   : undefined;
 if (heightIn !== undefined) payload.height = heightIn;
 // OpenEMR's UI computes BMI client-side (703 * lb / in²) and only then stores
 // it; the REST vital insert skips that, so replicate it here.
 if (weightLb !== undefined && heightIn !== undefined && heightIn > 0) {
  const bmi = round((weightLb / (heightIn * heightIn)) * 703, 2);
  payload.BMI = bmi;
  const status = bmiStatus(bmi);
  if (status) payload.BMI_status = status;
 }
 const temperature = num(input.temperatureC);
 if (temperature !== undefined) {
  payload.temperature = round(convert(temperature).from("C").to("F"), 1);
 }
 const waist = num(input.waistCircumference);
 if (waist !== undefined) {
  payload.waist_circ = round(convert(waist).from("cm").to("in"), 2);
 }
 const head = num(input.headCircumference);
 if (head !== undefined) {
  payload.head_circ = round(convert(head).from("cm").to("in"), 2);
 }

 if (input.temperatureMethod) payload.temp_method = input.temperatureMethod;
 if (input.note) payload.note = input.note;

 return payload;
}

// /**
//  * Hand-rolled imperial/metric conversions, replaced by convert-units.
//  * These were inlined in `buildVitalsPayload` before the library refactor:
//  *
//  *   const weight = num(input.weightKg);
//  *   if (weight !== undefined) payload.weight = round(weight * 2.2046226218, 2); // kg -> lb
//  *   const height = num(input.heightCm);
//  *   if (height !== undefined) payload.height = round(height / 2.54, 2); // cm -> in
//  *   const temperature = num(input.temperatureC);
//  *   if (temperature !== undefined) {
//  *    payload.temperature = round((temperature * 9) / 5 + 32, 1); // C -> F
//  *   }
//  *   const waist = num(input.waistCircumference);
//  *   if (waist !== undefined) payload.waist_circ = round(waist / 2.54, 2); // cm -> in
//  *   const head = num(input.headCircumference);
//  *   if (head !== undefined) payload.head_circ = round(head / 2.54, 2); // cm -> in
//  */
