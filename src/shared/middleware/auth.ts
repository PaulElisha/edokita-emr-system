/** @format */
import OpenEMRClient, { openemr } from "@module/openemr/client.ts";
import APIError from "@error/APIError.ts";
import { verifyAppToken } from "@auth/jwt.ts";
import { getOpenEMRToken } from "@module/auth/helper.ts";
import { findUserById } from "@module/user/helper.ts";
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
 verifyAppToken(token)
  .then(async (payload) => {
   const [user] = await findUserById(payload.userId);
   if (!user) throw APIError.unauthorized();
   req.user = payload;
   return next();
  })
  .catch(next);
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
