/** @format */
import AppError from "@error/app-error.ts";
import type { HttpStatusCodeType } from "@enum/http.ts";
import type { ErrorCodeType } from "@enum/error-code.ts";

export default class MethodNotAllowedException extends AppError {
 constructor(
  public message: string,
  public statusCode: HttpStatusCodeType,
  public errorCode: ErrorCodeType,
 ) {
  super(message, statusCode, errorCode);
 }
}
