# Custom helpers replaced by external packages

Each hand-written helper below was removed from `src/` when the corresponding
library was adopted. The original implementation is preserved here for
reference, paired with the package and the exact call that replaced it.

| # | Helper | Was in | Replaced by | Package |
|---|---|---|---|---|
| 1 | PKCE / OIDC values | `src/config/auth/pkce.ts` | `generateRandomState` / `generateRandomNonce` / `generateRandomCodeVerifier` / `calculatePKCECodeChallenge` | `oauth4webapi ^3.8.8` |
| 2 | Date / time formatting | `src/shared/utils/date.ts` | `format` | `date-fns ^4.4.0` |
| 3 | Date math | `src/module/appointment/helper.ts` | `addMinutes` / `differenceInSeconds` / `isAfter` | `date-fns ^4.4.0` |
| 4 | Age from birth date | `src/shared/utils/fhir-mapper.ts` | `differenceInYears` | `date-fns ^4.4.0` |
| 5 | Unit conversion (vitals) | `src/module/emr/helper.ts` | `convert().from().to()` | `convert-units ^2.3.4` |
| 6 | OAuth token request | `src/module/auth/helper.ts` | `genericTokenEndpointRequest` + `processGenericTokenEndpointResponse` | `oauth4webapi ^3.8.8` |
| 7 | Service token mint / cache | `src/shared/utils/openemr-auth.ts` | `genericTokenEndpointRequest` + `processGenericTokenEndpointResponse` + `remember` | `oauth4webapi ^3.8.8`, `@epic-web/remember ^1.1.0` |
| 8 | BMI category lookup | `src/module/emr/helper.ts` | `BMI_CATEGORIES` lookup | *(local refactor, no package)* |
| 9 | Inactivity check | `src/module/auth/helper.ts` | `isBefore` + `subDays` | `date-fns ^4.4.0` |
| 10 | Opaque token generation | `src/module/auth/helper.ts` | `generateRandomState` | `oauth4webapi ^3.8.8` |
| 11 | Secret encryption at rest | `src/shared/utils/secret.ts` | `CompactEncrypt` / `compactDecrypt` | `jose ^6.2.12` |

---

## 1. PKCE / OIDC values

**Was in:** `src/config/auth/pkce.ts`
**Replaced by:** `oauth4webapi` → `generateRandomState()`, `generateRandomNonce()`,
`generateRandomCodeVerifier()`, `calculatePKCECodeChallenge()`

```ts
// original custom implementation
import { createHash, randomBytes } from "node:crypto";

function base64url(input: Buffer): string {
 return input
  .toString("base64")
  .replace(/\+/g, "-")
  .replace(/\//g, "_")
  .replace(/=+$/, "");
}

function randomString(bytes = 32): string {
 return base64url(randomBytes(bytes));
}

export function randomState(): string {
 return randomString();
}

export function randomNonce(): string {
 return randomString();
}

export function codeVerifier(): string {
 return randomString(48);
}

export function codeChallenge(verifier: string): string {
 return base64url(createHash("sha256").update(verifier).digest());
}
```

```ts
// current: src/config/auth/pkce.ts
import {
 calculatePKCECodeChallenge,
 generateRandomCodeVerifier,
 generateRandomNonce,
 generateRandomState,
} from "oauth4webapi";

export function randomState(): string {
 return generateRandomState();
}

export function randomNonce(): string {
 return generateRandomNonce();
}

export function codeVerifier(): string {
 return generateRandomCodeVerifier();
}

// NOTE: the package's challenge is async (returns a Promise) where the custom
// helper was sync.
export function codeChallenge(verifier: string): Promise<string> {
 return calculatePKCECodeChallenge(verifier);
}
```

---

## 2. Date / time formatting

**Was in:** `src/shared/utils/date.ts`
**Replaced by:** `date-fns` → `format(date, pattern)`

```ts
// original custom implementation
function pad(value: number): string {
 return String(value).padStart(2, "0");
}

export function toDateString(date: Date): string {
 return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toTimeString(date: Date): string {
 return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
```

```ts
// current: src/shared/utils/date.ts
import { format } from "date-fns";

export function toDateString(date: Date): string {
 return format(date, "yyyy-MM-dd");
}

export function toTimeString(date: Date): string {
 return format(date, "HH:mm");
}
```

---

## 3. Date math

**Was in:** `src/module/appointment/helper.ts`
**Replaced by:** `date-fns` → `addMinutes()`, `differenceInSeconds()`, `isAfter()`

```ts
// original custom implementation
function addMinutes(date: Date, minutes: number): Date {
 return new Date(date.getTime() + minutes * 60_000);
}

function differenceInSeconds(a: Date, b: Date): number {
 return Math.round((a.getTime() - b.getTime()) / 1_000);
}

function isAfter(a: Date, b: Date): boolean {
 return a.getTime() > b.getTime();
}
```

```ts
// current: src/module/appointment/helper.ts
import { addMinutes, differenceInSeconds, isAfter } from "date-fns";

const end = addMinutes(start, input.durationMinutes ?? DEFAULT_DURATION_MINUTES);

const secondsLeft = differenceInSeconds(
 new Date(booking.window.end),
 start,
);

while (cursor <= dayEnd && !isAfter(end, dayEnd)) { /* slot walk */ }
```

---

## 4. Age from birth date

**Was in:** `src/shared/utils/fhir-mapper.ts`
**Replaced by:** `date-fns` → `differenceInYears()`

```ts
// original custom implementation
export function calcAge(birthDate: string): number {
 const dob = new Date(birthDate);
 const now = new Date();
 let age = now.getFullYear() - dob.getFullYear();
 const m = now.getMonth() - dob.getMonth();
 if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age -= 1;
 return age < 0 ? 0 : age;
}
```

```ts
// current: src/shared/utils/fhir-mapper.ts
import { differenceInYears, isBefore } from "date-fns";

export function calcAge(birthDate: string): number {
 const age = differenceInYears(new Date(), new Date(birthDate));
 return age < 0 ? 0 : age;
}
```

---

## 5. Unit conversion (vitals)

**Was in:** `src/module/emr/helper.ts`
**Replaced by:** `convert-units` → `convert(value).from(unit).to(unit)`
(`round()` and `num()` are still local helpers in that file.)

```ts
// original custom implementation, inside buildVitalsPayload()
const weight = num(input.weightKg);
if (weight !== undefined) payload.weight = round(weight * 2.2046226218, 2); // kg -> lb

const height = num(input.heightCm);
if (height !== undefined) payload.height = round(height / 2.54, 2); // cm -> in

const temperature = num(input.temperatureC);
if (temperature !== undefined) {
 payload.temperature = round((temperature * 9) / 5 + 32, 1); // C -> F
}

const waist = num(input.waistCircumference);
if (waist !== undefined) payload.waist_circ = round(waist / 2.54, 2); // cm -> in

const head = num(input.headCircumference);
if (head !== undefined) payload.head_circ = round(head / 2.54, 2); // cm -> in
```

```ts
// current: src/module/emr/helper.ts
import convert from "convert-units";

payload.weight =
 weightKg !== undefined ? round(convert(weightKg).from("kg").to("lb"), 2) : undefined;

payload.height =
 heightCm !== undefined ? round(convert(heightCm).from("cm").to("in"), 2) : undefined;

payload.temperature =
 temperature !== undefined
  ? round(convert(temperature).from("C").to("F"), 1)
  : undefined;

payload.waist_circ =
 waist !== undefined ? round(convert(waist).from("cm").to("in"), 2) : undefined;

payload.head_circ =
 head !== undefined ? round(convert(head).from("cm").to("in"), 2) : undefined;
```

The reverse direction (OpenEMR imperial → metric display) uses the same helper:

```ts
return { value: round(convert(v).from("in").to("cm"), 1), unit: "cm" };
return { value: round(convert(v).from("lb").to("kg"), 2), unit: "kg" };
return { value: round(convert(v).from("F").to("C"), 1), unit: "Cel" };
```

---

## 6. OAuth token request

**Was in:** `src/module/auth/helper.ts`
**Replaced by:** `oauth4webapi` → `genericTokenEndpointRequest()` +
`processGenericTokenEndpointResponse()`

```ts
// original custom implementation
export async function tokenRequest(
 body: URLSearchParams,
): Promise<Result<TokenResponse>> {
 try {
  const res = await fetch(OpenEMR.oauthUrl, {
   method: "POST",
   headers: { "Content-Type": "application/x-www-form-urlencoded" },
   body,
  });
  const data = await res.json();
  if (!res.ok || data.error || !data.access_token) {
   return [
    null,
    APIError.openEmr(
     `OpenEMR token request failed: ${data.error_description || data.error || res.status}`,
     res.status,
    ),
   ];
  }
  return [data, null];
 } catch (e) {
  return [null, toError(e)];
 }
}
```

```ts
// current: src/module/auth/helper.ts
import {
 genericTokenEndpointRequest,
 processGenericTokenEndpointResponse,
} from "oauth4webapi";

const response = await genericTokenEndpointRequest(
 authorizationServer,
 oauthClient,
 getClientAuth(),
 grantType,
 params,
 oauthOptions,
);

const data = await processGenericTokenEndpointResponse(
 authorizationServer,
 oauthClient,
 response,
);
```

The package validates the token response per RFC 6749, which removes the
manual `data.error` / `res.ok` checks.

---

## 7. Service token mint / cache

**Was in:** `src/shared/utils/openemr-auth.ts`
**Replaced by:** `oauth4webapi` → `genericTokenEndpointRequest()` +
`processGenericTokenEndpointResponse()`, and `@epic-web/remember` → `remember()`
(cache + in-flight de-duplication).

```ts
// original custom implementation
function seed(): { token: string; expiresAt: number } | null {
 const token = OpenEMR.accessToken;
 if (!token) return null;
 const expiresAt = decodeExpiry(token);
 if (expiresAt && expiresAt > Date.now() + SKEW_MS) return { token, expiresAt };
 return null;
}

let cached = seed();
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
 const data = await response.json();
 if (!response.ok || data.error || !data.access_token) {
  throw new Error(
   `OpenEMR token request failed: ${data.error_description || data.error || response.status}`,
  );
 }
 const ttlMs = (data.expires_in ?? 3600) * 1000;
 cached = { token: data.access_token, expiresAt: Date.now() + ttlMs - SKEW_MS };
 return data.access_token;
}

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
```

```ts
// current: src/shared/utils/openemr-auth.ts
import { forget, remember } from "@epic-web/remember";
import {
 genericTokenEndpointRequest,
 processGenericTokenEndpointResponse,
} from "oauth4webapi";

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

export function getAccessToken(force = false): Promise<string> {
 if (force || (expiresAt !== 0 && Date.now() >= expiresAt)) forget(TOKEN_KEY);
 return remember(TOKEN_KEY, mint).catch((e) => {
  forget(TOKEN_KEY);
  expiresAt = 0;
  throw e;
 });
}
```

`remember()` takes over the two responsibilities the custom code hand-rolled:
value caching and single-flight de-duplication of concurrent mints.

---

## 8. BMI category lookup

**Was in:** `src/module/emr/helper.ts`
**Replaced by:** local `BMI_CATEGORIES` table lookup — *no external package*.

```ts
// original custom implementation
function bmiStatus(bmi: number): string | undefined {
 if (bmi > 42) return "Obesity III";
 if (bmi > 34) return "Obesity II";
 if (bmi > 30) return "Obesity I";
 if (bmi > 27) return "Overweight";
 if (bmi > 25) return "Normal BL";
 if (bmi > 18.5) return "Normal";
 if (bmi > 10) return "Underweight";
 return undefined;
}
```

```ts
// current: src/module/emr/helper.ts
/** OpenEMR's BMI category boundaries; value matches the `BmiCategory` enum it stores. */
const BMI_CATEGORIES: Array<{ min: number; status: string }> = [
 { min: 42, status: "Obesity III" },
 { min: 34, status: "Obesity II" },
 { min: 30, status: "Obesity I" },
 { min: 27, status: "Overweight" },
 { min: 25, status: "Normal BL" },
 { min: 18.5, status: "Normal" },
 { min: 10, status: "Underweight" },
];

function bmiStatus(bmi: number): string | undefined {
 return BMI_CATEGORIES.find((c) => bmi > c.min)?.status;
}
```

Behaviour is identical; the refactor only moved the bounds into data so the
OpenEMR `BmiCategory` enum and the ladder cannot drift apart.

---

## 9. Inactivity check

**Was in:** `src/module/auth/helper.ts`
**Replaced by:** `date-fns` → `isBefore()` + `subDays()`

```ts
// original custom implementation
const IDLE_TTL_MS = 3 * 24 * 60 * 60 * 1000;

export function isIdle(lastActivity: Date): boolean {
 return Date.now() - lastActivity.getTime() >= IDLE_TTL_MS;
}
```

```ts
// current: src/module/auth/helper.ts
import { isBefore, subDays } from "date-fns";

const IDLE_WINDOW_DAYS = 3;

export function isIdle(lastActivity: Date): boolean {
 return isBefore(lastActivity, subDays(new Date(), IDLE_WINDOW_DAYS));
}
```

The window is now expressed in calendar days rather than a hand-rolled
millisecond product.

---

## 10. Opaque token generation

**Was in:** `src/module/auth/helper.ts`
**Replaced by:** `oauth4webapi` → `generateRandomState()`

```ts
// original custom implementation
import { randomBytes } from "node:crypto";

function generateToken(): string {
 return randomBytes(32).toString("base64url");
}
```

```ts
// current: src/module/auth/helper.ts
import { generateRandomState } from "oauth4webapi";

function generateToken(): string {
 return generateRandomState();
}
```

`generateRandomState()` is the same 32 random bytes rendered as a base64url
string (43 chars), so token entropy and wire format are unchanged. `hashToken`
still uses `node:crypto`'s `createHash` — a one-line SHA-256 has no package
equivalent worth adopting.

---

## 11. Secret encryption at rest

**Was in:** `src/shared/utils/secret.ts`
**Replaced by:** `jose` → `CompactEncrypt` / `compactDecrypt` (compact JWE,
`dir` / `A256GCM`)

```ts
// original custom implementation (AES-256-GCM via node:crypto)
const ENCRYPTED_PREFIX = "enc.v1.";

function encryptionKey(): Buffer {
 const material = Env.TOKEN_ENCRYPTION_KEY || Env.APP_JWT_PRIVATE_KEY ||
  readFileSync(resolve(process.cwd(), "private-key.pem"), "utf8");
 return createHash("sha256").update(material).digest();
}

export function encryptSecret(value: string): string {
 const iv = randomBytes(12);
 const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
 const enc = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
 return `${ENCRYPTED_PREFIX}${Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64")}`;
}

export function decryptSecret(value: string): string {
 if (!value.startsWith(ENCRYPTED_PREFIX)) return value;
 const raw = Buffer.from(value.slice(ENCRYPTED_PREFIX.length), "base64");
 const iv = raw.subarray(0, 12), tag = raw.subarray(12, 28), data = raw.subarray(28);
 const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv);
 decipher.setAuthTag(tag);
 return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
```

```ts
// current: src/shared/utils/secret.ts
import { CompactEncrypt, compactDecrypt } from "jose";

function encryptionKey(): Uint8Array {
 const material = Env.TOKEN_ENCRYPTION_KEY || Env.APP_JWT_PRIVATE_KEY ||
  readFileSync(resolve(process.cwd(), "private-key.pem"), "utf8");
 return new Uint8Array(createHash("sha256").update(material).digest());
}

export async function encryptSecret(value: string): Promise<string> {
 return await new CompactEncrypt(new TextEncoder().encode(value))
  .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
  .encrypt(encryptionKey());
}

export async function decryptSecret(value: string): Promise<string> {
 if (value.split(".").length !== 5) return value;
 const { plaintext } = await compactDecrypt(value, encryptionKey());
 return new TextDecoder().decode(plaintext);
}
```

`jose`'s API is asynchronous (`encrypt` / `compactDecrypt` return promises), so
both helpers became `async`; the callers in `src/module/user/helper.ts`
(`saveOpenEMRCredentials`, `getOpenEMRCredentials`) were updated to `await`. The
key derivation is unchanged (SHA-256 of the same key material). Existing
`enc.v1.*` rows in `app_users.openemr_password` were re-encrypted to the JWE
format by a one-off migration before the legacy branch was dropped.
