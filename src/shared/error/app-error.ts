/** @format */
import type { HttpStatusCodeType } from "@enum/http.ts";
import type { ErrorCodeType } from "@enum/error-code.ts";

export default class AppError extends Error {
 constructor(
  public message: string,
  public statusCode: HttpStatusCodeType,
  public errorCode: ErrorCodeType,
  public details?: unknown,
 ) {
  super(message);
  this.name = this.constructor.name;
  this.message = message;
  this.statusCode = statusCode;
  this.errorCode = errorCode;
  this.details = details;
  Error.captureStackTrace(this, this.constructor);
 }
}
