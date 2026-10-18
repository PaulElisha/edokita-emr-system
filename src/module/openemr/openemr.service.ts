import { OpenEMR } from "@/env.ts";
import {
 codeChallenge,
 codeVerifier,
 randomNonce,
 randomState,
} from "@auth/pkce.ts";
import {
 decodeIdTokenClaims,
 getOpenEMRToken,
 getTokens,
 savePending,
 saveTokens,
 takePending,
 toTokenSet,
 tokenRequest,
 type TokenResponse,
} from "@module/auth/helper.ts";
import {
 findUserById,
 linkOpenEMR,
 toPublicUser,
 type OpenEMRLinkUpdate,
 type OpenEMRCredentials,
 type PublicUser,
} from "@module/user/helper.ts";
import { toError } from "@shared/error/error.ts";
import type { Result } from "@shared/types.ts";
import { withTransaction } from "@db/transaction.ts";
import { z } from "zod";

export const ROLE_SCOPES: Record<string, string> = {
 patient:
  "openid offline_access api:fhir api:oemr patient/Patient.read patient/Observation.read patient/Condition.read patient/MedicationRequest.read patient/AllergyIntolerance.read patient/Immunization.read patient/Procedure.read patient/Encounter.read patient/Appointment.read",
 doctor:
  "openid offline_access api:fhir api:oemr user/Patient.read user/Patient.write user/Observation.read user/Condition.read user/MedicationRequest.read user/AllergyIntolerance.read user/Immunization.read user/Procedure.read user/Encounter.read user/Practitioner.read user/Appointment.read user/appointment.cruds user/encounter.crus user/vital.crus user/list.r user/medical_problem.cruds user/allergy.cruds user/medication.cruds user/prescription.crds user/soap_note.crus user/lab_order.crus user/lab_result.crus",
 admin:
  "openid offline_access api:fhir api:oemr user/Patient.read user/Patient.write user/Practitioner.read user/Practitioner.write user/Observation.read user/Condition.read user/MedicationRequest.read user/AllergyIntolerance.read user/Immunization.read user/Procedure.read user/Encounter.read user/Appointment.read user/user.rs user/facility.crus user/appointment.cruds user/encounter.crus user/vital.crus user/list.r user/medical_problem.cruds user/allergy.cruds user/medication.cruds user/prescription.crds user/soap_note.crus user/lab_order.crus user/lab_result.crus",
 lab:
  "openid offline_access api:fhir api:oemr user/Patient.read user/Observation.read user/Procedure.read user/lab_order.crus user/lab_result.crus",
};

export const callbackQuerySchema = z.object({
 code: z.string().optional(),
 state: z.string().optional(),
 error: z.string().optional(),
 error_description: z.string().optional(),
});
export type CallbackQuery = z.infer<typeof callbackQuerySchema>;

export interface RefreshResult {
 accessToken: string;
 expiresAt: Date | null;
 scope: string | null;
}

export interface AuthorizeResult {
 url: string;
}

class OpenEMRService {
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
   return [toPublicUser(user), null];
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

  await withTransaction(async (tx) => {
   const [, saveErr] = await saveTokens(user.id, tokens, tx);
   if (saveErr) throw saveErr;

   if (Object.keys(link).length === 0) return;

   const [, linkErr] = await linkOpenEMR(user.id, link, tx);
   if (linkErr) throw linkErr;
  });
 }
}

export default new OpenEMRService();
