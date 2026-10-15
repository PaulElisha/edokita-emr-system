/** @format */
import APIError from "@error/APIError.ts";
import { openemr } from "@module/openemr/client.ts";
import type { RegisterInput } from "@module/auth/auth.service.ts";
import DoctorService from "@module/doctor/doctor.service.ts";
import PatientService from "@module/patient/patient.service.ts";
import type { OpenEMRProvision } from "@module/user/helper.ts";
import type { Result } from "@shared/types.ts";
import { toError } from "@shared/error/error.ts";

export async function provisionOpenEMR(
 input: RegisterInput,
): Promise<Result<OpenEMRProvision>> {
 try {
  if (input.role === "doctor") {
   const [created, err] = await DoctorService.create(openemr, {
    fname: input.firstName,
    lname: input.lastName,
    email: input.email,
    phone: input.phone,
    npi: input.npi,
   });
   if (err || !created) {
    return [null, err ?? APIError.internalServer("Failed to provision doctor")];
   }
   return [
    { practitionerId: created.id ? String(created.id) : undefined },
    null,
   ];
  }
  if (input.role === "patient") {
   const [created, err] = await PatientService.create(openemr, {
    fname: input.firstName,
    lname: input.lastName,
    birthDate: input.birthDate,
    gender: input.gender,
    email: input.email,
    phone: input.phone,
   });
   if (err || !created) {
    return [
     null,
     err ?? APIError.internalServer("Failed to provision patient"),
    ];
   }
   return [{ patientId: created.id ? String(created.id) : undefined }, null];
  }
  return [{}, null];
 } catch (e) {
  return [null, toError(e)];
 }
}
