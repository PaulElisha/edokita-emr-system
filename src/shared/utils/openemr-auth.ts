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

export const OPENEMR_SCOPE =
 "openid api:fhir api:oemr user/Patient.read user/Patient.write user/Observation.read user/Condition.read user/MedicationRequest.read user/AllergyIntolerance.read user/Immunization.read user/Procedure.read user/Encounter.read user/Practitioner.read user/Practitioner.write user/Appointment.read user/ValueSet.read user/user.rs user/facility.crus user/appointment.cruds user/encounter.crus user/vital.crus user/list.r user/medical_problem.cruds user/allergy.cruds user/medication.cruds user/prescription.crds user/soap_note.crus";

/** Refresh this long before the token actually expires. */
const SKEW_MS = 60_000;
const TOKEN_KEY = "openemr:service-access-token";

function decodeExpiry(token: string): number | null {
 const json = decodeJwtPayload(token);
 return typeof json?.exp === "number" ? json.exp * 1000 : null;
}

/** Absolute expiry (epoch ms) of the remembered token; `0` means "not known yet". */
let expiresAt = 0;

// Seed the cache from OPENEMR_ACCESS_TOKEN when it is still valid.
{
 forget(TOKEN_KEY);
 const token = OpenEMR.accessToken;
 const expiry = token ? decodeExpiry(token) : null;
 if (token && expiry && expiry > Date.now() + SKEW_MS) {
  expiresAt = expiry;
  remember(TOKEN_KEY, () => Promise.resolve(token));
 }
}

async function mint(): Promise<string> {
 const params = new URLSearchParams({
  username: OpenEMR.username,
  password: OpenEMR.password,
  user_role: "users",
  scope: OPENEMR_SCOPE,
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
 expiresAt = Date.now() + ttlMs - SKEW_MS;
 return data.access_token;
}

/**
 * Returns a valid access token, minting a new one when the remembered token is
 * missing/expired. Pass `force` to bypass the cache (e.g. after a 401).
 *
 * `remember` also de-duplicates concurrent mints: the in-flight promise is the
 * remembered value, so parallel callers await a single token request.
 */
export function getAccessToken(force = false): Promise<string> {
 if (force || (expiresAt !== 0 && Date.now() >= expiresAt)) forget(TOKEN_KEY);
 return remember(TOKEN_KEY, mint).catch((e) => {
  forget(TOKEN_KEY);
  expiresAt = 0;
  throw e;
 });
}

export function invalidateAccessToken(): void {
 forget(TOKEN_KEY);
 expiresAt = 0;
}

