/** @format */

import { getOpenEMRClient } from "@openemr/context.ts";

import type { Result } from "@shared/types.ts";
import { toError } from "@shared/error/error.ts";

export async function countResources(
 resourceType: string,
 params: Record<string, string | number> = {},
): Promise<Result<number>> {
 const client = getOpenEMRClient();
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
