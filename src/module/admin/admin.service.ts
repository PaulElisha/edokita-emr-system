/** @format */

import { getOpenEMRClient } from "@openemr/context.ts";

import { countResources } from "@module/admin/helper.ts";
import { listOpenEMRUsers } from "@module/openemr/helper.ts";
import type { Result } from "@shared/types.ts";
import { toError } from "@shared/error/error.ts";

interface AdminStats {
 patients: number;
 practitioners: number;
 appointments: number;
 encounters: number;
 conditions: number;
 medications: number;
}

type AdminUser = Record<string, unknown>;

type AdminFacility = Record<string, unknown>;

class AdminService {
 stats = async (): Promise<Result<AdminStats>> => {
  const [
   patients,
   practitioners,
   appointments,
   encounters,
   conditions,
   medications,
  ] = await Promise.all([
   countResources( "Patient"),
   countResources( "Practitioner"),
   countResources( "Appointment"),
   countResources( "Encounter"),
   countResources( "Condition"),
   countResources( "MedicationRequest"),
  ]);

  const err =
   patients[1] ??
   practitioners[1] ??
   appointments[1] ??
   encounters[1] ??
   conditions[1] ??
   medications[1];
  if (err) return [null, err];

  return [
   {
    patients: patients[0] as number,
    practitioners: practitioners[0] as number,
    appointments: appointments[0] as number,
    encounters: encounters[0] as number,
    conditions: conditions[0] as number,
    medications: medications[0] as number,
   },
   null,
  ];
 };

 users = async (): Promise<Result<AdminUser[]>> => {
  try {
   const users = await listOpenEMRUsers();
   return [users as unknown as AdminUser[], null];
  } catch (e) {
   return [null, toError(e, "listOpenEMRUsers")];
  }
 };

 facilities = async (
 ): Promise<Result<AdminFacility[]>> => {
  const client = getOpenEMRClient();
  try {
   const facilities = await client.standardGet<AdminFacility>("/api/facility");
   return [facilities, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };
}

export default new AdminService();
