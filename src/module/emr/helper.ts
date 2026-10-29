/** @format */

import { getOpenEMRClient } from "@openemr/context.ts";

import { OpenEMR } from "@/env.ts";
import {
 conceptText,
 mapClinical,
 mapEncounter,
 referenceId,
 type MappedProvider,
} from "@shared/utils/fhir-mapper.ts";
import { setDefined } from "@shared/utils/object.ts";
import convert from "convert-units";
import { eq } from "drizzle-orm";
import { db } from "@db/db.ts";
import { emrRecordAuthors } from "@db/schema/emr.ts";
import { users } from "@db/schema/user.ts";
import type {
 AllergyInput,
 ConditionInput,
 CreateEncounterInput,
 MedicationInput,
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
 EmrObservation,
 EmrObservationList,
 ObservationInput,
 ObservationItem,
 ObservationResult,
 ObservationValue,
 StandardResource,
} from "@module/emr/emr.service.ts";
import type { Result } from "@shared/types.ts";
import {
 fromDateString,
 toDateString,
 toDateTimeString,
} from "@shared/utils/date.ts";
import { toError } from "@shared/error/error.ts";
import APIError from "@error/APIError.ts";
import { findUserNamesByPractitionerIds } from "@module/user/helper.ts";

const CLINICAL_RESOURCES: Record<ClinicalKind, string> = {
 conditions: "Condition",
 allergies: "AllergyIntolerance",
 medications: "MedicationRequest",
 immunizations: "Immunization",
 procedures: "Procedure",
 encounters: "Encounter",
};

export type EmrResourceType =
 | "encounter"
 | "condition"
 | "allergy"
 | "medication"
 | "soap_note"
 | "lab_order"
 | "lab_result"
 | "observation";

const KIND_RESOURCE: Partial<Record<ClinicalKind, EmrResourceType>> = {
 conditions: "condition",
 allergies: "allergy",
 medications: "medication",
 encounters: "encounter",
};

interface EmrAttribution {
 provider: MappedProvider;
 authoredAt: string;
}

type EmrAuthorMap = Map<string, EmrAttribution>;

export async function recordEmrAuthor(
 patientId: string,
 resourceType: EmrResourceType,
 resourceId: string,
 authorUserId: string,
): Promise<void> {
 try {
  await db
   .insert(emrRecordAuthors)
   .values({ patientId, resourceType, resourceId, authorUserId })
   .onConflictDoNothing();
 } catch {
  // best-effort only
 }
}

export interface EmrAuthorEntry {
 resourceType: EmrResourceType;
 resourceId: string;
}

export async function recordEmrAuthors(
 patientId: string,
 authorUserId: string,
 entries: EmrAuthorEntry[],
): Promise<void> {
 if (entries.length === 0) return;
 try {
  await db
   .insert(emrRecordAuthors)
   .values(
    entries.map((e) => ({
     patientId,
     resourceType: e.resourceType,
     resourceId: e.resourceId,
     authorUserId,
    })),
   )
   .onConflictDoNothing();
 } catch {
  // best-effort only
 }
}

export async function findEmrAuthorsByPatient(
 patientId: string,
): Promise<EmrAuthorMap> {
 const authors: EmrAuthorMap = new Map();
 const rows = await db
  .select({
   resourceType: emrRecordAuthors.resourceType,
   resourceId: emrRecordAuthors.resourceId,
   createdAt: emrRecordAuthors.createdAt,
   practitionerId: users.openemrPractitionerId,
   firstName: users.firstName,
   lastName: users.lastName,
  })
  .from(emrRecordAuthors)
  .innerJoin(users, eq(users.id, emrRecordAuthors.authorUserId))
  .where(eq(emrRecordAuthors.patientId, patientId));

 for (const row of rows) {
  const name = [row.firstName, row.lastName]
   .filter((part): part is string => Boolean(part))
   .join(" ")
   .trim();
  authors.set(`${row.resourceType}:${row.resourceId}`, {
   provider: {
    id: row.practitionerId ?? undefined,
    name: name || undefined,
   },
   authoredAt: row.createdAt.toISOString(),
  });
 }
 return authors;
}

function applyClinicalAuthors(
 items: ClinicalItem[],
 type: EmrResourceType,
 authors: EmrAuthorMap,
): void {
 for (const item of items) {
  const author = item.id ? authors.get(`${type}:${item.id}`) : undefined;
  if (!author) continue;
  item.provider = author.provider;
  item.authoredAt = author.authoredAt;
 }
}

export async function searchClinical(
 kind: ClinicalKind,
 patientId: string,
 authors?: EmrAuthorMap,
): Promise<Result<ClinicalSearchResult>> {
 const client = getOpenEMRClient();
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

  const providerIds = items
   .map((i) => i.provider?.id)
   .filter((id): id is string => Boolean(id));
  if (providerIds.length > 0) {
   const names = await findUserNamesByPractitionerIds(providerIds);
   for (const item of items) {
    const id = item.provider?.id;
    const name = id ? names.get(id) : undefined;
    if (item.provider && name) item.provider.name = name;
   }
  }

  const attributionType = KIND_RESOURCE[kind];
  if (attributionType) {
   const authorMap = authors ?? (await findEmrAuthorsByPatient(patientId));
   applyClinicalAuthors(items, attributionType, authorMap);
  }

  return [{ kind, total: bundle.total ?? items.length, items }, null];
 } catch (e) {
  return [null, toError(e)];
 }
}

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

function mapObservation(o: FhirObservation): ObservationItem {
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
 const referenceRange = (o.referenceRange ?? [])
  .map((r) => ({
   low: r.low?.value,
   high: r.high?.value,
   unit: r.low?.unit ?? r.high?.unit,
   text: r.text,
  }))
  .filter(
   (r) => r.low !== undefined || r.high !== undefined || Boolean(r.text),
  );
 const item: ObservationItem = {
  id: o.id,
  code: conceptText(o.code),
  category: (o.category ?? [])
   .map((c) => c.text ?? c.coding?.[0]?.code)
   .filter((c): c is string => Boolean(c)),
  effective: o.effectiveDateTime,
  value: value ? toMetric(value) : undefined,
  encounterId: referenceId(o.encounter),
 };
 const ranged = referenceRange.length > 0 ? { ...item, referenceRange } : item;
 return components.length > 0 ? { ...ranged, components } : ranged;
}

function attributeObservation(
 item: ObservationItem,
 authorMap: EmrAuthorMap,
): ObservationItem {
 const author =
  (item.encounterId
   ? authorMap.get(`encounter:${item.encounterId}`)
   : undefined) ??
  (item.id ? authorMap.get(`lab_result:${item.id}`) : undefined);
 if (!author) return item;
 return { ...item, provider: author.provider, authoredAt: author.authoredAt };
}

export async function searchObservations(
 patientId: string,
 category: string,
 authors?: EmrAuthorMap,
): Promise<Result<ObservationResult>> {
 const client = getOpenEMRClient();
 try {
  const bundle = await client.fhirSearch("Observation", {
   patient: patientId,
   category,
   _count: 200,
  });
  const items = (bundle.entry ?? [])
   .map((e) => e.resource as FhirObservation)
   .filter((r) => r?.resourceType === "Observation")
   .map(mapObservation);

  const authorMap = authors ?? (await findEmrAuthorsByPatient(patientId));
  const attributed = items.map((item) => attributeObservation(item, authorMap));

  return [
   { total: bundle.total ?? attributed.length, items: attributed },
   null,
  ];
 } catch (e) {
  return [null, toError(e)];
 }
}

const OBSERVATION_UUID_PATTERN =
 /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function observationQuery(
 patientId: string,
 extra: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
 const ref = OBSERVATION_UUID_PATTERN.test(patientId)
  ? { patient_uuid: patientId }
  : { patient_id: patientId };
 return { ...ref, ...extra };
}

function asString(value: unknown): string | undefined {
 return typeof value === "string" && value !== "" ? value : undefined;
}

function mapStandardObservation(row: StandardResource): EmrObservation {
 return {
  id: asString(row.observation_uuid),
  patientId: asString(row.patient_uuid),
  encounterId: asString(row.encounter_uuid),
  category: asString(row.category),
  code: asString(row.code),
  codeType: asString(row.code_type),
  description: asString(row.description),
  value: asString(row.ob_value),
  unit: asString(row.ob_unit),
  status: asString(row.ob_status),
  type: asString(row.ob_type),
  date: asString(row.date),
  endDate: asString(row.date_end),
  note: asString(row.observation),
 };
}

function attributeStandardObservation(
 item: EmrObservation,
 authorMap: EmrAuthorMap,
): EmrObservation {
 const author = item.id ? authorMap.get(`observation:${item.id}`) : undefined;
 if (!author) return item;
 return { ...item, provider: author.provider, authoredAt: author.authoredAt };
}

export async function listObservations(
 patientId: string,
 category?: string,
 authors?: EmrAuthorMap,
): Promise<Result<EmrObservationList>> {
 const client = getOpenEMRClient();
 try {
  const rows = await client.standardGet<StandardResource>(
   "/api/observation",
   observationQuery(patientId, { category }),
  );
  const items = rows.map(mapStandardObservation);
  const authorMap = authors ?? (await findEmrAuthorsByPatient(patientId));
  const attributed = items.map((item) =>
   attributeStandardObservation(item, authorMap),
  );
  return [{ total: attributed.length, items: attributed }, null];
 } catch (e) {
  return [null, toError(e)];
 }
}

export async function getObservationResource(
 patientId: string,
 observationId: string,
 authors?: EmrAuthorMap,
): Promise<Result<EmrObservation>> {
 const client = getOpenEMRClient();
 try {
  const rows = await client.standardGet<StandardResource>(
   `/api/observation/${observationId}`,
   observationQuery(patientId),
  );
  const row = rows[0];
  if (!row) return [null, APIError.notFound("Observation not found")];
  const item = mapStandardObservation(row);
  const authorMap = authors ?? (await findEmrAuthorsByPatient(patientId));
  return [attributeStandardObservation(item, authorMap), null];
 } catch (e) {
  return [null, toError(e)];
 }
}

export function buildObservationPayload(
 input: Partial<ObservationInput>,
): Record<string, unknown> {
 const payload: Record<string, unknown> = {};
 const set = setDefined(payload);
 set("encounter_uuid", input.encounterId);
 set("category", input.category);
 set("code", input.code);
 set("code_type", input.codeType);
 set("description", input.description);
 set("ob_value", input.value);
 set("ob_unit", input.unit);
 set("ob_status", input.status);
 set("ob_type", input.type);
 set("date", input.date);
 set("date_end", input.endDate);
 set("observation", input.note);
 return payload;
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

const BMI_CATEGORIES: Array<{ min: number; status: string }> = [
 { min: 42, status: "Obesity III" },
 { min: 34, status: "Obesity II" },
 { min: 30, status: "Obesity I" },
 { min: 27, status: "Overweight" },
 { min: 25, status: "Normal BL" },
 { min: 18.5, status: "Normal" },
 { min: 10, status: "Underweight" },
];

function bmiStatus(bmi: number): string | undefined {
 return BMI_CATEGORIES.find((c) => bmi > c.min)?.status;
}

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

export function buildVitalsPayload(
 input: RecordVitalsInput,
): Record<string, unknown> {
 const payload: Record<string, unknown> = {
  date: input.date ?? toDateString(new Date()),
 };

 const set = setDefined(payload);

 set("bps", num(input.systolic));
 set("bpd", num(input.diastolic));
 set("pulse", num(input.pulse));
 set("respiration", num(input.respiration));
 set("oxygen_saturation", num(input.oxygenSaturation));

 const weightKg = num(input.weightKg);
 const weightLb =
  weightKg !== undefined
   ? round(convert(weightKg).from("kg").to("lb"), 2)
   : undefined;
 set("weight", weightLb);
 const heightCm = num(input.heightCm);
 const heightIn =
  heightCm !== undefined
   ? round(convert(heightCm).from("cm").to("in"), 2)
   : undefined;
 set("height", heightIn);
 if (weightLb !== undefined && heightIn !== undefined && heightIn > 0) {
  const bmi = round((weightLb / (heightIn * heightIn)) * 703, 2);
  payload.BMI = bmi;
  set("BMI_status", bmiStatus(bmi));
 }
 const temperature = num(input.temperatureC);
 set(
  "temperature",
  temperature !== undefined
   ? round(convert(temperature).from("C").to("F"), 1)
   : undefined,
 );
 const waist = num(input.waistCircumference);
 set(
  "waist_circ",
  waist !== undefined
   ? round(convert(waist).from("cm").to("in"), 2)
   : undefined,
 );
 const head = num(input.headCircumference);
 set(
  "head_circ",
  head !== undefined ? round(convert(head).from("cm").to("in"), 2) : undefined,
 );

 set("temp_method", input.temperatureMethod);
 set("note", input.note);

 return payload;
}

export function buildConditionPayload(
 input: ConditionInput,
): Record<string, unknown> {
 return {
  title: input.title,
  begdate: input.beginDate,
  enddate: input.endDate ?? "",
  diagnosis: input.diagnosis ?? "",
 };
}

export function buildAllergyPayload(
 input: AllergyInput,
): Record<string, unknown> {
 return {
  ...buildConditionPayload(input),
  comments: input.comments ?? "",
 };
}

export function buildMedicationPayload(
 input: MedicationInput,
): Record<string, unknown> {
 return {
  title: input.title,
  begdate: input.beginDate
   ? fromDateString(input.beginDate)
   : toDateTimeString(new Date()),
  enddate: input.endDate ? fromDateString(input.endDate) : "",
  diagnosis: input.diagnosis ?? "",
 };
}
