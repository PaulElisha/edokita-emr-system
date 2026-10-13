/** @format */
import logger from "@app/logger.ts";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import HttpStatus from "@enum/http.ts";
import ErrorCode from "@enum/error-code.ts";
import AppError from "@error/app-error.ts";

export function errorHandler(
 err: unknown,
 _req: Request,
 res: Response,
 _next: NextFunction,
): void {
 if (err instanceof AppError) {
  res.status(err.statusCode).json({
   success: false,
   error: {
    message: err.message,
    code: err.errorCode,
    status: err.statusCode,
    details: err.details,
   },
  });
  return;
 }

 if (err instanceof ZodError) {
  res.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
   success: false,
   error: {
    message: err.message,
    details: err.issues.map((i) => ({
     path: i.path.join("."),
     message: i.message,
    })),
    name: err.name,
    type: err.type,
    cause: err.cause,
   },
  });
  return;
 }

 logger.error({ err }, "Unhandled error");
 res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
  success: false,
  error: {
   message: "Internal server error",
   code: ErrorCode.INTERNAL_SERVER_ERROR,
   status: HttpStatus.INTERNAL_SERVER_ERROR,
  },
 });
}
