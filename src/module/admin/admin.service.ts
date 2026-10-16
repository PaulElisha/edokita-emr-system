/** @format */
import type OpenEMRClient from "@module/openemr/client.ts";
import { countResources } from "@module/admin/helper.ts";
import type { Result } from "@shared/types.ts";
import { toError } from "@shared/error/error.ts";

export interface AdminStats {
 patients: number;
 practitioners: number;
 appointments: number;
 encounters: number;
 conditions: number;
 medications: number;
}

export type AdminUser = Record<string, unknown>;

export type AdminFacility = Record<string, unknown>;

export interface CreateAdminInput {
 fname?: string;
 lname?: string;
 email?: string;
 phone?: string;
}

class AdminService {
 stats = async (client: OpenEMRClient): Promise<Result<AdminStats>> => {
  const [
   patients,
   practitioners,
   appointments,
   encounters,
   conditions,
   medications,
  ] = await Promise.all([
   countResources(client, "Patient"),
   countResources(client, "Practitioner"),
   countResources(client, "Appointment"),
   countResources(client, "Encounter"),
   countResources(client, "Condition"),
   countResources(client, "MedicationRequest"),
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

 users = async (client: OpenEMRClient): Promise<Result<AdminUser[]>> => {
  try {
   const users = await client.standardGet<AdminUser>("/api/user");
   return [users, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 facilities = async (
  client: OpenEMRClient,
 ): Promise<Result<AdminFacility[]>> => {
  try {
   const facilities = await client.standardGet<AdminFacility>("/api/facility");
   return [facilities, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };
}

export default new AdminService();
