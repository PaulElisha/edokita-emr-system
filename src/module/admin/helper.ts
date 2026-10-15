/** @format */
import type OpenEMRClient from "@module/openemr/client.ts";
import type { Result } from "@shared/types.ts";
import { toError } from "@shared/error/error.ts";

export async function countResources(
 client: OpenEMRClient,
 resourceType: string,
 params: Record<string, string | number> = {},
): Promise<Result<number>> {
 try {
  const bundle = await client.fhirSearch(resourceType, {
   ...params,
   _count: 1,
  });
  return [bundle.total ?? 0, null];
 } catch (e) {
  return [null, toError(e)];
 }
}
