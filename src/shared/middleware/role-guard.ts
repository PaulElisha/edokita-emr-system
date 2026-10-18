import { type RoleName } from "@db/schema/role.ts";
import APIError from "@error/APIError.ts";
import type { NextFunction, Request, Response } from "express";

export const requireRole =
 (...roles: RoleName[]) =>
 (req: Request, _res: Response, next: NextFunction) => {
  if (!req.user) return next(APIError.unauthorized());
  if (!roles.includes(req.user.role)) {
   return next(APIError.forbidden("Insufficient role permissions"));
  }
  next();
 };

export default requireRole;
