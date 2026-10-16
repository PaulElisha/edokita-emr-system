/** @format */

/**
 * Returns a setter that copies only "present" values onto `target`, skipping
 * `undefined`, `null`, and empty strings. Useful for building OpenEMR payloads
 * and partial-update patches without repeating `if (v !== undefined)` checks.
 *
 *   const set = setDefined(payload);
 *   set("drug_id", input.drugId);
 *   set("note", input.note);
 */
export function setDefined(target: object) {
 return (key: string, value: unknown): void => {
  if (value === undefined || value === null || value === "") return;
  (target as Record<string, unknown>)[key] = value;
 };
}
