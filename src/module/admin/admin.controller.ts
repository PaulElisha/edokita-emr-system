import AsyncHandler from "@middleware/async-handler.ts";
import type { OpenEMRRequest } from "@shared/http.ts";
import type { Response } from "express";
import AdminService from "@module/admin/admin.service.ts";

class AdminController {
 stats = AsyncHandler(async (_req: OpenEMRRequest, res: Response) => {
  const [data, err] = await AdminService.stats();
  if (err) throw err;
  res.json({ success: true, data });
 });

 users = AsyncHandler(async (_req: OpenEMRRequest, res: Response) => {
  const [data, err] = await AdminService.users();
  if (err) throw err;
  res.json({ success: true, data });
 });

 facilities = AsyncHandler(async (_req: OpenEMRRequest, res: Response) => {
  const [data, err] = await AdminService.facilities();
  if (err) throw err;
  res.json({ success: true, data });
 });
}

export default new AdminController();
