import { AsyncLocalStorage } from "node:async_hooks";
import { Env, isProd } from "@/env.ts";
import schema from "@db/schema.ts";
import type { Transaction } from "@db/transaction.ts";
import { remember } from "@epic-web/remember";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const createPool = (): Pool =>
 new Pool({
  connectionString: Env.DATABASE_URL,
  ssl: isProd() ? { rejectUnauthorized: false } : false,
 });

const pool = remember("dbPool", () => createPool());

const baseDb = drizzle(pool, { schema });

export const transactionStorage = new AsyncLocalStorage<Transaction>();

export const db = new Proxy(baseDb, {
 get(target, property) {
  const client = transactionStorage.getStore() ?? target;
  const value = Reflect.get(client, property, client);
  return typeof value === "function" ? value.bind(client) : value;
 },
}) as typeof baseDb;
