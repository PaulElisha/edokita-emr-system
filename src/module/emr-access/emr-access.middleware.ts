/** @format */

import APIError from "@error/APIError.ts";
import { hasEmrAccess } from "@module/emr-access/emr-access.service.ts";
import type { NextFunction, Request, Response } from "express";

export const requireEmrAccess = async (
 req: Request,
 _res: Response,
 next: NextFunction,
) => {
 try {
  if (!req.user) return next(APIError.unauthorized());
  if (req.user.role === "admin") return next();

  const rawPatientId = req.params.patientId;
  const patientId = Array.isArray(rawPatientId)
   ? rawPatientId[0]
   : rawPatientId;
  if (!patientId) return next(APIError.badRequest("patientId is required"));

  if (req.user.role === "patient") {
   if (req.user.openemr.patientId !== patientId) {
    return next(APIError.forbidden("You can only access your own EMR"));
   }
   return next();
  }

  if (req.user.role === "doctor") {
   const [allowed, err] = await hasEmrAccess(req.user.userId, patientId);
   if (err) return next(err);
   if (!allowed) {
    return next(
     APIError.forbidden("Request access to this patient's EMR first"),
    );
   }
   return next();
  }

  return next(APIError.forbidden("Insufficient role permissions"));
 } catch (e) {
  next(e);
 }
};
