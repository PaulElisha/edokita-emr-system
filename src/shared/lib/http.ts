/** @format */
import type { Request } from "express";

/** Exp-5 params may be string | string[] | undefined; normalize to string. */
export function param(req: Request, name: string): string {
  const value = req.params[name];
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}