/** @format */
import type { JwtPayload } from "@auth/jwt.ts";
import asyncHandler from "@middleware/async-handler.ts";
import type { IdParam } from "@shared/schemas/params.ts";
import type { AuthRequest } from "@shared/http.ts";
import type { Response } from "express";
import NotificationService, {
 type NotificationQuery,
} from "@module/notification/notification.service.ts";

function userId(req: { user: JwtPayload }): string {
 return req.user.userId;
}

class NotificationController {
 list = asyncHandler(
  async (
   req: AuthRequest<unknown, unknown, unknown, NotificationQuery>,
   res: Response,
  ) => {
   const [data, err] = await NotificationService.list(userId(req), req.query);
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 markRead = asyncHandler(async (req: AuthRequest<IdParam>, res: Response) => {
  const [data, err] = await NotificationService.markRead(
   userId(req),
   req.params.id,
  );
  if (err) throw err;
  res.json({ success: true, data });
 });

 markAllRead = asyncHandler(async (req: AuthRequest, res: Response) => {
  const [data, err] = await NotificationService.markAllRead(userId(req));
  if (err) throw err;
  res.json({ success: true, data });
 });
}

export default new NotificationController();
