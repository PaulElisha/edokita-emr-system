import logger from "@app/logger.ts";
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import HttpStatus from "@enum/http.ts";
import ErrorCode from "@enum/error-code.ts";
import AppError from "@error/app-error.ts";

function trace(req: Request) {
 return {
  method: req.method,
  path: req.originalUrl,
  userId: req.user?.userId,
  role: req.user?.role,
 };
}

export function errorHandler(
 err: unknown,
 req: Request,
 res: Response,
 _next: NextFunction,
): void {
 if (err instanceof AppError) {
  const level = err.statusCode >= 500 ? "error" : "warn";
  logger[level](
   { err, ...trace(req) },
   `${err.errorCode} (${err.statusCode}): ${err.message}`,
  );
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
  logger.warn({ err, ...trace(req) }, `Validation failed: ${err.message}`);
  res.status(HttpStatus.UNPROCESSABLE_ENTITY).json({
   success: false,
   error: {
    message: err.message,
    code: ErrorCode.VALIDATION_ERROR,
    status: HttpStatus.UNPROCESSABLE_ENTITY,
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

 if (err instanceof SyntaxError) {
  logger.warn({ err, ...trace(req) }, "Malformed request body");
  res.status(HttpStatus.BAD_REQUEST).json({
   success: false,
   error: {
    message: err.message,
    code: ErrorCode.BAD_REQUEST,
    status: HttpStatus.BAD_REQUEST,
   },
  });
  return;
 }

 logger.error({ err, ...trace(req) }, "Unhandled error");
 res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
  success: false,
  error: {
   message: "Internal server error",
   code: ErrorCode.INTERNAL_SERVER_ERROR,
   status: HttpStatus.INTERNAL_SERVER_ERROR,
  },
 });
}
