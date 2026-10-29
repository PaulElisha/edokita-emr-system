import { authenticate } from "@middleware/auth.ts";
import { requirePatientScope } from "@middleware/patient-scope.ts";
import { requireRole } from "@middleware/role-guard.ts";
import validate from "@middleware/validation.ts";
import WaitlistController from "@module/waitlist/waitlist.controller.ts";
import {
 waitlistBodySchema,
 waitlistQuerySchema,
} from "@module/waitlist/waitlist.service.ts";
import { idParamSchema } from "@shared/schemas/params.ts";
import { authUserSchema } from "@module/user/helper.ts";
import { Router } from "express";

class WaitlistRouter {
 router: Router;

 constructor() {
  this.router = Router();
  this.initializeRoutes();
 }

 initializeRoutes() {
  this.router.use(authenticate, validate(authUserSchema, "user"));

  this.router.get(
   "/",
   requireRole("admin", "doctor", "patient"),
   validate(waitlistQuerySchema, "query"),
   WaitlistController.list,
  );
  this.router.post(
   "/",
   requireRole("admin", "doctor", "patient"),
   validate(waitlistBodySchema),
   requirePatientScope("body"),
   WaitlistController.create,
  );
  this.router.delete(
   "/:id",
   requireRole("admin", "doctor", "patient"),
   validate(idParamSchema, "params"),
   WaitlistController.remove,
  );
 }
}

export default new WaitlistRouter().router;
