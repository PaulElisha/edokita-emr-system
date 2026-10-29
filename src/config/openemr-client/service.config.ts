/** @format */

import { OpenEMR } from "@/env.ts";
import { decodeJwtPayload } from "@auth/jwt.ts";
import {
 authorizationServer,
 getClientAuth,
 oauthClient,
 oauthOptions,
} from "@auth/oauth.ts";
import { forget, remember } from "@epic-web/remember";
import {
 genericTokenEndpointRequest,
 processGenericTokenEndpointResponse,
} from "oauth4webapi";

import { tokenRequest, toTokenSet } from "@module/auth/helper.ts";
import APIError from "@shared/error/APIError.ts";
import { toError } from "@shared/error/error.ts";
import { Result } from "@shared/types.ts";
import { getTokens, saveTokens } from "./utils.ts";

const OpenEMRServiceAccount = {
 SKEW_MS: 60_000,
 TOKEN_KEY: "openemr:service-access-token",
 expiresAt: 0,
 OPENEMR_SCOPE:
  "openid api:fhir api:oemr user/Patient.read user/Patient.write user/Observation.read user/Condition.read user/MedicationRequest.read user/AllergyIntolerance.read user/Immunization.read user/Procedure.read user/Encounter.read user/Practitioner.read user/Practitioner.write user/Appointment.read user/ValueSet.read user/user.rs user/facility.crus user/appointment.cruds user/encounter.crus user/vital.crus user/list.r user/medical_problem.cruds user/allergy.cruds user/medication.cruds user/prescription.crds user/soap_note.crus user/lab_order.crus user/lab_result.crus user/observation.cruds",
};

function decodeExpiry(token: string): number | null {
 const json = decodeJwtPayload(token);
 return typeof json?.exp === "number" ? json.exp * 1000 : null;
}

{
 forget(OpenEMRServiceAccount.TOKEN_KEY);
 const token = OpenEMR.accessToken;
 const expiry = token ? decodeExpiry(token) : null;
 if (token && expiry && expiry > Date.now() + OpenEMRServiceAccount.SKEW_MS) {
  OpenEMRServiceAccount.expiresAt = expiry;
  remember(OpenEMRServiceAccount.TOKEN_KEY, () => Promise.resolve(token));
 }
}

async function mint(): Promise<string> {
 const params = new URLSearchParams({
  username: OpenEMR.username,
  password: OpenEMR.password,
  user_role: "users",
  scope: OpenEMRServiceAccount["OPENEMR_SCOPE"],
 });
 const response = await genericTokenEndpointRequest(
  authorizationServer,
  oauthClient,
  getClientAuth(),
  "password",
  params,
  oauthOptions,
 );
 const data = await processGenericTokenEndpointResponse(
  authorizationServer,
  oauthClient,
  response,
 );
 const ttlMs = (data.expires_in ?? 3600) * 1000;
 OpenEMRServiceAccount.expiresAt =
  Date.now() + ttlMs - OpenEMRServiceAccount.SKEW_MS;
 return data.access_token;
}

export function getAccessToken(force = false): Promise<string> {
 if (
  force ||
  (OpenEMRServiceAccount.expiresAt !== 0 &&
   Date.now() >= OpenEMRServiceAccount.expiresAt)
 )
  forget(OpenEMRServiceAccount.TOKEN_KEY);
 return remember(OpenEMRServiceAccount.TOKEN_KEY, mint).catch((e) => {
  forget(OpenEMRServiceAccount.TOKEN_KEY);
  OpenEMRServiceAccount.expiresAt = 0;
  throw e;
 });
}

const refreshing = new Map<string, Promise<Result<string>>>();

function refreshOpenEMRToken(userId: string): Promise<Result<string>> {
 const existing = refreshing.get(userId);
 if (existing) return existing;

 const promise = mintOpenEMRRefresh(userId).finally(() => {
  refreshing.delete(userId);
 });
 refreshing.set(userId, promise);
 return promise;
}

async function mintOpenEMRRefresh(userId: string): Promise<Result<string>> {
 try {
  const [tokens, err] = await getTokens(userId);
  if (err || !tokens) return [null, err];

  if (!tokens.refreshToken) {
   return [
    null,
    APIError.unauthorized("OpenEMR session expired. Reconnect your account."),
   ];
  }
  if (
   tokens.refreshExpiresAt &&
   tokens.refreshExpiresAt.getTime() <= Date.now()
  ) {
   return [
    null,
    APIError.unauthorized("OpenEMR session expired. Reconnect your account."),
   ];
  }
  const body = new URLSearchParams({
   grant_type: "refresh_token",
   refresh_token: tokens.refreshToken,
  });
  const [data, er] = await tokenRequest(body);
  if (er || !data) {
   return [null, er];
  }
  const [refreshed, error] = toTokenSet(data, tokens);
  if (error || !refreshed) {
   return [null, error];
  }
  const [, ex] = await saveTokens(userId, refreshed);
  if (ex) return [null, ex];
  return [refreshed.accessToken, null];
 } catch (e) {
  return [null, toError(e)];
 }
}

export async function getOpenEMRToken(
 userId: string,
 force = false,
): Promise<Result<string>> {
 try {
  const [tokens, err] = await getTokens(userId);
  if (err || !tokens) {
   return [null, err];
  }

  if (!force && Date.now() < tokens.expiresAt.getTime())
   return [tokens.accessToken, null];

  return await refreshOpenEMRToken(userId);
 } catch (e) {
  return [null, toError(e)];
 }
}
