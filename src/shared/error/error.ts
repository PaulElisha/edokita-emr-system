import AppError from "./app-error.ts";

export function toError(value: unknown, context?: string): Error {
 if (value instanceof AppError) {
  if (!context) return value;
  return new AppError(
   `${context}: ${value.message}`,
   value.statusCode,
   value.errorCode,
   value.details,
   value,
  );
 }
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
