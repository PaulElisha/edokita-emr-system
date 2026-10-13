/** @format */
import { Env } from "@/env.ts";
import pino from "pino";

const logger = pino({
 level: process.env.NODE_ENV === "production" ? Env.LOG_LEVEL : "debug",
});

export default logger;
