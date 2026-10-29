/** @format */

import { OpenEMR } from "@/env.ts";
import {
 codeChallenge,
 codeVerifier,
 randomNonce,
 randomState,
} from "@auth/pkce.ts";
import {
 decodeIdTokenClaims,
 savePending,
 takePending,
 toTokenSet,
 tokenRequest,
 type TokenResponse,
} from "@module/auth/helper.ts";
import { getOpenEMRToken } from "@openemr/service.config.ts";

import { getTokens, saveTokens } from "@openemr/utils.ts";
import {
 findUserById,
 linkOpenEMR,
 type OpenEMRLinkUpdate,
 type OpenEMRCredentials,
 type PublicUser,
} from "@module/user/helper.ts";
import { toError } from "@shared/error/error.ts";
import type { Result } from "@shared/types.ts";
import { Transactional } from "@db/transaction.ts";
import { z } from "zod";
import { RegisterInput } from "@module/auth/auth.service.ts";
import {
 generateOpenEMRPassword,
 OpenEMRProvisionResult,
 resolveAccountByEmail,
} from "./helper.ts";
import { createOpenEMRLogin } from "./admin-ui.ts";
import { openemr } from "@openemr/client.ts";
import { runWithOpenEMR } from "@openemr/context.ts";

import PatientService from "@module/patient/patient.service.ts";

export const ROLE_SCOPES: Record<string, string> = {
 patient:
  "openid offline_access api:fhir api:oemr patient/Patient.read patient/Observation.read patient/Condition.read patient/MedicationRequest.read patient/AllergyIntolerance.read patient/Immunization.read patient/Procedure.read patient/Encounter.read patient/Appointment.read patient/observation.rs",
 doctor:
  "openid offline_access api:fhir api:oemr user/Patient.read user/Patient.write user/Observation.read user/Condition.read user/MedicationRequest.read user/AllergyIntolerance.read user/Immunization.read user/Procedure.read user/Encounter.read user/Practitioner.read user/Appointment.read user/appointment.cruds user/encounter.crus user/vital.crus user/list.r user/medical_problem.cruds user/allergy.cruds user/medication.cruds user/prescription.crds user/soap_note.crus user/lab_order.crus user/lab_result.crus user/observation.cruds",
 admin:
  "openid offline_access api:fhir api:oemr user/Patient.read user/Patient.write user/Practitioner.read user/Practitioner.write user/Observation.read user/Condition.read user/MedicationRequest.read user/AllergyIntolerance.read user/Immunization.read user/Procedure.read user/Encounter.read user/Appointment.read user/user.rs user/facility.crus user/appointment.cruds user/encounter.crus user/vital.crus user/list.r user/medical_problem.cruds user/allergy.cruds user/medication.cruds user/prescription.crds user/soap_note.crus user/lab_order.crus user/lab_result.crus user/observation.cruds",
 lab: "openid offline_access api:fhir api:oemr user/Patient.read user/Observation.read user/Procedure.read user/lab_order.crus user/lab_result.crus user/observation.rs",
};

const callbackQuerySchema = z.object({
 code: z.string().optional(),
 state: z.string().optional(),
 error: z.string().optional(),
 error_description: z.string().optional(),
});
export type CallbackQuery = z.infer<typeof callbackQuerySchema>;

interface RefreshResult {
 accessToken: string;
 expiresAt: Date | null;
 scope: string | null;
}

interface AuthorizeResult {
 url: string;
}

class OpenEMRService {
 provisionOpenEMR = async (
  input: RegisterInput,
 ): Promise<Result<OpenEMRProvisionResult>> => {
  try {
   if (input.role === "doctor" || input.role === "lab") {
    const password = generateOpenEMRPassword();
    const [, createErr] = await createOpenEMRLogin({
     username: input.email,
     password,
     firstName: input.firstName,
     lastName: input.lastName,
     email: input.email,
     npi: input.npi,
     group: input.role === "doctor" ? "Physicians" : "Clinicians",
    });
    if (createErr) return [null, createErr];

    const [account, aErr] = await runWithOpenEMR(openemr, () =>
     resolveAccountByEmail(input.email),
    );
    if (aErr || !account) return [null, aErr];
    return [
     {
      link: { practitionerId: account.uuid },
      credentials: { username: input.email, password },
     },
     null,
    ];
   }

   if (input.role === "patient") {
    const [created, err] = await runWithOpenEMR(openemr, () =>
     PatientService.create({
      fname: input.firstName,
      lname: input.lastName,
      birthDate: input.birthDate,
      gender: input.gender,
      email: input.email,
      phone: input.phone,
     }),
    );
    if (err || !created) return [null, err];
    return [
     {
      link: {
       patientId: created.id ? String(created.id) : undefined,
       patientPid: created.pid,
      },
     },
     null,
    ];
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
    } catch {
     // Admins can log into OpenEMR later; never block registration on this.
    }
   }
   return [{ link: {} }, null];
  } catch (e) {
   return [null, toError(e, "provisionOpenEMR")];
  }
 };

 refresh = async (userId: string): Promise<Result<RefreshResult>> => {
  const [accessToken, err] = await getOpenEMRToken(userId, true);
  if (err || !accessToken) return [null, err];
  const [tokens] = await getTokens(userId);
  return [
   {
    accessToken,
    expiresAt: tokens?.expiresAt ?? null,
    scope: tokens?.scope ?? null,
   },
   null,
  ];
 };

 startAuthorization = async (
  userId: string,
 ): Promise<Result<AuthorizeResult>> => {
  const [user, err] = await findUserById(userId);
  if (err || !user) return [null, err];
  const state = randomState();
  const nonce = randomNonce();
  const verifier = codeVerifier();
  const [, ex] = await savePending(state, {
   userId,
   verifier,
   nonce,
   createdAt: Date.now(),
  });
  if (ex) return [null, ex];

  const params = new URLSearchParams({
   response_type: "code",
   client_id: OpenEMR.clientId,
   redirect_uri: OpenEMR.redirectUri,
   scope: ROLE_SCOPES[user.role],
   state,
   nonce,
   code_challenge: await codeChallenge(verifier),
   code_challenge_method: "S256",
  });
  return [{ url: `${OpenEMR.authorizeUrl}?${params.toString()}` }, null];
 };

 handleCallback = async (
  code: string,
  state: string,
 ): Promise<Result<PublicUser>> => {
  try {
   const [pending, err] = await takePending(state);
   if (err || !pending) {
    return [null, err];
   }
   const [user, er] = await findUserById(pending.userId);
   if (er || !user) return [null, er];

   const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: OpenEMR.redirectUri,
    client_id: OpenEMR.clientId,
    client_secret: OpenEMR.clientSecret,
    code_verifier: pending.verifier,
   });
   const [data, error] = await tokenRequest(body);
   if (error || !data) {
    return [null, error];
   }

   await this.persistConnection(user, data);
   return [user, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 connectWithCredentials = async (
  userId: string,
  credentials: OpenEMRCredentials,
 ): Promise<Result<void>> => {
  try {
   const [user, uErr] = await findUserById(userId);
   if (uErr || !user) return [null, uErr];
   const body = new URLSearchParams({
    grant_type: "password",
    username: credentials.username,
    password: credentials.password,
    user_role: "users",
    scope: ROLE_SCOPES[user.role] ?? ROLE_SCOPES.doctor,
   });
   const [data, err] = await tokenRequest(body);
   if (err || !data) return [null, err];
   await this.persistConnection(user, data);
   return [undefined, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 @Transactional()
 private async persistConnection(
  user: PublicUser,
  data: TokenResponse,
 ): Promise<void> {
  const [tokens, err] = toTokenSet(data);
  if (err || !tokens) {
   throw err;
  }

  const [claims, error] = decodeIdTokenClaims(data.id_token);
  if (error || !claims) throw error;

  const link: OpenEMRLinkUpdate = {};
  if (claims.subject) link.subject = claims.subject;
  if (claims.fhirUser) link.fhirUser = claims.fhirUser;

  const [, saveErr] = await saveTokens(user.id, tokens);
  if (saveErr) throw saveErr;

  if (Object.keys(link).length === 0) return;

  const [, linkErr] = await linkOpenEMR(user.id, link);
  if (linkErr) throw linkErr;
 }
}

export default new OpenEMRService();
