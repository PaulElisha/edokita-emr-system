/** @format */

/** Normalizes any thrown value into an `Error` for use with `Result`. */
export function toError(value: unknown): Error {
 if (value instanceof Error) return value;
 if (typeof value === "string") return new Error(value);
 return new Error("Unknown error");
}
