/** @format */
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { param } from "@shared/lib/http.ts";
import {
  getClinical,
  getClinicalSummary,
  getEncounter,
  getObservations,
} from "@module/emr/emr.service.ts";

const CLINICAL_KINDS = [
  "conditions",
  "allergies",
  "medications",
  "immunizations",
  "procedures",
  "encounters",
] as const;
const clinicalKindSchema = z.enum(CLINICAL_KINDS);

export async function summary(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getClinicalSummary(param(req, "patientId"));
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

export async function clinical(req: Request, res: Response, next: NextFunction) {
  try {
    const kind = clinicalKindSchema.parse(param(req, "kind"));
    const data = await getClinical(param(req, "patientId"), kind);
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

export async function vitals(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getObservations(param(req, "patientId"), "vital-signs");
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

export async function labs(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getObservations(param(req, "patientId"), "laboratory");
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

export async function encounter(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getEncounter(param(req, "patientId"), param(req, "encounterId"));
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}