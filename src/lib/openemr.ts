/** @format */
import { OpenEMR } from "../../env.ts";
import type { FhirBundle, FhirResource } from "../types/fhir.ts";

export type QueryValue = string | number | boolean | undefined | null;

export class OpenEMRApiError extends Error {
  status: number;
  body: unknown;

  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = "OpenEMRApiError";
    this.status = status;
    this.body = body;
  }
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
  private readonly accessToken: string;
  private readonly apiBase: string;
  private readonly fhirBase: string;

  constructor(accessToken: string, baseUrl = OpenEMR.baseUrl) {
    this.accessToken = accessToken;
    this.apiBase = `${baseUrl.replace(/\/$/, "")}/apis/default`;
    this.fhirBase = `${baseUrl.replace(/\/$/, "")}/fhir`;
  }

  private async request<T>(
    base: string,
    path: string,
    { method = "GET", query, body, accept = "application/json" }: RequestOptions = {},
  ): Promise<T> {
    const url = `${base}${path}${buildQuery(query)}`;
    const headers: Record<string, string> = {
      Accept: accept,
      Authorization: `Bearer ${this.accessToken}`,
    };

    let payload: string | undefined;
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }

    let res: Response;
    try {
      res = await fetch(url, { method, headers, body: payload });
    } catch (e) {
      throw new OpenEMRApiError(
        502,
        `Upstream OpenEMR unreachable: ${(e as Error).message}`,
        null,
      );
    }

    const text = await res.text();
    const json = text ? safeParse(text) : null;

    if (!res.ok) {
      const detail =
        (json && ((json as { issue?: unknown }).issue ?? (json as { error_description?: unknown }).error_description)) ||
        res.statusText;
      throw new OpenEMRApiError(
        res.status,
        typeof detail === "string" ? detail : `OpenEMR request failed with ${res.status}`,
        json,
      );
    }

    return json as T;
  }

  /** Raw FHIR GET (for path-only resources such as /metadata). */
  fhirGet<T = unknown>(path: string): Promise<T> {
    return this.request(this.fhirBase, path.startsWith("/") ? path : `/${path}`);
  }

  /** Raw FHIR POST (for operations). */
  fhirPost<T = unknown>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    return this.request(this.fhirBase, path.startsWith("/") ? path : `/${path}`, {
      method: "POST",
      body,
    });
  }

  /** FHIR read of a single resource. */
  fhirRead<R extends FhirResource = FhirResource>(
    resourceType: string,
    id: string,
  ): Promise<R> {
    return this.request(this.fhirBase, `/${resourceType}/${id}`);
  }

  /** FHIR search (returns a Bundle). */
  fhirSearch(
    resourceType: string,
    params: Record<string, QueryValue | QueryValue[]>,
  ): Promise<FhirBundle> {
    return this.request(this.fhirBase, `/${resourceType}`, { query: params });
  }

  /** FHIR create. Returns the created resource. */
  fhirCreate<R extends FhirResource = FhirResource>(
    resourceType: string,
    resource: Record<string, unknown>,
  ): Promise<R> {
    return this.request(this.fhirBase, `/${resourceType}`, {
      method: "POST",
      body: resource,
    });
  }

  /** Standard OpenEMR GET; unwraps the `data` array from the envelope. */
  async standardGet<T = Record<string, unknown>>(
    path: string,
    params?: Record<string, QueryValue>,
  ): Promise<T[]> {
    const env = await this.request<unknown>(this.apiBase, path, { query: params });
    return unwrapStandard<T>(env);
  }

  /** Standard OpenEMR POST; returns the wrapped data array. */
  async standardPost<T = Record<string, unknown>>(
    path: string,
    body: Record<string, unknown>,
  ): Promise<T[]> {
    const env = await this.request<unknown>(this.apiBase, path, {
      method: "POST",
      body,
    });
    return unwrapStandard<T>(env);
  }
}

/**
 * Some standard OpenEMR endpoints wrap payloads in `{ data: [...] }`, while a few
 * (e.g. /api/version) return a flat object. Normalize both into an array.
 */
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

/** Shared singleton backed by env config. */
export const openemr = new OpenEMRClient(OpenEMR.accessToken);

export default OpenEMRClient;