import { Env, isProd } from "@/env.ts";
import schema from "@db/schema.ts";
import { remember } from "@epic-web/remember";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const createPool = (): Pool =>
 new Pool({
  connectionString: Env.DATABASE_URL,
  ssl: isProd() ? { rejectUnauthorized: false } : false,
 });

const pool = remember("dbPool", () => createPool());

export const db = drizzle(pool, { schema });

export default db;

export type Database = typeof db;
