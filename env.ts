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

 OPENEMR_URL: z.string(),
 OPENEMR_CLIENT_ID: z.string(),
 OPENEMR_USERNAME: z.string(),
 OPENEMR_PASSWORD: z.string(),
 OPENEMR_ACCESS_TOKEN: z.string().default(""),

 OPENEMR_CLIENT_SECRET: z.string().default(""),
 OPENEMR_REDIRECT_URI: z
  .string()
  .default("http://localhost:8000/api/openemr/callback"),
 FRONTEND_URL: z.string().default("http://localhost:3000"),

 OPENEMR_DEFAULT_APPOINTMENT_CATEGORY: z.string().default("5"),
 OPENEMR_DEFAULT_FACILITY: z.string().default("3"),
 OPENEMR_DEFAULT_BILLING_LOCATION: z.string().default("3"),
 OPENEMR_WORKING_HOURS_START: z.string().default("09:00"),
 OPENEMR_WORKING_HOURS_END: z.string().default("17:00"),
 EMR_ACCESS_TTL_HOURS: z.coerce.number().int().positive().default(24),

 DATABASE_URL: z
  .string()
  .default("postgres://postgres:postgres@localhost:5432/edokita"),

 APP_JWT_PRIVATE_KEY: z.string().optional(),
 APP_JWT_PUBLIC_KEY: z.string().optional(),

 TOKEN_ENCRYPTION_KEY: z.string().optional(),
});
type EnvType = z.infer<typeof EnvSchema>;
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

const OpenEMR = {
 url: openemrUrl,
 issuer: `${openemrUrl}/oauth2/default`,
 oauthUrl: `${openemrUrl}/oauth2/default/token`,
 authorizeUrl: `${openemrUrl}/oauth2/default/authorize`,
 apiBase: `${openemrUrl}/apis/default`,
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

if (!Env.OPENEMR_CLIENT_SECRET) {
 console.warn(
  "OPENEMR_CLIENT_SECRET is not set; OpenEMR OAuth2 token minting will fail until it is configured.",
 );
}

export const isProd = () => Env.APP_STAGE === "prod";

export { Env, OpenEMR };
export default Env;
