import asyncHandler from "@middleware/async-handler.ts";
import type { IdParam } from "@shared/schemas/params.ts";
import type { AuthRequest } from "@shared/http.ts";
import type { Response } from "express";
import { requireUserId } from "@module/auth/helper.ts";
import MessagingService, {
 type CreateThreadInput,
 type SendMessageInput,
 type ThreadListQuery,
} from "@module/messaging/messaging.service.ts";

class MessagingController {
 listThreads = asyncHandler(
  async (
   req: AuthRequest<unknown, unknown, unknown, ThreadListQuery>,
   res: Response,
  ) => {
   const [data, err] = await MessagingService.listThreads(
    req.query,
    requireUserId(req),
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
    requireUserId(req),
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
    requireUserId(req),
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
    requireUserId(req),
   );
   if (err) throw err;
   res.status(201).json({ success: true, data });
  },
 );

 markRead = asyncHandler(
  async (req: AuthRequest<IdParam>, res: Response) => {
   const [data, err] = await MessagingService.markRead(
    req.params.id,
    requireUserId(req),
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );
}

export default new MessagingController();
