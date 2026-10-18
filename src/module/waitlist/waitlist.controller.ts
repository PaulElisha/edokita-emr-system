import asyncHandler from "@middleware/async-handler.ts";
import type { IdParam } from "@shared/schemas/params.ts";
import type { AuthRequest } from "@shared/http.ts";
import { actor } from "@module/auth/helper.ts";
import type { Response } from "express";
import WaitlistService, {
 type CreateWaitlistInput,
 type WaitlistQuery,
} from "@module/waitlist/waitlist.service.ts";

class WaitlistController {
 list = asyncHandler(
  async (
   req: AuthRequest<unknown, unknown, unknown, WaitlistQuery>,
   res: Response,
  ) => {
   const [data, err] = await WaitlistService.list(req.query, actor(req));
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 create = asyncHandler(
  async (
   req: AuthRequest<unknown, unknown, CreateWaitlistInput>,
   res: Response,
  ) => {
   const [data, err] = await WaitlistService.create(req.body, actor(req));
   if (err) throw err;
   res.status(201).json({ success: true, data });
  },
 );

 remove = asyncHandler(async (req: AuthRequest<IdParam>, res: Response) => {
  const [data, err] = await WaitlistService.remove(
   req.params.id,
   actor(req),
  );
  if (err) throw err;
  res.json({ success: true, data });
 });
}

export default new WaitlistController();
