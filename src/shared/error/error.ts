export function toError(value: unknown, context?: string): Error {
 const original = value instanceof Error ? value : undefined;
 const message =
  original?.message ??
  (typeof value === "string" ? value : `Unknown error (${typeof value})`);
 const error = new Error(context ? `${context}: ${message}` : message, {
  cause: value,
 });
 if (original?.stack) error.stack = original.stack;
 return error;
}
