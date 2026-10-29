/** @format */

import APIError from "@error/APIError.ts";
import type { NextFunction, Request, Response } from "express";

type PatientScopeSource = "body" | "query";

export const requirePatientScope =
 (source: PatientScopeSource = "body") =>
 (req: Request, _res: Response, next: NextFunction): void => {
  const input = req[source] as { patientId?: unknown } | undefined;
  const patientId = req.user?.openemr.patientId ?? input?.patientId;
  if (typeof patientId !== "string" || patientId.length === 0) {
   return next(APIError.badRequest("patientId is required"));
  }
  next();
 };
