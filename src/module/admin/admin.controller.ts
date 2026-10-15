/** @format */
import asyncHandler from "@middleware/async-handler.ts";
import type { Request, Response } from "express";
import AdminService from "@module/admin/admin.service.ts";

class AdminController {
 stats = asyncHandler(async (req: Request, res: Response) => {
  const [data, err] = await AdminService.stats(req.openemr!);
  if (err) throw err;
  res.json({ success: true, data });
 });

 users = asyncHandler(async (req: Request, res: Response) => {
  const [data, err] = await AdminService.users(req.openemr!);
  if (err) throw err;
  res.json({ success: true, data });
 });

 facilities = asyncHandler(async (req: Request, res: Response) => {
  const [data, err] = await AdminService.facilities(req.openemr!);
  if (err) throw err;
  res.json({ success: true, data });
 });
}

export default new AdminController();
