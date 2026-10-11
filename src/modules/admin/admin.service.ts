/** @format */
import { openemr } from "../../lib/openemr.ts";

export interface AdminStats {
  patients: number;
  practitioners: number;
  appointments: number;
  encounters: number;
  conditions: number;
  medications: number;
}

async function count(resourceType: string, params: Record<string, string | number> = {}): Promise<number> {
  const bundle = await openemr.fhirSearch(resourceType, { ...params, _count: 1 });
  return bundle.total ?? 0;
}

export async function getStats(): Promise<AdminStats> {
  const [patients, practitioners, appointments, encounters, conditions, medications] =
    await Promise.all([
      count("Patient"),
      count("Practitioner"),
      count("Appointment"),
      count("Encounter"),
      count("Condition"),
      count("MedicationRequest"),
    ]);

  return { patients, practitioners, appointments, encounters, conditions, medications };
}

export async function listUsers() {
  return openemr.standardGet("/api/user");
}

export async function listFacilities() {
  return openemr.standardGet("/api/facility");
}