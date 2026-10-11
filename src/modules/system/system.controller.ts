/** @format */
import type { NextFunction, Request, Response } from "express";
import { getCapabilityStatement, getVersion } from "./system.service.ts";

export async function version(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getVersion();
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}

export async function capability(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await getCapabilityStatement();
    res.json({ success: true, data });
  } catch (e) {
    next(e);
  }
}