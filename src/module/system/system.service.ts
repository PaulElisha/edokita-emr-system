/** @format */

import { OpenEMR } from "@/env.ts";
import { openemr } from "../../config/openemr-client/client.ts";
import type { Result } from "@shared/types.ts";
import { toError } from "@shared/error/error.ts";

interface VersionInfo {
 engine: string;
 version: string | null;
 details: Record<string, unknown> | null;
 fhirVersion: string;
 baseUrl: string;
}

interface CapabilityStatement {
 fhirVersion: string;
 resourceTypes: string[];
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

class SystemService {
 version = async (): Promise<Result<VersionInfo>> => {
  try {
   const rows = await openemr.standardGet<VersionRow>("/api/version");
   const row = rows[0] ?? {};

   const version =
    row.version ??
    ([row.v_major, row.v_minor, row.v_patch]
     .filter((v) => v !== undefined && v !== null)
     .join(".") ||
     null);

   return [
    {
     engine: row.engine ?? "openemr",
     version,
     details: rows[0] ?? null,
     fhirVersion: "R4",
     baseUrl: OpenEMR.apiBase,
    },
    null,
   ];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 capability = async (): Promise<Result<CapabilityStatement>> => {
  try {
   const metadata = await openemr.fhirGet<{
    rest?: Array<{ resource?: Array<{ type?: string }> }>;
   }>("/metadata");
   return [
    {
     fhirVersion: "R4",
     resourceTypes: (metadata.rest?.[0]?.resource ?? [])
      .map((r) => r.type ?? "")
      .filter(Boolean),
    },
    null,
   ];
  } catch (e) {
   return [null, toError(e)];
  }
 };
}

export default new SystemService();
