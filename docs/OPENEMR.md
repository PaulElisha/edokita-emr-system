# OpenEMR Integration Guide (E‑Dokita EMR Backend)

A from‑scratch, first‑principles guide to how this backend talks to OpenEMR: registering accounts,
app authentication, per‑user role authentication, the service account, and how to drive OpenEMR
both from its dashboard and programmatically.

If you know nothing about OpenEMR, read §1–§3 first. Everything else is reference.

> Conventions in this repo: Express 5 + Drizzle (Postgres) + Zod + `jose`. Every fallible
> helper/service returns a `Result<T> = [T | null, Error | null]` tuple; callers destructure it.
> Input is validated with Zod at the route layer via `validate(schema, source)`.

---

## 1. What OpenEMR is, and how it's wired here

OpenEMR is a full‑featured, open‑source **electronic medical records** (EMR) application. It is a
PHP app with its own MySQL/MariaDB database, its own user accounts (separate from ours), its own
web UI/dashboard, and two HTTP APIs we consume:

- **Standard REST API** — OpenEMR‑shaped JSON (e.g. `{ data: [...] }` envelopes, `pc_*` field names
  for calendar/encounter tables). Base: `/apis/default`.
- **FHIR R4 API** — standards‑based healthcare resources (`Patient`, `Practitioner`,
  `Observation`, `Encounters`, …). Base: `/apis/default/fhir`.

Both APIs are protected by **OAuth2**. There is no "just call it with a password" path — you need a
bearer token. This repo supports two ways to get one (§6 and §7).

### Local topology (docker-compose.yml)

| Service | Image | Host port | Purpose |
|---|---|---|---|
| `postgres` | `postgres:16` | `5432` | **Our** app database (`edokita`) — app users, tokens, auth states |
| `mysql` | `mariadb:10.11` | (internal) | **OpenEMR's** database (`openemr`) |
| `openemr` | `openemr/openemr:latest` | `8400` → 80, `8401` → 443 | The OpenEMR app + APIs |

- OpenEMR version in use: **8.4.1**.
- Container name: `e-dokitaemrsystem-openemr-1`.
- OpenEMR UI/API root: `http://localhost:8400`.
- Everything downstream is derived from `OPENEMR_URL` in `env.ts` (single source of truth):
  - token: `$OPENEMR_URL/oauth2/default/token`
  - authorize: `$OPENEMR_URL/oauth2/default/authorize`
  - standard API: `$OPENEMR_URL/apis/default`
  - FHIR: `$OPENEMR_URL/apis/default/fhir`

### Two identity systems — the core mental model

There are **two** sets of accounts and you must keep them straight:

1. **Our app identity** — `app_users` in Postgres. This is what a person logs into our API with
   (email + password → our own RS256 JWT). Roles: `patient | doctor | admin`.
2. **OpenEMR identity** — `users`/`patient_data` in OpenEMR's DB, managed by OpenEMR. Ours is linked
   to theirs (see §4).

When a user registers with us, we create an OpenEMR **Patient** or **Practitioner** record and store
its id on our user row. When that user then wants OpenEMR data in their own context, they connect
their account over OAuth (§6), and OpenEMR issues tokens scoped to *them*. For background/system
work we use a shared **service account** (§7).

---

## 2. Running OpenEMR locally

```bash
docker compose up -d           # postgres + mysql + openemr
docker ps                      # wait until openemr is Up
open http://localhost:8400     # OpenEMR login page
```

- Default admin login for the dev stack: user `admin`, password = `OE_PASS` /
  `OPENEMR_PASSWORD` (see `.env`). At the login screen choose
  **`user_role = api`** when driving the API.
- First load may be slow (OpenEMR runs its setup). If the app sits in a "wait loop", give it a few
  minutes.

### One‑time OpenEMR configuration (globals)

These settings were applied in the OpenEMR DB (`openemr` database, `globals` table) and are required
for the APIs to work:

| Global | Value | Why |
|---|---|---|
| `rest_api` | `1` | Enable the Standard REST API |
| `rest_fhir_api` | `1` | Enable the FHIR API |
| `oauth_password_grant` | `3` | Allow the password grant (used by the service account) |
| `site_addr_oath` | `http://localhost:8400` | OAuth issuer/site address |

Example (against the `openemr` DB inside the MySQL container):

```sql
UPDATE globals SET gl_value = 1 WHERE gl_name = 'rest_api';
UPDATE globals SET gl_value = 1 WHERE gl_name = 'rest_fhir_api';
UPDATE globals SET gl_value = 3 WHERE gl_name = 'oauth_password_grant';
UPDATE globals SET gl_value = 'http://localhost:8400' WHERE gl_name = 'site_addr_oath';
```

### Registering the OAuth client (the app integration credentials)

OpenEMR needs a registered OAuth client so our backend can request tokens. In the OpenEMR UI:

**Administration → System → API Clients → Register New App**, then:

- **Redirect URI**: `http://localhost:8000/api/openemr/callback` (must exactly match
  `OPENEMR_REDIRECT_URI`).
- **Grant types**: enable `authorization_code`, `refresh_token`, `password` (and, if you want the
  SMART Bulk path, `client_credentials` — see §7.3).
- **Scope**: at minimum `openid`, `offline_access`, `api:fhir`, `api:oemr`. **This list is the
  ceiling** — every specific scope requested per flow (§8) must also appear here, or OpenEMR silently
  drops it. In particular, the standard‑API v2 scopes `user/list.r user/appointment.cruds
  user/encounter.crus user/vital.crus user/user.rs user/facility.crus` must be registered.
- Copy the generated **Client ID** and **Client Secret** into `.env`
  (`OPENEMR_CLIENT_ID`, `OPENEMR_CLIENT_SECRET`).

> In the current dev setup the client is already registered:
> `OPENEMR_CLIENT_ID=NnvxL8Buakb3PUyWSOskcSrZYABp47m-Mgq6QHG7FUI`
> (secret lives only in `.env` — never commit it).

---

## 3. The three OpenEMR auth methods (and which we use)

| Method | Who it authenticates | Used here for |
|---|---|---|
| **Authorization Code + PKCE + OIDC** | A specific OpenEMR user (the person) | Per‑user access — "connect your OpenEMR account" (§6) |
| **Password grant** | A configured OpenEMR username/password | Service account for provisioning + system/admin background work (§7) |
| **Client credentials + `private_key_jwt`** | OpenEMR "system user" | Not enabled; only viable via JWT assertion (§7.3) |

Our repository runs a **hybrid**: **staff** (doctor/admin) use per‑user OAuth tokens for their
resource routes, while the password‑grant **service account** handles provisioning, system/admin
endpoints, and **all patient‑facing routes** (patients cannot obtain a patient‑context token through
the provider login, and OpenEMR forbids patient‑context writes — see §8).

---

## 4. Registering an account

Endpoint: `POST /api/auth/register` (public). Validated by `registerSchema`
(`src/module/auth/auth.service.ts:45`).

### Request body

```jsonc
{
  "email": "jane@example.com",
  "password": "at-least-8-chars",
  "role": "patient",            // "patient" | "doctor" | "admin"
  "firstName": "Jane",
  "lastName": "Doe",
  "phone": "+15551234567",
  "birthDate": "1990-05-01",
  "gender": "female",           // male | female | other | unknown
  "clinicId": "optional-tag",   // free-form, no FK; not used for authz
  "npi": "1234567890"           // REQUIRED when role === "doctor"
}
```

Notes:
- `role` is validated by `roleSchema` (`patient|doctor|admin`).
- `npi` is optional in general but enforced for doctors by a Zod `.superRefine()` — registering a
  doctor without it fails with **422** `npi is required for doctors`.
- `clinicId` is stored on `app_users.clinic_id` (nullable) as a free‑form tenant tag. It is **not**
  read for authorization and has no FK/table.

### What happens (order of operations)

`AuthService.register` (`auth.service.ts:103`):

1. Reject if a user with that email already exists → `409`.
2. **Provision in OpenEMR** via `provisionOpenEMR(input)` (`src/module/openemr/helpers.ts:10`):
   - role `doctor` → `DoctorService.create({ fname, lname, email, phone, npi })` → a FHIR
     **Practitioner**; we keep its `practitionerId`.
   - role `patient` → `PatientService.create({ fname, lname, birthDate, gender, email, phone })` →
     a FHIR **Patient**; we keep its `patientId`.
   - role `admin` → no OpenEMR record (`{}`).
3. Hash the password (`hashPassword`) and `createUser(...)` in Postgres, storing the OpenEMR ids
   (`app_users.openemr_patient_id` / `openemr_practitioner_id`).
4. Sign our app JWT and return it.

### Response

```jsonc
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "jane@example.com",
      "role": "patient",
      "firstName": "Jane",
      "lastName": "Doe",
      "openemr": { "patientId": "a2fb1830-…" },   // or { "practitionerId": "…" } for doctors
      "createdAt": "…"
    },
    "token": "eyJ…"                                 // our app JWT (12h)
  }
}
```

> `openemr.connected` becomes true only after the user completes the OAuth consent flow (§6).

### Critical OpenEMR‑create facts (why provisioning is written the way it is)

- **FHIR create returns an *envelope*, not a resource.** `Patient` create → `{ pid, uuid }`;
  `Practitioner` create → `{ id, uuid }`. The code uses **`uuid`** as the id for both FHIR reads and
  the Standard API (`createdResourceId()` prefers `uuid`, then `id`). See `open-emr.ts:20`.
  - `GET /apis/default/api/patient/{uuid}` → 200; with the numeric `pid` → 400.
- After creating, the service re‑reads the resource by that id (`fhirRead`) and maps it, because the
  create response has no full resource.
- **Practitioner requires `npi`** — otherwise OpenEMR returns **400** `npi must be provided`. Our
  builder sends it as an identifier: `{ system: "http://hl7.org/fhir/sid/us-npi", value: npi }`
  (`doctor/helper.ts:11`).
- **FHIR Practitioner writes are lossy.** `FhirPractitionerService::parseFhirResource` only persists:
  `name` (`family`/`given`), the NPI identifier, phones (`work`→`phonew1`, `home`→`phone`,
  `mobile`→`phonecell`), `email`, and `address` (`line`/`city`/`state`/`zip` — no `country`). It
  **silently drops** `name.prefix` (title), `name.suffix`, `qualification`/specialty, a state‑license
  identifier, `fax`, and `address.country` — verified by live round‑trip. Our builder still sends the
  full shape (`doctor/helper.ts`) so the API surface is complete and future OpenEMR versions can
  persist more, but `mapPractitioner` will only read back what OpenEMR kept.
- **Patient create requires a proper name + telecom** — `name[].use:"official"` and at least a
  `telecom` entry, else OpenEMR 400s with `fname must be provided`/`lname must be provided`. See
  `buildHumanName` / `buildContactPoints` in `src/shared/utils/fhir.ts`.

---

## 5. App authentication (our own JWT)

### Login

`POST /api/auth/login` (public) — `loginSchema`:

```jsonc
{ "email": "jane@example.com", "password": "…" }
```

Returns the same shape as register: `{ user, token }`, or **401** `Invalid email or password`.

### The token

- Signed by `signAppToken` (`src/config/auth/jwt.ts:50`) — **RS256**, issuer `e-dokita`,
  audience `e-dokita-api`, `kid=edokita-api-key-1`, expiry **12h**.
- Payload: `{ userId, role, email, sub: userId, iss, aud, iat, exp }`.
- Keys: `APP_JWT_PRIVATE_KEY`/`APP_JWT_PUBLIC_KEY` env vars, else `private-key.pem` /
  `public-key.pem` at the repo root.

### Protecting routes

- `authenticate` (`src/shared/middleware/auth.ts:9`) — reads `Authorization: Bearer <jwt>`, verifies
  it, loads the user, and sets `req.user = payload`. Fails with **401**.
- `requireRole(...roles)` (`src/shared/middleware/role-guard.ts:7`) — must run **after**
  `authenticate`; returns **403** if `req.user.role` isn't allowed.

Example:

```ts
router.get("/admin/only", authenticate, requireRole("admin"), controller.handler);
```

### Roles

- Defined in `src/config/db/schema/role.ts`: `roles` table + `roleSchema` (`patient|doctor|admin`).
- `app_users.role_id` is **NOT NULL** and joins `roles`.
- Role is an **app‑side** concept. OpenEMR does not know our roles; we map role → OpenEMR scopes
  when starting per‑user OAuth (§8).

---

## 6. Per‑user OpenEMR authentication (Authorization Code + PKCE + OIDC)

This is how a logged‑in **staff** user (doctor/admin) connects their OpenEMR identity so we can act
*as them*. Patients do **not** connect — their routes use the service account (see §8).

### Endpoints

| Step | Route | Auth |
|---|---|---|
| Start | `GET /api/openemr/authorize` | our JWT |
| Callback | `GET /api/openemr/callback` | public (OpenEMR redirects here) |
| Refresh | `POST /api/openemr/refresh` | our JWT |
| Ping (test) | `GET /api/openemr/ping` | our JWT |

### The flow

1. **Start** — `OpenEMRService.startAuthorization` (`openemr.service.ts`):
   - Generates `state`, `nonce`, and a PKCE `verifier` (48‑char random) and stores them in
     `openemr_auth_states` (`savePending`, 10‑minute TTL).
   - Builds the authorize URL and returns `{ url }`:
     ```
     {OPENEMR_URL}/oauth2/default/authorize
       ?response_type=code
       &client_id=…
       &redirect_uri=…
       &scope=<ROLE_SCOPES[role]>     // e.g. "openid offline_access api:fhir patient/Patient.read …"
       &state=…
       &nonce=…
       &code_challenge=<S256(verifier)>
       &code_challenge_method=S256
     ```
   - The frontend sends the browser to that URL.

2. **Consent** — the user logs into OpenEMR and approves the requested scopes.

3. **Callback** — OpenEMR redirects to `OPENEMR_REDIRECT_URI` with `?code=…&state=…`.
   `AuthService.handleCallback` (`auth.service.ts:185`):
   - `takePending(state)` — single‑use: deletes and returns the stored verifier.
   - Exchanges the code at `/oauth2/default/token`:
     ```
     grant_type=authorization_code
     &code=…
     &redirect_uri=…
     &client_id=…
     &client_secret=…
     &code_verifier=<stored verifier>
     ```
   - Persists the token set (`saveTokens`) and links `sub`/`fhirUser` from the `id_token` onto the
     user (`linkOpenEMR`) → `openemr.subject`, `openemr.fhirUser`.

4. **Refresh** — `getOpenEMRToken(userId, force)` (`auth/helper.ts:143`) reuses the cached access
   token until expiry, else refreshes with `grant_type=refresh_token` and re‑saves.

### Token storage

- Table `openemr_tokens` keyed by user (`userId` unique), storing `accessToken`, `refreshToken`,
  `expiresAt`, `scope`, `subject`.
- Pending handshakes live in `openemr_auth_states` (keyed by `state`).

### Using the per‑user token on a request

`withOpenEMR` (`src/shared/middleware/auth.ts:30`) attaches `req.openemr` — an `OpenEMRClient` bound
to `(force) => getOpenEMRToken(userId, force)` (auto‑refreshing, re‑mints on 401). Example from
`openemr.route.ts`:

```ts
openemrRouter.get("/ping", authenticate, withOpenEMR, asyncHandler(async (req, res) => {
  const data = await req.openemr!.standardGet("/api/version");
  res.json({ success: true, data });
}));
```

> `withOpenEMR` (`src/shared/middleware/auth.ts`) is **role‑aware**: it attaches a per‑user client for
> `doctor`/`admin`, and the service‑account singleton for `patient`. Every resource module takes the
> client as a parameter, so the route’s `withOpenEMR` decides whose token is used.

### Quirks that will bite you

- **`nonce`/`site:*` scope pollution** — OpenEMR injects a literal `nonce` scope (and sometimes
  `site:*`) into the granted scope string. OpenEMR's own refresh validation then *rejects* it. We
  strip both with `cleanScope()` (`auth/helper.ts:116`) before storing/echoing and before refresh.
- **Exact redirect URI match** — `OPENEMR_REDIRECT_URI` must byte‑match the registered client.
- **Only `code` response type**, and **PKCE `S256`**.
- **OIDC discovery** is site‑scoped: `{OPENEMR_URL}/oauth2/default/.well-known/openid-configuration`
  (the root `/.well-known/...` is a 404 — that's normal). SMART discovery is at
  `{fhir_base}/.well-known/smart-configuration`.
- **Access‑token `sub` is the OpenEMR resource‑owner user id (a UUID)**; `fhirUser` appears only in
  the `id_token` / `/introspect`. We currently only decode the `id_token`.

---

## 7. The service account (background / provisioning)

### 7.1 How it works

`getAccessToken()` in `src/shared/utils/openemr-auth.ts` is the default token provider for the
shared singleton `openemr` (`open-emr.ts:228`). It mints a token with the **password grant**:

```
grant_type=password
client_id=<OPENEMR_CLIENT_ID>
username=<OPENEMR_USERNAME>      # e.g. admin
password=<OPENEMR_PASSWORD>
user_role=users
scope=<OPENEMR_SCOPE>
```

- **No `client_secret`** is sent (public‑client style), matching the configured client.
- The token is cached in‑process: `{ token, expiresAt = now + expires_in − 60s }` (60s skew),
  de‑duplicated via an `inflight` promise, and can be seeded from `OPENEMR_ACCESS_TOKEN`.
- `OpenEMRClient.request()` re‑mints once on a 401 (`open-emr.ts:98`).
- The cache is module‑level, i.e. **per Node process**.

Because it runs as `admin`, the service token is effectively a full EMR token — which is why we keep
its scope as small as the code actually needs (§8).

### 7.2 Why it exists

Provisioning at registration time happens *before* any user OAuth handshake, system/admin endpoints
aren't tied to an individual user, and **patient routes can't use per‑user tokens** (see §8) — so we
need one shared credible identity.

### 7.3 The `client_credentials` truth (important)

OpenEMR does **not** support `client_credentials` with a shared client secret. Concretely:

- OIDC discovery `grant_types_supported` = `["authorization_code","password","refresh_token"]` —
  **no** `client_credentials`.
- SMART configuration *advertises* `client_credentials`, but with
  `token_endpoint_auth_methods_supported = ["client_secret_basic","private_key_jwt"]`.
- `CustomClientCredentialsGrant.php` throws
  `invalidRequest("client_assertion_type","assertion type is not supported")` for anything that is
  not a **JWT client assertion** (`private_key_jwt`, RFC 7523). It's the **SMART Bulk FHIR** grant;
  the resulting token represents OpenEMR's *system user*, not an arbitrary account.

So switching the grant to `client_credentials` requires generating an RSA keypair, registering the
public key as the client's `jwks`/`jwks_uri` (columns exist on `oauth_clients`), and sending:

```
grant_type=client_credentials
client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer
client_assertion=<signed JWT>
```

Plain `client_credentials` with `client_id`/`client_secret` returns 401 (verified with both
`client_secret_post` and `client_secret_basic`). Until that keypair setup is done, the **password
grant remains the only working service‑account method**.

---

## 8. Roles and scopes

### Per‑user scopes (`ROLE_SCOPES`, `openemr.service.ts`)

Requested when a **staff** user connects their OpenEMR account. (Patients don’t connect — see below.)

```jsonc
{
  "doctor": "openid offline_access api:fhir api:oemr user/Patient.read user/Patient.write user/Observation.read user/Condition.read user/MedicationRequest.read user/AllergyIntolerance.read user/Immunization.read user/Procedure.read user/Encounter.read user/Practitioner.read user/Appointment.read user/appointment.cruds user/encounter.crus user/vital.crus user/list.r",
  "admin":  "openid offline_access api:fhir api:oemr user/Patient.read user/Patient.write user/Practitioner.read user/Practitioner.write user/Observation.read user/Condition.read user/MedicationRequest.read user/AllergyIntolerance.read user/Immunization.read user/Procedure.read user/Encounter.read user/Appointment.read user/user.rs user/facility.crus user/appointment.cruds user/encounter.crus user/vital.crus user/list.r"
}
```

Scope grammar: FHIR uses `user/<Resource>.<read|write>`; the **standard API uses v2 scopes**
`user/<resource>.<cruds>` (e.g. `user/list.r`, `user/encounter.crus`); plus the API gates
`api:fhir` / `api:oemr` and `openid` / `offline_access`.

> **The OAuth client’s registered `scope` is the ceiling.** OpenEMR silently drops any requested scope
> the client isn’t registered for — `user/list.r` was dropped until the client’s `oauth_clients.scope`
> was updated. To add a scope, re‑register/update the client, not just `ROLE_SCOPES`.

### Patients are the exception

Patients do **not** use per‑user tokens:
- OpenEMR rejects non‑`user` scopes on the standard API (`not allowing patient or system role to access oemr api`), and our OAuth flow authenticates through the provider login, so a token is always provider‑context.
- Patient‑context reads need a real patient launch (`user_role=patient`, `api:port` + `rest_portal_api` — disabled here) and are **read‑only**; OpenEMR blocks all patient‑context writes (`Patient user role is not allowed to write FHIR resources`).

So patient routes run on the **service account**, with ownership enforced in app code: for role
`patient`, `resolvePatientId` (`appointment/helper.ts`) returns the caller’s own `openemr.patientId`
from the app DB, and the appointment list/detail paths filter to it (`appointment.service.ts`).

### Service‑account scope (`OPENEMR_SCOPE`, `openemr-auth.ts:5`)

Used for provisioning, system/admin endpoints, and patient‑facing routes:

```
openid api:fhir api:oemr
user/Patient.read user/Patient.write
user/Observation.read user/Condition.read user/MedicationRequest.read
user/AllergyIntolerance.read user/Immunization.read user/Procedure.read user/Encounter.read
user/Practitioner.read user/Practitioner.write
user/Appointment.read
user/user.rs user/facility.crus
user/appointment.cruds user/encounter.crus user/vital.crus
user/list.r
```

Removed as unused earlier: `user/Location.read`, `user/Organization.read`, `user/patient.crus`,
`user/practitioner.crus`, `user/allergy.cruds`, `user/medication.cruds`, `user/immunization.rs`,
`user/prescription.rs`, `user/procedure.rs`, `user/insurance.crus`, `user/soap_note.crus`.

---

## 9. Navigating the dashboard vs. doing it programmatically

**Dashboard (OpenEMR UI):** `http://localhost:8400`. Log in as `admin` (password `OPENEMR_PASSWORD`,
role `api`). Use it to: register OAuth clients, view patients/practitioners/appointments, inspect
the calendar (visit categories are `pc_catid` values), and debug. Useful menus:
*Administration → System → API Clients*, *Patients*, *Calendar*, *Administration → Globals*.

**Programmatically (our backend):** you almost never call OpenEMR directly from app code — you go
through `OpenEMRClient` (`open-emr.ts`). Two kinds of calls:

| Need | Method on the client | Example |
|---|---|---|
| FHIR read | `fhirRead(type, id)` | `fhirRead("Patient", uuid)` |
| FHIR search | `fhirSearch(type, params)` | `fhirSearch("Appointment", { patient, date })` |
| FHIR create | `fhirCreate(type, resource)` | returns envelope → use `createdResourceId()` |
| FHIR update | `fhirUpdate(type, id, resource)` | returns the updated resource |
| FHIR raw | `fhirGet(path)` / `fhirPost(path, body)` | `fhirGet("/metadata")` |
| Standard GET | `standardGet(path, params?)` | `standardGet("/api/user")` |
| Standard POST | `standardPost(path, body)` | `standardPost("/api/patient/{pid}/encounter", …)` |

`standardGet/Post` auto‑unwrap the `{ data: [...] }` envelope (a few endpoints, e.g. `/api/version`,
return a flat object — `unwrapStandard()` normalizes both into an array).

### Our API surface (mounted in `app.ts`)

| Prefix | Module |
|---|---|
| `/api/system` | version + FHIR capability (`/api/version`, `/metadata`) |
| `/api/auth` | register/login/logout, OpenEMR authorize/callback/refresh/ping |
| `/api/users` | profile / current‑user |
| `/api/admin` | stats, OpenEMR users (`/api/user`), facilities (`/api/facility`) |
| `/api/doctors` | Practitioner CRUD |
| `/api/patients` | Patient CRUD |
| `/api/appointments` | booking, slots, categories |
| `/api/emr` | clinical summary (conditions/allergies/meds/immunizations/procedures/encounters, vitals/labs), encounters, vitals/intake |
| `/api/docs` | Swagger UI (derived from Zod) |

### Useful raw OpenEMR endpoints

| Path | Notes |
|---|---|
| `GET /apis/default/api/version` | OpenEMR version |
| `GET /apis/default/api/user` | OpenEMR users (`user/user.rs`) |
| `GET /apis/default/api/facility` | Facilities (`user/facility.crus`) |
| `GET /apis/default/api/list/apptcat` | Appointment categories — needs v2 scope `user/list.r` (see Troubleshooting) |
| `POST /apis/default/api/patient/{uuid}/appointment` | Create appointment (`user/appointment.cruds`) |
| `POST /apis/default/api/patient/{uuid}/encounter` | Create encounter (`user/encounter.crus`) |
| `POST /apis/default/api/patient/{uuid}/encounter/{eid}/vital` | Record vitals (`user/vital.crus`) |
| `GET /apis/default/fhir/Patient/{uuid}` | FHIR read |
| `GET /apis/default/fhir/Appointment?patient=…&date=…` | FHIR search |

**Use the `uuid`** (not the numeric `pid`) for FHIR and Standard patient/encounter paths —
appointments are the exception (they need the numeric `pid`; see Gotchas).

---

## 10. Environment variables

See `.env` / `.env.example` and `env.ts`. Nothing about OpenEMR needs more than one URL.

```dotenv
APP_STAGE=dev
PORT=8000
LOCAL_URL=http://localhost
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/edokita

# OpenEMR — ONE url (site root, no path)
OPENEMR_URL=http://localhost:8400
OPENEMR_CLIENT_ID=<client id from OpenEMR API Clients>
OPENEMR_CLIENT_SECRET=<client secret>            # used by auth-code + refresh
OPENEMR_USERNAME=admin                            # service account
OPENEMR_PASSWORD=<admin password>
OPENEMR_ACCESS_TOKEN=                             # optional pre-minted bearer (seed)
OPENEMR_REDIRECT_URI=http://localhost:8000/api/openemr/callback
FRONTEND_URL=http://localhost:3000

# Booking defaults (install-specific OpenEMR identifiers)
OPENEMR_DEFAULT_APPOINTMENT_CATEGORY=5
OPENEMR_DEFAULT_FACILITY=3
OPENEMR_DEFAULT_BILLING_LOCATION=3
OPENEMR_WORKING_HOURS_START=09:00
OPENEMR_WORKING_HOURS_END=17:00

# App JWT RS256 (else private-key.pem / public-key.pem)
APP_JWT_PRIVATE_KEY=
APP_JWT_PUBLIC_KEY=
```

> The default category/facility/billing values are placeholders — confirm them against your
> OpenEMR install (`pc_catid`, facility ids).

---

## 11. Gotchas & troubleshooting

- **`/api/list/apptcat` → 401** `scope user/list.r not in access token`. The standard API is
  **scope‑gated** (`AuthorizationListener::onRestApiSecurityCheck`), and this route needs the v2 scope
  `user/list.r`. Two things must both be true: the scope is in the token **and** the client’s
  registered `oauth_clients.scope` allows it. OpenEMR silently drops `user/list.r` if the client
  isn’t registered for it — update `oauth_clients.scope`, then re‑mint. (After that the route returns
  a data‑level 404 when no categories exist.)
- **Patient access denied on the standard API** → `not allowing patient or system role to access oemr
  api`. Standard `/api/...` is `users`‑role only; patients only have the read‑only `/portal/...`
  mirror (`api:port`, `rest_portal_api`).
- **Standard `:pid` is inconsistent between routes** — `POST /api/patient/{pid}/appointment` and
  `POST .../encounter/{eid}/vital` need the **numeric `pid`** (the uuid yields
  `{"pid":"pid must be for a valid patient"}` for appointments, and for vitals is stored verbatim as
  an integer, silently writing the row under `pid=0`), while `POST .../encounter` needs the **uuid**
  (a numeric pid yields `Patient UUID is invalid`). App code keeps the uuid as the public id and
  resolves the numeric pid via `resolvePatientPid` (`patient/helper.ts`) for both appointments and
  vitals.
- **Standard writes answer HTTP 200 even on validation failure**, in one of two shapes: raw
  `{ <field>: { <CODE>: "<message>" } }` (appointments) or uniform
  `{ validationErrors, internalErrors, data }` (encounters). `standardPost` inspects the body
  (`assertNoValidationError`, `open-emr.ts`) and throws a 400 instead of treating it as success.
- **Appointment body** requires a non‑empty `pc_hometext`, `pc_facility`, and `pc_billing_location`
  (defaults come from `OPENEMR_DEFAULT_*`; empty strings fail `NotEmpty`); `pc_title` must be ≥2 chars.
- **Appointment provider (`pc_aid`) is the numeric `users.id`**, not the Practitioner uuid — sending a
  uuid yields `pc_aid must be for a valid user`. `buildAppointmentPayload` sends the numeric id and
  `resolveProviderId` (`appointment/helper.ts`) resolves a uuid via `GET /api/user` (service account).
- **Appointment participants** — FHIR types the provider as `PPRF` (primary performer) with actor
  `Practitioner/{uuid}` **only when the provider has an NPI**, otherwise `Person/{uuid}`. Other codes:
  `PART` (patient), `LOC` (location). `mapAppointment` keys off those codes (falling back to the actor
  type) and exposes `doctorId`/`patientId`/`locationId` plus each participant’s `role`.
- **Appointment create returns only `{ "id": <eid> }`** — `findAppointment` resolves the exact new
  record via `GET /api/appointment/{eid}` (`pc_uuid` == FHIR `id`) then a FHIR read. (The old
  nearest‑same‑day‑start heuristic could return a sibling appointment on a busy day.)
- **Creates return envelopes, not resources** (see §4). Use `uuid`.
- **Vitals are stored in imperial units and BMI is not computed server‑side** — OpenEMR's UI computes
  BMI client‑side (`703 * lb / in²`) and only then stores it, but the REST vital insert skips that.
  `buildVitalsPayload` (`emr/helper.ts`) computes `BMI` + `BMI_status` (mirroring the `BmiCategory`
  boundaries) on write, and reads stay metric: `searchObservations` converts the UCUM imperial units
  OpenEMR emits (`in_i`→cm, `lb_av`→kg, `degF`→Cel) back to metric on read. Temperature is an offset
  conversion, not a pure factor.
- **`npi` required** for Practitioner create; **`name.use:"official"` + telecom** for Patient create.
- **`nonce`/`site:*` scope rejection** on refresh → strip with `cleanScope()`.
- **MariaDB SSL quirk**: the OpenEMR container's MariaDB client (11.8.8) wants SSL while
  `mariadb:10.11` has `have_ssl=DISABLED`. In‑container fix (ephemeral):
  `/etc/my.cnf.d/zz-no-ssl.cnf` containing `[client]` + `ssl=0`. Apache still starts.
- **Timezone**: `toDateString`/`toTimeString` and slot/working‑hours logic use the **server's local
  time zone**.
- **OAuth client re‑registration**: if you recreate the OpenEMR container/volumes you must re‑add the
  API client and re‑copy the id/secret into `.env`.
- **Stale refresh token** after manually curling the token endpoint: OpenEMR rotates refresh tokens,
  so a manual exchange invalidates what the app stored. Re‑run the auth‑code flow for that user, or
  update `openemr_tokens`.
- **`oauth4webapi` token exchange** (`config/auth/oauth.ts`) validates the `id_token` `iss` claim, which
   OpenEMR stamps as `$OPENEMR_URL/oauth2/default` — **not** the site root. Use `OpenEMR.issuer` as the
   `AuthorizationServer.issuer`. It also hard‑refuses plain‑HTTP endpoints, so local dev must pass
   `oauthOptions` (`{ [allowInsecureRequests]: true }`, auto‑enabled when `OPENEMR_URL` is `http:`) to the
   **request** helpers; the `process*` helpers don't take that option.
- **Never send `scope` on refresh** (`auth/helper.ts` `getOpenEMRToken`). OpenEMR's
  `IdTokenSMARTResponse::getScopeString()` deliberately **omits every `api:*` scope** (`api:oemr`,
  `api:fhir`) from the token response `scope` field, even though they're present inside the access
  token. If you persist that response scope and echo it back as the refresh `scope` parameter, OpenEMR
  honours the narrower request and the new access token **loses `api:oemr`/`api:fhir`** → every
  Standard API call then fails with `BearerTokenAuthorizationStrategy` 403 “insufficient permissions
  for the requested resource”. Omitting `scope` makes OpenEMR reuse the refresh token's original
  scopes (RFC 6749 §6) and the `api:*` scopes survive. A user whose chain was already narrowed this
  way must re‑run the auth‑code flow — refresh cannot recover scopes the refresh token no longer
  carries. (Verified: password‑grant chains preserve `api:oemr` across refresh with/without `scope`.)

---

## 12. Code map

| Concern | File |
|---|---|
| Env + derived OpenEMR URLs | `env.ts` |
| App JWT (sign/verify/decode) | `src/config/auth/jwt.ts` |
| PKCE helpers | `src/config/auth/pkce.ts` |
| Auth service (register/login/OAuth) | `src/module/auth/auth.service.ts` |
| Auth token storage/refresh | `src/module/auth/helper.ts` |
| Auth routes | `src/module/auth/auth.route.ts` |
| OpenEMR client (FHIR + standard) | `src/module/openemr/open-emr.ts` |
| Provisioning helper | `src/module/openemr/helpers.ts` |
| Service‑account token | `src/shared/utils/openemr-auth.ts` |
| App auth middleware | `src/shared/middleware/auth.ts` |
| Role guard | `src/shared/middleware/role-guard.ts` |
| Users + OpenEMR link fields | `src/module/user/helper.ts` |
| FHIR builders/mappers | `src/shared/utils/fhir.ts`, `src/shared/utils/fhir-mapper.ts` |
| Roles schema | `src/config/db/schema/role.ts` |
| Route mounting | `app.ts` |

---

## 13. Quick end‑to‑end recipe

```bash
# 1. Start OpenEMR + databases
docker compose up -d

# 2. Start the backend (auto-reloads)
npm run dev        # or: npx tsx watch app.ts

# 3. Register a patient (creates an OpenEMR Patient, returns our JWT)
curl -s -X POST http://localhost:8000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"email":"jane@example.com","password":"password123","role":"patient",
       "firstName":"Jane","lastName":"Doe","phone":"+15551234567",
       "birthDate":"1990-05-01","gender":"female"}'

# 4. Log in
curl -s -X POST http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"jane@example.com","password":"password123"}'

# 5. Connect OpenEMR (per-user OAuth) — returns an authorize URL to open in a browser
curl -s http://localhost:8000/api/openemr/authorize -H "Authorization: Bearer <token>"

# 6. Confirm the per-user OpenEMR link works
curl -s http://localhost:8000/api/openemr/ping -H "Authorization: Bearer <token>"
```
