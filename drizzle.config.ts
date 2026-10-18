import { env as loadEnv } from "custom-env";
import { defineConfig } from "drizzle-kit";

loadEnv();

export default defineConfig({
  schema: "./src/config/db/schema/*.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgres://postgres:postgres@localhost:5432/edokita",
  },
});
