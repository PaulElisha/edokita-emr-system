/** @format */
import type { NextFunction, Request, Response } from "express";
import { getStats, listFacilities, listUsers } from "@module/admin/admin.service.ts";

export async function stats(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getStats();
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

export async function users(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await listUsers();
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

export async function facilities(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await listFacilities();
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}