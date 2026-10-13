/** @format */
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { param } from "@shared/lib/http.ts";
import { createDoctor, getDoctor, listDoctors } from "@module/doctor/doctor.service.ts";

const listQuerySchema = z.object({
  search: z.string().optional(),
  family: z.string().optional(),
  given: z.string().optional(),
  active: z.enum(["true", "false"]).optional(),
  _count: z.coerce.number().int().min(1).max(200).optional(),
});

const createBodySchema = z.object({
  fname: z.string().min(1),
  lname: z.string().min(1),
  mname: z.string().optional(),
  npi: z.string().optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  specialty: z.string().optional(),
});

export async function index(req: Request, res: Response, next: NextFunction) {
  try {
    const query = listQuerySchema.parse(req.query);
    const data = await listDoctors(query);
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

export async function show(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getDoctor(param(req, "id"));
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createBodySchema.parse(req.body);
    const data = await createDoctor(input);
    res.status(201).json({ success: true, data });
  } catch (e) {
    next(e);
  }
}