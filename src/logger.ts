/** @format */
import { Env } from "./env.ts";
import pino from "pino";

const logger = pino({
  level: Env.LOG_LEVEL,
  base: { service: "hospital-management" },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export default logger;