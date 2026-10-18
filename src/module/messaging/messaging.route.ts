import { authenticate } from "@middleware/auth.ts";
import validate from "@middleware/validation.ts";
import MessagingController from "@module/messaging/messaging.controller.ts";
import {
 messageBodySchema,
 threadBodySchema,
 threadListQuerySchema,
} from "@module/messaging/messaging.service.ts";
import { idParamSchema } from "@shared/schemas/params.ts";
import { Router } from "express";

class MessagingRouter {
 router: Router;

 constructor() {
  this.router = Router();
  this.initializeRoutes();
 }

 initializeRoutes() {
  this.router.use(authenticate);

  this.router.get(
   "/",
   validate(threadListQuerySchema, "query"),
   MessagingController.listThreads,
  );
  this.router.post(
   "/",
   validate(threadBodySchema),
   MessagingController.createThread,
  );
  this.router.get(
   "/:id/messages",
   validate(idParamSchema, "params"),
   validate(threadListQuerySchema, "query"),
   MessagingController.listMessages,
  );
  this.router.post(
   "/:id/messages",
   validate(idParamSchema, "params"),
   validate(messageBodySchema),
   MessagingController.send,
  );
  this.router.post(
   "/:id/read",
   validate(idParamSchema, "params"),
   MessagingController.markRead,
  );
 }
}

export default new MessagingRouter().router;
