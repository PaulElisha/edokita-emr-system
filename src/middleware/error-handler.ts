/** @format */
import { OpenEMRApiError } from "../lib/openemr.ts";
import logger from "../logger.ts";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

export function notFound(_req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: { message: "Route not found", status: 404 },
  });
}

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof OpenEMRApiError) {
    res.status(err.status).json({
      success: false,
      error: {
        message: err.message,
        status: err.status,
        details:
          typeof err.body === "object" && err.body !== null
            ? (err.body as Record<string, unknown>)
            : undefined,
      },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        message: "Validation failed",
        status: 400,
        details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
    });
    return;
  }

  logger.error({ err }, "Unhandled error");
  res.status(500).json({
    success: false,
    error: { message: "Internal server error", status: 500 },
  });
}