/** @format */

import { db, transactionStorage } from "@db/db.ts";

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type DbClient = typeof db | Transaction;

function withTransaction<T>(
 fn: (tx: Transaction) => Promise<T>,
): Promise<T> {
 const current = transactionStorage.getStore();
 if (current) return fn(current);
 return db.transaction((tx) => transactionStorage.run(tx, () => fn(tx)));
}

export function Transactional(): MethodDecorator {
 return (_target, _propertyKey, descriptor: PropertyDescriptor) => {
  const method = descriptor.value as (...args: unknown[]) => Promise<unknown>;
  if (typeof method !== "function") return;

  descriptor.value = function (this: unknown, ...args: unknown[]) {
   return withTransaction(() => method.apply(this, args));
  };
 };
}
