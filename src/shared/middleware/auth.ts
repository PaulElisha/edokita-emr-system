/** @format */

import OpenEMRClient, { openemr } from "../../config/openemr-client/client.ts";
import APIError from "@error/APIError.ts";
import AppError from "@error/app-error.ts";
import { verifyAppToken } from "@auth/jwt.ts";
import { runWithOpenEMR } from "@openemr/context.ts";
import { getOpenEMRToken } from "@openemr/service.config.ts";
import { findUserById, type AuthUser } from "@module/user/helper.ts";
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
  const payload = await verifyAppToken(token);
  if (!payload.userId) {
   return next(APIError.unauthorized("Invalid session token"));
  }
  const [user, err] = await findUserById(payload.userId);
  if (err || !user) {
   return next(APIError.unauthorized("Invalid session token"));
  }
  if ((payload.sessionEpoch ?? 0) !== user.sessionEpoch) {
   return next(APIError.unauthorized("Session no longer valid"));
  }
  req.user = { ...payload, ...user } as AuthUser;
  return next();
 } catch (e) {
  if (e instanceof AppError) return next(e);
  if (e instanceof jwtErrors.JWTExpired) {
   return next(APIError.unauthorized("Session expired, please sign in again"));
  }
  return next(APIError.unauthorized("Invalid session token"));
 }
};

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
  return runWithOpenEMR(openemr, next);
 }
 const userId = req.user.userId;
 req.openemr = new OpenEMRClient(async (force?: boolean) => {
  const [token, err] = await getOpenEMRToken(userId, force);
  if (err || !token) throw err;
  return token;
 });
 return runWithOpenEMR(req.openemr, next);
};
