/** @format */
import { authenticate } from "@middleware/auth.ts";
import { requireRole } from "@middleware/role-guard.ts";
import validate from "@middleware/validation.ts";
import ScheduleController from "@module/schedule/schedule.controller.ts";
import {
 practitionerParamSchema,
 scheduleBodySchema,
} from "@module/schedule/schedule.service.ts";
import { Router } from "express";

class ScheduleRouter {
 router: Router;

 constructor() {
  this.router = Router();
  this.initializeRoutes();
 }

 initializeRoutes() {
  this.router.use(authenticate);

  this.router.get(
   "/:practitionerId",
   requireRole("admin", "doctor", "patient"),
   validate(practitionerParamSchema, "params"),
   ScheduleController.list,
  );
  this.router.put(
   "/:practitionerId",
   requireRole("admin", "doctor"),
   validate(practitionerParamSchema, "params"),
   validate(scheduleBodySchema),
   ScheduleController.updateSchedule,
  );
 }
}

export default new ScheduleRouter().router;
