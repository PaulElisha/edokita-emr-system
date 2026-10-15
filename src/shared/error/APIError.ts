/** @format */
import ErrorCode from "../enum/error-code.ts";
import HttpStatus from "../enum/http.ts";
import AppError from "./app-error.ts";
import type { HttpStatusCodeType } from "@enum/http.ts";

class APIError {
 notFound = (message = "Resource not found") =>
  new AppError(message, HttpStatus.NOT_FOUND, ErrorCode.RESOURCE_NOT_FOUND);

 badRequest = (message: string) =>
  new AppError(message, HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST);

 internalServer = (message: string) =>
  new AppError(
   message,
   HttpStatus.INTERNAL_SERVER_ERROR,
   ErrorCode.INTERNAL_SERVER_ERROR,
  );

 unauthorized = (message = "Unauthorized, Please sign in") =>
  new AppError(
   message,
   HttpStatus.UNAUTHORIZED,
   ErrorCode.AUTH_UNAUTHORIZED_ACCESS,
  );

 forbidden = (message = "Forbidden") =>
  new AppError(message, HttpStatus.FORBIDDEN, ErrorCode.ACCESS_UNAUTHORIZED);

 validation = (message = "Validation failed") =>
  new AppError(
   message,
   HttpStatus.UNPROCESSABLE_ENTITY,
   ErrorCode.VALIDATION_ERROR,
  );

 conflict = (message = "Resource already exists") =>
  new AppError(message, HttpStatus.CONFLICT, ErrorCode.RESOURCE_CONFLICT);

 methodNotAllowed = (message = "Method not allowed") =>
  new AppError(
   message,
   HttpStatus.METHOD_NOT_ALLOWED,
   ErrorCode.METHOD_NOT_ALLOWED,
  );

 tooManyRequests = (message = "Too many requests") =>
  new AppError(
   message,
   HttpStatus.TOO_MANY_REQUESTS,
   ErrorCode.TOO_MANY_REQUESTS,
  );

 openEmr = (
  message = "Upstream OpenEMR request failed",
  statusCode: HttpStatusCodeType = HttpStatus.BAD_GATEWAY,
  details?: unknown,
 ) => new AppError(message, statusCode, ErrorCode.OPENEMR_API_ERROR, details);
}

export default new APIError();
