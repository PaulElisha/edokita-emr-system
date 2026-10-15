/** @format */
import Env from "@/env.ts";
import cors from "cors";

/** Split a comma-separated list, trimming and reducing each entry to its origin. */
function parseOrigins(value: string): string[] {
 return value
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
   if (entry === "*") return entry;
   try {
    return new URL(entry).origin;
   } catch {
    return entry;
   }
  });
}

const allowedOrigins = parseOrigins(Env.CORS_ORIGIN);

// `*` cannot be combined with credentialed requests, so reflect the caller instead.
const allowAll = allowedOrigins.includes("*");

export default cors({
 origin: allowAll ? true : allowedOrigins,
 methods: ["GET", "POST", "PUT", "DELETE"],
 credentials: true,
});
