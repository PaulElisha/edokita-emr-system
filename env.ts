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
 BASE_URL: z.string(),

 NODE_ENV: z.enum(["production", "development", "testing"]),
 APP_STAGE: z.enum(["dev", "test", "prod"]).default("dev"),

 CORS_ORIGIN: z.string(),
 LOG_LEVEL: z.string().default("info"),

 LOCAL_OPENEMR_URL: z.string(),
 LOCAL_OPENEMR_CLIENT_ID: z.string(),
 LOCAL_OPENEMR_AUD_URI: z.string(),

 OPENEMR_URL: z.string(),
 OPENEMR_CLIENT_ID: z.string(),
 OPENEMR_AUD_URI: z.string(),

 OPENEMR_USERNAME: z.string(),
 OPENEMR_PASSWORD: z.string(),

  OPENEMR_BASE_URL: z.string(),
  OPENEMR_ACCESS_TOKEN: z.string().default(""),
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

const OpenEMR = {
  baseUrl: Env.OPENEMR_BASE_URL.replace(/\/$/, ""),
  apiBase: () => `${Env.OPENEMR_BASE_URL.replace(/\/$/, "")}/apis/default`,
  fhirBase: () => `${Env.OPENEMR_BASE_URL.replace(/\/$/, "")}/fhir`,
  accessToken: Env.OPENEMR_ACCESS_TOKEN,
  oauthUrl: Env.OPENEMR_BASE_URL.replace(/\/apis\/default\/?$/, "").replace(/\/$/, ""),
  url: isProduction ? Env.OPENEMR_URL : Env.LOCAL_OPENEMR_URL,
  clientId: isProduction ? Env.OPENEMR_CLIENT_ID : Env.LOCAL_OPENEMR_CLIENT_ID,
  audUri: isProduction ? Env.OPENEMR_AUD_URI : Env.LOCAL_OPENEMR_AUD_URI,
  username: Env.OPENEMR_USERNAME,
  password: Env.OPENEMR_PASSWORD,
};

export const isProd = () => Env.APP_STAGE === "prod";
export const isDev = () => Env.APP_STAGE === "dev";
export const isTest = () => Env.APP_STAGE === "test";

export { Env, OpenEMR };
export default Env;
