/** @format */
import { env as loadEnv } from "custom-env";
import z from "zod";

loadEnv("dev");

const EnvSchema = z.object({
  PORT: z.coerce.number().default(8001),

  OPENEMR_BASE_URL: z.string().url(),
  OPENEMR_ACCESS_TOKEN: z
    .string()
    .min(10, "OPENEMR_ACCESS_TOKEN looks too short to be a real token"),

  LOG_LEVEL: z.string().default("info"),
  CORS_ORIGIN: z.string().default("*"),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.issues);
  process.exit(1);
}

const Env = parsed.data;

const OpenEMR = {
  baseUrl: Env.OPENEMR_BASE_URL.replace(/\/$/, ""),
  /** Standard (non-FHIR) OpenEMR API base, e.g. /openemr/apis/default */
  apiBase: () => `${Env.OPENEMR_BASE_URL.replace(/\/$/, "")}/apis/default`,
  /** FHIR R4 base, e.g. /openemr/fhir */
  fhirBase: () => `${Env.OPENEMR_BASE_URL.replace(/\/$/, "")}/fhir`,
  accessToken: Env.OPENEMR_ACCESS_TOKEN,
};

export { Env, OpenEMR };
export default Env;