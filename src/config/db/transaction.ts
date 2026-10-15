/** @format */
import { db } from "@db/db.ts";

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type DbClient = typeof db | Transaction;

export function withTransaction<T>(
 fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
 return db.transaction(fn);
}
