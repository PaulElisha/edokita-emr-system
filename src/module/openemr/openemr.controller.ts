import { Env } from "@/env.ts";
import APIError from "@error/APIError.ts";
import asyncHandler from "@middleware/async-handler.ts";
import type { AuthRequest, OpenEMRRequest } from "@shared/http.ts";
import { requireUserId } from "@module/auth/helper.ts";
import OpenEMRService, {
 type CallbackQuery,
} from "@module/openemr/openemr.service.ts";
import type { Request, Response } from "express";

class OpenEMRController {
 authorize = asyncHandler(async (req: AuthRequest, res: Response) => {
  const [data, err] = await OpenEMRService.startAuthorization(requireUserId(req));
  if (err) throw err;
  res.json({ success: true, data });
 });

 refresh = asyncHandler(async (req: AuthRequest, res: Response) => {
  const [data, err] = await OpenEMRService.refresh(requireUserId(req));
  if (err) throw err;
  res.json({ success: true, data });
 });

 ping = asyncHandler(async (req: OpenEMRRequest, res: Response) => {
  const data = await req.openemr.standardGet("/api/version");
  res.json({ success: true, data });
 });

 handleCallback = async (
  req: Request<unknown, unknown, unknown, CallbackQuery>,
  res: Response,
 ) => {
  const code = req.query.code ?? "";
  const state = req.query.state ?? "";
  const error = req.query.error
   ? (req.query.error_description ?? req.query.error)
   : "";
  try {
   if (error) throw APIError.badRequest(error);
   if (!code || !state) throw APIError.badRequest("Missing code or state");
   const [, err] = await OpenEMRService.handleCallback(code, state);
   if (err) throw err;
   res.redirect(`${Env.FRONTEND_URL}/auth/callback?connected=1`);
  } catch (e) {
   const message = e instanceof Error ? e.message : "authorization_failed";
   res.redirect(
    `${Env.FRONTEND_URL}/auth/callback?error=${encodeURIComponent(message)}`,
   );
  }
 };
}

export default new OpenEMRController();
