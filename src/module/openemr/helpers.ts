/** @format */
import { openemr } from "@module/openemr/client.ts";
import type { RegisterInput } from "@module/auth/auth.service.ts";
import DoctorService from "@module/doctor/doctor.service.ts";
import PatientService from "@module/patient/patient.service.ts";
import type { OpenEMRProvision } from "@module/user/helper.ts";
import type { Result } from "@shared/types.ts";
import { toError } from "@shared/error/error.ts";
import { createOpenEMRLogin } from "@module/openemr/admin-ui.ts";

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
    return [null, err];
   }
   try {
    await createOpenEMRLogin({
     username: input.email,
     password: input.password,
     firstName: input.firstName,
     lastName: input.lastName,
     email: input.email,
     npi: input.npi,
     // specialty not included in registration input
    });
   } catch (e) {
    // ignore admin-ui creation errors for now to avoid blocking registration
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
    return [null, err];
   }
   return [{ patientId: created.id ? String(created.id) : undefined }, null];
  }
  if (input.role === "admin") {
   try {
    await createOpenEMRLogin({
     username: input.email,
     password: input.password,
     firstName: input.firstName,
     lastName: input.lastName,
     email: input.email,
     group: "Administrators",
    });
   } catch (e) {
    // best effort; don't block registration
   }
   return [{}, null];
  }
  return [{}, null];
 } catch (e) {
  return [null, toError(e)];
 }
}
