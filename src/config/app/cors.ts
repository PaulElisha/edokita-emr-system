import Env from "@/env.ts";
import cors from "cors";

function escapeRegex(value: string): string {
 return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseOrigins(value: string): string[] {
 return value
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean)
  .map((entry) => {
   if (entry.includes("*")) return entry;
   try {
    return new URL(entry).origin;
   } catch {
    return entry;
   }
  });
}

const allowedOrigins = parseOrigins(Env.CORS_ORIGIN);

const allowAll = allowedOrigins.includes("*");

const exactOrigins = allowedOrigins.filter((entry) => entry !== "*");
const originPatterns = exactOrigins
 .filter((entry) => entry.includes("*"))
 .map((pattern) => new RegExp(`^${pattern.split("*").map(escapeRegex).join(".*")}$`));

function isAllowedOrigin(origin: string | undefined): boolean {
 if (!origin) return false;
 if (allowAll) return true;
 if (exactOrigins.includes(origin)) return true;
 return originPatterns.some((pattern) => pattern.test(origin));
}

export default cors({
 origin: (origin, callback) => {
  callback(null, isAllowedOrigin(origin));
 },
 methods: ["GET", "POST", "PUT", "DELETE"],
 credentials: true,
});
