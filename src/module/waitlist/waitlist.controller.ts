import AsyncHandler from "@middleware/async-handler.ts";
import type { IdParam } from "@shared/schemas/params.ts";
import type { AuthRequest } from "@shared/http.ts";
import type { Response } from "express";
import WaitlistService, {
 type CreateWaitlistInput,
 type WaitlistQuery,
} from "@module/waitlist/waitlist.service.ts";

class WaitlistController {
 list = AsyncHandler(
  async (
   req: AuthRequest<unknown, unknown, unknown, WaitlistQuery>,
   res: Response,
  ) => {
   const [data, err] = await WaitlistService.list(req.query, req.user);
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 create = AsyncHandler(
  async (
   req: AuthRequest<unknown, unknown, CreateWaitlistInput>,
   res: Response,
  ) => {
   const [data, err] = await WaitlistService.create(req.body, req.user);
   if (err) throw err;
   res.status(201).json({ success: true, data });
  },
 );

 remove = AsyncHandler(async (req: AuthRequest<IdParam>, res: Response) => {
  const [data, err] = await WaitlistService.remove(
   req.params.id,
   req.user,
  );
  if (err) throw err;
  res.json({ success: true, data });
 });
}

export default new WaitlistController();
