/** @format */

import { AsyncLocalStorage } from "node:async_hooks";
import APIError from "@error/APIError.ts";
import type OpenEMRClient from "./client.ts";

const storage = new AsyncLocalStorage<OpenEMRClient>();

export function runWithOpenEMR<T>(client: OpenEMRClient, fn: () => T): T {
 return storage.run(client, fn);
}

export function getOpenEMRClient(): OpenEMRClient {
 const client = storage.getStore();
 if (!client) {
  throw APIError.internalServer(
   "OpenEMR client is not available in this context",
  );
 }
 return client;
}
