/** @format */
import ErrorCode from "../enum/error-code.ts";
import HttpStatus from "../enum/http.ts";
import BadRequestException from "./bad-request.ts";
import ConflictException from "./conflict.ts";
import ForbiddenException from "./forbidden.ts";
import InternalServerError from "./internal-server.ts";
import MethodNotAllowedException from "./method-not-allowed.ts";
import NotFoundException from "./not-found.ts";
import OpenEMRException from "./openemr.ts";
import TooManyRequestsException from "./too-many-requests.ts";
import UnauthorizedExceptionError from "./unauthorized.ts";
import ValidationException from "./validation.ts";
import type { HttpStatusCodeType } from "@enum/http.ts";

export function notFound(message = "Resource not found") {
 return new NotFoundException(
  message,
  HttpStatus.NOT_FOUND,
  ErrorCode.RESOURCE_NOT_FOUND,
 );
}

export function badRequest(message: string) {
 return new BadRequestException(
  message,
  HttpStatus.BAD_REQUEST,
  ErrorCode.BAD_REQUEST,
 );
}

export function internalServer(message: string) {
 return new InternalServerError(
  message,
  HttpStatus.INTERNAL_SERVER_ERROR,
  ErrorCode.INTERNAL_SERVER_ERROR,
 );
}

export function unauthorized(message = "Unauthorized, Please sign in") {
 return new UnauthorizedExceptionError(
  message,
  HttpStatus.UNAUTHORIZED,
  ErrorCode.AUTH_UNAUTHORIZED_ACCESS,
 );
}

export function forbidden(message = "Forbidden") {
 return new ForbiddenException(
  message,
  HttpStatus.FORBIDDEN,
  ErrorCode.ACCESS_UNAUTHORIZED,
 );
}

export function validation(message = "Validation failed") {
 return new ValidationException(
  message,
  HttpStatus.UNPROCESSABLE_ENTITY,
  ErrorCode.VALIDATION_ERROR,
 );
}

export function conflict(message = "Resource already exists") {
 return new ConflictException(
  message,
  HttpStatus.CONFLICT,
  ErrorCode.RESOURCE_CONFLICT,
 );
}

export function methodNotAllowed(message = "Method not allowed") {
 return new MethodNotAllowedException(
  message,
  HttpStatus.METHOD_NOT_ALLOWED,
  ErrorCode.METHOD_NOT_ALLOWED,
 );
}

export function tooManyRequests(message = "Too many requests") {
 return new TooManyRequestsException(
  message,
  HttpStatus.TOO_MANY_REQUESTS,
  ErrorCode.TOO_MANY_REQUESTS,
 );
}

export function openEmr(
 message = "Upstream OpenEMR request failed",
 statusCode: HttpStatusCodeType = HttpStatus.BAD_GATEWAY,
 details?: unknown,
) {
 return new OpenEMRException(
  message,
  statusCode,
  ErrorCode.OPENEMR_API_ERROR,
  details,
 );
}
