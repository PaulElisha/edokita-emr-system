import { authenticate } from "@middleware/auth.ts";
import validate from "@middleware/validation.ts";
import NotificationController from "@module/notification/notification.controller.ts";
import { notificationQuerySchema } from "@module/notification/notification.service.ts";
import { idParamSchema } from "@shared/schemas/params.ts";
import { Router } from "express";

class NotificationRouter {
 router: Router;

 constructor() {
  this.router = Router();
  this.initializeRoutes();
 }

 initializeRoutes() {
  this.router.use(authenticate);

  this.router.get(
   "/",
   validate(notificationQuerySchema, "query"),
   NotificationController.list,
  );
  this.router.post("/read-all", NotificationController.markAllRead);
  this.router.post(
   "/:id/read",
   validate(idParamSchema, "params"),
   NotificationController.markRead,
  );
 }
}

export default new NotificationRouter().router;
