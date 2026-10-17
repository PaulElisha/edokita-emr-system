/** @format */
import OpenEMRClient, { openemr } from "@module/openemr/client.ts";
import APIError from "@error/APIError.ts";
import AppError from "@error/app-error.ts";
import { verifyAppToken } from "@auth/jwt.ts";
import { getOpenEMRToken } from "@module/auth/helper.ts";
import { findUserById } from "@module/user/helper.ts";
import { errors as jwtErrors } from "jose";
import type { NextFunction, Request, Response } from "express";

export const authenticate = async (
 req: Request,
 _res: Response,
 next: NextFunction,
) => {
 const header = req.header("authorization") ?? "";
 const [scheme, token] = header.split(" ");
 if (scheme?.toLowerCase() !== "bearer" || !token) {
  return next(APIError.unauthorized());
 }
 try {
  // Full verification (signature, issuer, audience, expiry, required claims):
  // any failure is an auth problem, not a server fault.
  const payload = await verifyAppToken(token);
  if (!payload.userId) {
   return next(APIError.unauthorized("Invalid session token"));
  }
  const [user, err] = await findUserById(payload.userId);
  if (err || !user) {
   return next(APIError.unauthorized("Invalid session token"));
  }
  // Instant revocation: a token minted before the latest logout/password
  // change carries a stale epoch and is rejected without any extra query.
  if ((payload.sessionEpoch ?? 0) !== user.sessionEpoch) {
   return next(APIError.unauthorized("Session no longer valid"));
  }
  req.user = payload;
  return next();
 } catch (e) {
  if (e instanceof AppError) return next(e);
  if (e instanceof jwtErrors.JWTExpired) {
   return next(APIError.unauthorized("Session expired, please sign in again"));
  }
  return next(APIError.unauthorized("Invalid session token"));
 }
};

/**
 * Attaches an OpenEMR client to the request.
 *
 * Staff (doctor/admin) get a client bound to their own per-user OAuth tokens
 * (auto-refreshing). Patients cannot mint a patient-context token through the
 * provider login flow, so they share the service-account client; ownership is
 * enforced downstream in app code.
 */
export const withOpenEMR = async (
 req: Request,
 _res: Response,
 next: NextFunction,
) => {
 if (!req.user) {
  return next(APIError.unauthorized());
 }
 if (req.user.role === "patient") {
  req.openemr = openemr;
  return next();
 }
 const userId = req.user.userId;
 req.openemr = new OpenEMRClient(async (force?: boolean) => {
  const [token, err] = await getOpenEMRToken(userId, force);
  if (err || !token) throw err;
  return token;
 });
 next();
};
