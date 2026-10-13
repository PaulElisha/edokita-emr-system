/** @format */
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { param } from "@shared/lib/http.ts";
import {
  createAppointment,
  getAppointment,
  listAppointments,
} from "@module/appointment/appointment.service.ts";

const listQuerySchema = z.object({
  patient: z.string().optional(),
  practitioner: z.string().optional(),
  date: z.string().optional(),
  status: z.string().optional(),
  _count: z.coerce.number().int().min(1).max(200).optional(),
});

const createBodySchema = z.object({
  patientId: z.string().min(1),
  doctorId: z.string().optional(),
  start: z.string().min(1),
  end: z.string().optional(),
  durationMinutes: z.coerce.number().int().min(5).max(600).optional(),
  type: z.string().optional(),
  description: z.string().optional(),
});

export async function index(req: Request, res: Response, next: NextFunction) {
  try {
    const query = listQuerySchema.parse(req.query);
    const data = await listAppointments(query);
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

export async function show(req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getAppointment(param(req, "id"));
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

export async function create(req: Request, res: Response, next: NextFunction) {
  try {
    const input = createBodySchema.parse(req.body);
    const data = await createAppointment(input);
    res.status(201).json({ success: true, data });
  } catch (e) {
    next(e);
  }
}