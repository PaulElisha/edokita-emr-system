import AsyncHandler from "@middleware/async-handler.ts";
import type { IdParam } from "@shared/schemas/params.ts";
import type { AuthRequest } from "@shared/http.ts";
import { requireUserId } from "@module/auth/helper.ts";
import type { Response } from "express";
import NotificationService, {
 type NotificationQuery,
} from "@module/notification/notification.service.ts";

class NotificationController {
 list = AsyncHandler(
  async (
   req: AuthRequest<unknown, unknown, unknown, NotificationQuery>,
   res: Response,
  ) => {
   const [data, err] = await NotificationService.list(requireUserId(req), req.query);
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 markRead = AsyncHandler(async (req: AuthRequest<IdParam>, res: Response) => {
  const [data, err] = await NotificationService.markRead(
   requireUserId(req),
   req.params.id,
  );
  if (err) throw err;
  res.json({ success: true, data });
 });

 markAllRead = AsyncHandler(async (req: AuthRequest, res: Response) => {
  const [data, err] = await NotificationService.markAllRead(requireUserId(req));
  if (err) throw err;
  res.json({ success: true, data });
 });
}

export default new NotificationController();
