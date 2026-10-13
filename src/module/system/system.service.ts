/** @format */
import { OpenEMR } from "@/env.ts";
import { openemr } from "@shared/lib/openemr.ts";

export interface VersionInfo {
  engine: string;
  version: string | null;
  details: Record<string, unknown> | null;
  fhirVersion: string;
  baseUrl: string;
}

interface VersionRow {
  engine?: string;
  version?: string;
  v_major?: number;
  v_minor?: number;
  v_patch?: number;
  v_realpatch?: number;
  v_tag?: string;
  [key: string]: unknown;
}

export async function getVersion(): Promise<VersionInfo> {
  const rows = await openemr.standardGet<VersionRow>("/api/version");
  const row = rows[0] ?? {};

  const version =
    row.version ??
    ([row.v_major, row.v_minor, row.v_patch]
      .filter((v) => v !== undefined && v !== null)
      .join(".") || null);

  return {
    engine: row.engine ?? "openemr",
    version,
    details: rows[0] ?? null,
    fhirVersion: "R4",
    baseUrl: OpenEMR.apiBase,
  };
}

export async function getCapabilityStatement(): Promise<{
  fhirVersion: string;
  resourceTypes: string[];
}> {
  const metadata = await openemr.fhirGet<{
    rest?: Array<{ resource?: Array<{ type?: string }> }>;
  }>("/metadata");
  return {
    fhirVersion: "R4",
    resourceTypes: (metadata.rest?.[0]?.resource ?? [])
      .map((r) => r.type ?? "")
      .filter(Boolean),
  };
}