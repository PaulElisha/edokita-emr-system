/** @format */
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { param } from "../../lib/http.ts";
import { createPatient, getPatient, listPatients } from "./patient.service.ts";

const listQuerySchema = z.object({
  search: z.string().optional(),
  given: z.string().optional(),
  family: z.string().optional(),
  gender: z.string().optional(),
  birthDate: z.string().optional(),
  _count: z.coerce.number().int().min(1).max(200).optional(),
});

const createBodySchema = z.object({
  fname: z.string().min(1),
  mname: z.string().optional(),
  lname: z.string().min(1),
  birthDate: z.string().min(1),
  gender: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  postalCode: z.string().optional(),
  countryCode: z.string().optional(),
});

export async function index(req: Request, res: Response, next: NextFunction) {
  try {
    const query = listQuerySchema.parse(req.query);
    const data = await listPatients(query);
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

export async function show(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getPatient(param(req, "id"));
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createBodySchema.parse(req.body);
    const data = await createPatient(input);
    res.status(201).json({ success: true, data });
  } catch (e) {
    next(e);
  }
}