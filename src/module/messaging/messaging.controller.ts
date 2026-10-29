import AsyncHandler from "@middleware/async-handler.ts";
import type { IdParam } from "@shared/schemas/params.ts";
import type { AuthRequest } from "@shared/http.ts";
import type { Response } from "express";
import MessagingService, {
 type CreateThreadInput,
 type SendMessageInput,
 type ThreadListQuery,
} from "@module/messaging/messaging.service.ts";

class MessagingController {
 listThreads = AsyncHandler(
  async (
   req: AuthRequest<unknown, unknown, unknown, ThreadListQuery>,
   res: Response,
  ) => {
   const [data, err] = await MessagingService.listThreads(
    req.query,
    req.user,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 createThread = AsyncHandler(
  async (
   req: AuthRequest<unknown, unknown, CreateThreadInput>,
   res: Response,
  ) => {
   const [data, err] = await MessagingService.createThread(
    req.body,
    req.user,
   );
   if (err) throw err;
   res.status(201).json({ success: true, data });
  },
 );

 listMessages = AsyncHandler(
  async (
   req: AuthRequest<IdParam, unknown, unknown, ThreadListQuery>,
   res: Response,
  ) => {
   const [data, err] = await MessagingService.listMessages(
    req.params.id,
    req.user,
    req.query,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 send = AsyncHandler(
  async (
   req: AuthRequest<IdParam, unknown, SendMessageInput>,
   res: Response,
  ) => {
   const [data, err] = await MessagingService.send(
    req.params.id,
    req.body,
    req.user,
   );
   if (err) throw err;
   res.status(201).json({ success: true, data });
  },
 );

 markRead = AsyncHandler(
  async (req: AuthRequest<IdParam>, res: Response) => {
   const [data, err] = await MessagingService.markRead(
    req.params.id,
    req.user,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );
}

export default new MessagingController();
