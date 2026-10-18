export function setDefined(target: object) {
 return (key: string, value: unknown): void => {
  if (value === undefined || value === null || value === "") return;
  (target as Record<string, unknown>)[key] = value;
 };
}
