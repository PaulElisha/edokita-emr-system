import AsyncHandler from "@middleware/async-handler.ts";
import type { Request, Response } from "express";
import SystemService from "@module/system/system.service.ts";

class SystemController {
 version = AsyncHandler(async (_req: Request, res: Response) => {
  const [data, err] = await SystemService.version();
  if (err) throw err;
  res.json({ success: true, data });
 });

 capability = AsyncHandler(async (_req: Request, res: Response) => {
  const [data, err] = await SystemService.capability();
  if (err) throw err;
  res.json({ success: true, data });
 });
}

export default new SystemController();
