/** @format */
import type { JwtPayload } from "@auth/jwt.ts";
import asyncHandler from "@middleware/async-handler.ts";
import type { IdParam } from "@shared/schemas/params.ts";
import type { AuthRequest } from "@shared/http.ts";
import type { Response } from "express";
import MessagingService, {
 type CreateThreadInput,
 type SendMessageInput,
 type ThreadListQuery,
} from "@module/messaging/messaging.service.ts";

function userId(req: { user: JwtPayload }): string {
 return req.user.userId;
}

class MessagingController {
 listThreads = asyncHandler(
  async (
   req: AuthRequest<unknown, unknown, unknown, ThreadListQuery>,
   res: Response,
  ) => {
   const [data, err] = await MessagingService.listThreads(
    req.query,
    userId(req),
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 createThread = asyncHandler(
  async (
   req: AuthRequest<unknown, unknown, CreateThreadInput>,
   res: Response,
  ) => {
   const [data, err] = await MessagingService.createThread(
    req.body,
    userId(req),
   );
   if (err) throw err;
   res.status(201).json({ success: true, data });
  },
 );

 listMessages = asyncHandler(
  async (
   req: AuthRequest<IdParam, unknown, unknown, ThreadListQuery>,
   res: Response,
  ) => {
   const [data, err] = await MessagingService.listMessages(
    req.params.id,
    userId(req),
    req.query,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 send = asyncHandler(
  async (
   req: AuthRequest<IdParam, unknown, SendMessageInput>,
   res: Response,
  ) => {
   const [data, err] = await MessagingService.send(
    req.params.id,
    req.body,
    userId(req),
   );
   if (err) throw err;
   res.status(201).json({ success: true, data });
  },
 );

 markRead = asyncHandler(
  async (req: AuthRequest<IdParam>, res: Response) => {
   const [data, err] = await MessagingService.markRead(
    req.params.id,
    userId(req),
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );
}

export default new MessagingController();
