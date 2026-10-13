/** @format */
import { OpenEMR } from "@/env.ts";

export const OPENEMR_SCOPE =
  "openid api:fhir api:oemr user/Patient.read user/Patient.write user/Observation.read user/Condition.read user/MedicationRequest.read user/AllergyIntolerance.read user/Immunization.read user/Procedure.read user/Encounter.read user/Practitioner.read user/Practitioner.write user/Appointment.read user/Location.read user/Organization.read user/user.rs user/facility.crus user/appointment.cruds user/practitioner.crus user/patient.crus user/encounter.crus user/vital.crus user/allergy.cruds user/medication.cruds user/immunization.rs user/prescription.rs user/procedure.rs user/insurance.crus user/soap_note.crus";

/** Refresh this long before the token actually expires. */
const SKEW_MS = 60_000;

interface CachedToken {
  token: string;
  expiresAt: number;
}

function decodeExpiry(token: string): number | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      exp?: number;
    };
    return typeof json.exp === "number" ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Seed the cache from OPENEMR_ACCESS_TOKEN if it is still valid. */
function seed(): CachedToken | null {
  const token = OpenEMR.accessToken;
  if (!token) return null;
  const expiresAt = decodeExpiry(token);
  if (expiresAt && expiresAt > Date.now() + SKEW_MS) return { token, expiresAt };
  return null;
}

let cached: CachedToken | null = seed();
let inflight: Promise<string> | null = null;

async function mint(): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "password",
    client_id: OpenEMR.clientId,
    username: OpenEMR.username,
    password: OpenEMR.password,
    user_role: "users",
    scope: OPENEMR_SCOPE,
  });

  const response = await fetch(OpenEMR.oauthUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || data.error || !data.access_token) {
    throw new Error(
      `OpenEMR token request failed: ${data.error_description || data.error || response.status}`,
    );
  }

  const ttlMs = (data.expires_in ?? 3600) * 1000;
  cached = { token: data.access_token, expiresAt: Date.now() + ttlMs - SKEW_MS };
  return data.access_token;
}

/**
 * Returns a valid access token, minting a new one when the cached token is
 * missing/expired. Pass `force` to bypass the cache (e.g. after a 401).
 */
export function getAccessToken(force = false): Promise<string> {
  if (!force && cached && Date.now() < cached.expiresAt) {
    return Promise.resolve(cached.token);
  }
  if (inflight) return inflight;
  inflight = mint().finally(() => {
    inflight = null;
  });
  return inflight;
}

export function invalidateAccessToken(): void {
  cached = null;
}
