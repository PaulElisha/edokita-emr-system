/** @format */
import { env as loadEnv } from "custom-env";
import z from "zod";

process.env.APP_STAGE = process.env.APP_STAGE || "dev";

const isProduction = process.env.APP_STAGE === "prod";
const isDevelopment = process.env.APP_STAGE === "dev";
const isTesting = process.env.APP_STAGE === "test";

if (isProduction) {
 loadEnv("prod");
} else if (isTesting) {
 loadEnv("test");
} else if (isDevelopment) {
 loadEnv("dev");
}

process.env.NODE_ENV =
 process.env.NODE_ENV ||
 (isProduction ? "production" : isTesting ? "testing" : "development");

const EnvSchema = z.object({
 VERSION: z.string(),

 PORT: z.coerce.number(),
 LOCAL_URL: z.string(),

 NODE_ENV: z.enum(["production", "development", "testing"]),
 APP_STAGE: z.enum(["dev", "test", "prod"]).default("dev"),

 CORS_ORIGIN: z.string(),
 LOG_LEVEL: z.string().default("info"),

 // OpenEMR site root, no trailing path. Standard API and FHIR are derived from it.
 // e.g. http://localhost:8400 (dev) or https://openemr-xxxx.onrender.com (prod)
 OPENEMR_URL: z.string(),
 OPENEMR_CLIENT_ID: z.string(),
 OPENEMR_USERNAME: z.string(),
 OPENEMR_PASSWORD: z.string(),
 // Optional pre-minted bearer token; minted/refreshed automatically when absent.
 OPENEMR_ACCESS_TOKEN: z.string().default(""),

 // OAuth2 authorization-code flow (per-user login).
 OPENEMR_CLIENT_SECRET: z.string().default(""),
 OPENEMR_REDIRECT_URI: z
  .string()
  .default("http://localhost:8000/api/openemr/callback"),
 FRONTEND_URL: z.string().default("http://localhost:3000"),

 // Appointment booking defaults (OpenEMR calendar identifiers are install-specific).
 OPENEMR_DEFAULT_APPOINTMENT_CATEGORY: z.string().default("5"),
 OPENEMR_DEFAULT_FACILITY: z.string().default("3"),
 OPENEMR_DEFAULT_BILLING_LOCATION: z.string().default("3"),
 // Working-hours model backing booking validation + future slot search.
 OPENEMR_WORKING_HOURS_START: z.string().default("09:00"),
 OPENEMR_WORKING_HOURS_END: z.string().default("17:00"),

 // Postgres connection string for the app's own data (users, OpenEMR tokens).
 DATABASE_URL: z
  .string()
  .default("postgres://postgres:postgres@localhost:5432/edokita"),

 // RS256 key material for signing our own app session JWTs. When unset the
 // keys are read from private-key.pem / public-key.pem at the project root.
 APP_JWT_PRIVATE_KEY: z.string().optional(),
 APP_JWT_PUBLIC_KEY: z.string().optional(),
});
export type EnvType = z.infer<typeof EnvSchema>;
let Env: EnvType;

try {
 const parsed = EnvSchema.safeParse(process.env);

 if (!parsed.success) {
  console.error("Invalid environment variables:");
  parsed.error.issues.forEach((e) => {
   const path = e.path.join(".");
   console.error(`${path}-${e.message}`);
  });
  process.exit(1);
 }

 Env = parsed.data;
} catch (e) {
 if (e instanceof z.ZodError) {
  console.error("Invalid environment variables:", e.issues);
  console.log(JSON.stringify(z.treeifyError(e), null, 2));

  e.issues.forEach((err) => {
   const path = err.path.join(".");
   console.log(`${path}-${err.message}`);
  });

  process.exit(1);
 }

 throw e;
}

const withoutTrailingSlash = (value: string) => value.replace(/\/+$/, "");
const openemrUrl = withoutTrailingSlash(Env.OPENEMR_URL);

/**
 * Single source of truth for OpenEMR URLs. Everything is derived from
 * OPENEMR_URL so there is only one URL to configure per environment.
 */
const OpenEMR = {
 /** Site root, no path — e.g. https://openemr.example.com */
 url: openemrUrl,
 /** OAuth2 issuer (the `iss` claim OpenEMR stamps on tokens) */
 issuer: `${openemrUrl}/oauth2/default`,
 /** OAuth2 token endpoint */
 oauthUrl: `${openemrUrl}/oauth2/default/token`,
 /** OAuth2 authorize endpoint (authorization-code flow) */
 authorizeUrl: `${openemrUrl}/oauth2/default/authorize`,
 /** Standard (non-FHIR) REST API base */
 apiBase: `${openemrUrl}/apis/default`,
 /** FHIR R4 base */
 fhirBase: `${openemrUrl}/apis/default/fhir`,
 clientId: Env.OPENEMR_CLIENT_ID,
 clientSecret: Env.OPENEMR_CLIENT_SECRET,
 redirectUri: Env.OPENEMR_REDIRECT_URI,
 username: Env.OPENEMR_USERNAME,
 password: Env.OPENEMR_PASSWORD,
 accessToken: Env.OPENEMR_ACCESS_TOKEN,
 defaultAppointmentCategory: Env.OPENEMR_DEFAULT_APPOINTMENT_CATEGORY,
 defaultFacility: Env.OPENEMR_DEFAULT_FACILITY,
 defaultBillingLocation: Env.OPENEMR_DEFAULT_BILLING_LOCATION,
 workingHoursStart: Env.OPENEMR_WORKING_HOURS_START,
 workingHoursEnd: Env.OPENEMR_WORKING_HOURS_END,
};

export const isProd = () => Env.APP_STAGE === "prod";
export const isDev = () => Env.APP_STAGE === "dev";
export const isTest = () => Env.APP_STAGE === "test";

export { Env, OpenEMR };
export default Env;
