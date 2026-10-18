import { OpenEMR } from "@/env.ts";
import { getAccessToken } from "@shared/utils/openemr-auth.ts";
import type { FhirBundle, FhirResource } from "@shared/types/fhir.ts";
import AppError from "@error/app-error.ts";
import type { HttpStatusCodeType } from "@enum/http.ts";
import HttpStatus from "@enum/http.ts";
import ErrorCode from "@enum/error-code.ts";

export type QueryValue = string | number | boolean | undefined | null;

export interface OpenEMRCreateResult {
 id?: number | string;
 uuid?: string;
 pid?: number;
}

export function createdResourceId(result: unknown): string | undefined {
 if (!result || typeof result !== "object") return undefined;
 const { uuid, id } = result as OpenEMRCreateResult;
 if (typeof uuid === "string" && uuid) return uuid;
 if (typeof id === "string" && id) return id;
 if (typeof id === "number") return String(id);
 return undefined;
}

interface RequestOptions {
 method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
 query?: Record<string, QueryValue | QueryValue[]>;
 body?: unknown;
 accept?: string;
}

function buildQuery(query?: RequestOptions["query"]): string {
 if (!query) return "";
 const params = new URLSearchParams();
 for (const [key, raw] of Object.entries(query)) {
  if (raw === undefined || raw === null || raw === "") continue;
  const values = Array.isArray(raw) ? raw.filter((v) => v != null) : [raw];
  for (const v of values) params.append(key, String(v));
 }
 const s = params.toString();
 return s ? `?${s}` : "";
}

class OpenEMRClient {
 private readonly tokenProvider: (force?: boolean) => Promise<string>;
 private readonly apiBase: string;
 private readonly fhirBase: string;
 private tokenCache: Promise<string> | null = null;

 constructor(
  tokenProvider: (force?: boolean) => Promise<string> = getAccessToken,
  apiBase = OpenEMR.apiBase,
 ) {
  this.tokenProvider = tokenProvider;
  this.apiBase = apiBase.replace(/\/+$/, "");
  this.fhirBase = `${this.apiBase}/fhir`;
 }

 private accessToken(force = false): Promise<string> {
  if (force || !this.tokenCache) {
   this.tokenCache = this.tokenProvider(force).catch((e) => {
    this.tokenCache = null;
    throw e;
   });
  }
  return this.tokenCache;
 }

 private async request<T>(
  base: string,
  path: string,
  {
   method = "GET",
   query,
   body,
   accept = "application/json",
  }: RequestOptions = {},
 ): Promise<T> {
  const url = `${base}${path}${buildQuery(query)}`;
  const headers: Record<string, string> = {
   Accept: accept,
  };

  let payload: string | undefined;
  if (body !== undefined) {
   headers["Content-Type"] = "application/json";
   payload = JSON.stringify(body);
  }

  const send = async (token: string): Promise<Response> => {
   headers.Authorization = `Bearer ${token}`;
   try {
    return await fetch(url, { method, headers, body: payload });
   } catch (e) {
    throw new AppError(
     `Upstream OpenEMR unreachable: ${(e as Error).message}`,
     HttpStatus.BAD_GATEWAY,
     ErrorCode.OPENEMR_API_ERROR,
     null,
    );
   }
  };

  let res = await send(await this.accessToken());
  if (res.status === 401) {
   res = await send(await this.accessToken(true));
  }

  const text = await res.text();
  const json = text ? safeParse(text) : null;

  if (!res.ok) {
   const detail =
    (json &&
     ((json as { issue?: unknown }).issue ??
      (json as { error_description?: unknown }).error_description)) ||
    res.statusText;
   throw new AppError(
    typeof detail === "string"
     ? detail
     : `OpenEMR request failed with ${res.status}`,
    res.status as HttpStatusCodeType,
    ErrorCode.OPENEMR_API_ERROR,
    json,
   );
  }

  return json as T;
 }

 fhirGet<T = unknown>(path: string): Promise<T> {
  return this.request(this.fhirBase, path.startsWith("/") ? path : `/${path}`);
 }

 fhirPost<T = unknown>(
  path: string,
  body: Record<string, unknown>,
 ): Promise<T> {
  return this.request(this.fhirBase, path.startsWith("/") ? path : `/${path}`, {
   method: "POST",
   body,
  });
 }

 fhirRead<R extends FhirResource = FhirResource>(
  resourceType: string,
  id: string,
 ): Promise<R> {
  return this.request(this.fhirBase, `/${resourceType}/${id}`);
 }

 fhirSearch(
  resourceType: string,
  params: Record<string, QueryValue | QueryValue[]>,
 ): Promise<FhirBundle> {
  return this.request(this.fhirBase, `/${resourceType}`, { query: params });
 }

 fhirCreate<R = FhirResource>(
  resourceType: string,
  resource: Record<string, unknown>,
 ): Promise<R> {
  return this.request(this.fhirBase, `/${resourceType}`, {
   method: "POST",
   body: resource,
  });
 }

 fhirUpdate<R extends FhirResource = FhirResource>(
  resourceType: string,
  id: string,
  resource: Record<string, unknown>,
 ): Promise<R> {
  return this.request(this.fhirBase, `/${resourceType}/${id}`, {
   method: "PUT",
   body: { ...resource, id },
  });
 }

 async standardGet<T = Record<string, unknown>>(
  path: string,
  params?: Record<string, QueryValue>,
 ): Promise<T[]> {
  const env = await this.request<unknown>(this.apiBase, path, {
   query: params,
  });
  return unwrapStandard<T>(env);
 }

 async standardPost<T = Record<string, unknown>>(
  path: string,
  body: Record<string, unknown>,
 ): Promise<T[]> {
  const env = await this.request<unknown>(this.apiBase, path, {
   method: "POST",
   body,
  });
  assertNoValidationError(env);
  return unwrapStandard<T>(env);
 }

 async standardPut<T = Record<string, unknown>>(
  path: string,
  body: Record<string, unknown>,
 ): Promise<T[]> {
  const env = await this.request<unknown>(this.apiBase, path, {
   method: "PUT",
   body,
  });
  assertNoValidationError(env);
  return unwrapStandard<T>(env);
 }

 async standardDelete<T = Record<string, unknown>>(
  path: string,
  query?: Record<string, QueryValue>,
 ): Promise<T[]> {
  const env = await this.request<unknown>(this.apiBase, path, {
   method: "DELETE",
   query,
  });
  assertNoValidationError(env);
  return unwrapStandard<T>(env);
 }
}

function unwrapStandard<T>(env: unknown): T[] {
 if (env === null || env === undefined) return [];
 if (Array.isArray(env)) return env as T[];
 if (typeof env === "object") {
  const data = (env as { data?: unknown }).data;
  if (Array.isArray(data)) return data as T[];
  if (data !== undefined && data !== null) return [data as T];
  return [env as T];
 }
 return [];
}

function safeParse(text: string): unknown {
 try {
  return JSON.parse(text);
 } catch {
  return text;
 }
}

function assertNoValidationError(env: unknown): void {
 if (!env || typeof env !== "object" || Array.isArray(env)) return;
 const record = env as Record<string, unknown>;

 if ("validationErrors" in record || "internalErrors" in record) {
  throwIfMessages(
   [
    ...collectMessages(record.validationErrors),
    ...collectMessages(record.internalErrors),
   ],
   env,
  );
  return;
 }

 if ("data" in record || "id" in record) return;
 const fields = Object.values(record);
 if (fields.length === 0) return;
 if (!fields.every((v) => v && typeof v === "object" && !Array.isArray(v)))
  return;
 throwIfMessages(collectMessages(fields), env);
}

function collectMessages(value: unknown, out: string[] = []): string[] {
 if (typeof value === "string") {
  out.push(value);
 } else if (Array.isArray(value)) {
  for (const v of value) collectMessages(v, out);
 } else if (value && typeof value === "object") {
  for (const v of Object.values(value)) collectMessages(v, out);
 }
 return out;
}

function throwIfMessages(messages: string[], env: unknown): void {
 if (messages.length === 0) return;
 throw new AppError(
  messages.join("; "),
  HttpStatus.BAD_REQUEST,
  ErrorCode.OPENEMR_API_ERROR,
  env,
 );
}

export const openemr = new OpenEMRClient();

export default OpenEMRClient;
