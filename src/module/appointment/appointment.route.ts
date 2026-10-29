/** @format */

import { authenticate, withOpenEMR } from "@middleware/auth.ts";
import { requireRole } from "@middleware/role-guard.ts";
import validate from "@middleware/validation.ts";
import AppointmentController from "@module/appointment/appointment.controller.ts";
import {
 acceptAppointment,
 cancelAppointment,
 completeAppointment,
 confirmAppointment,
 guardAppointmentUpdate,
 rescheduleAppointment,
} from "@module/appointment/appointment.middleware.ts";
import {
 appointmentBodySchema,
 appointmentListQuerySchema,
 appointmentRescheduleSchema,
 appointmentUpdateSchema,
 slotsQuerySchema,
} from "@module/appointment/appointment.service.ts";
import { idParamSchema } from "@shared/schemas/params.ts";
import { authUserSchema } from "@module/user/helper.ts";
import { Router } from "express";

class AppointmentRouter {
 router: Router;

 constructor() {
  this.router = Router();
  this.initializeRoutes();
 }

 initializeRoutes() {
  this.router.get(
   "/",
   authenticate,
   validate(authUserSchema, "user"),
   withOpenEMR,
   requireRole("admin", "doctor", "patient"),
   validate(appointmentListQuerySchema, "query"),
   AppointmentController.getAppointments,
  );
  this.router.get(
   "/categories",
   authenticate,
   validate(authUserSchema, "user"),
   withOpenEMR,
   requireRole("admin", "doctor", "patient"),
   AppointmentController.categories,
  );
  this.router.get(
   "/slots",
   authenticate,
   validate(authUserSchema, "user"),
   withOpenEMR,
   requireRole("admin", "doctor", "patient"),
   validate(slotsQuerySchema, "query"),
   AppointmentController.slots,
  );
  this.router.get(
   "/:id",
   authenticate,
   validate(authUserSchema, "user"),
   withOpenEMR,
   requireRole("admin", "doctor", "patient"),
   validate(idParamSchema, "params"),
   AppointmentController.getAppointment,
  );
  this.router.post(
   "/",
   authenticate,
   validate(authUserSchema, "user"),
   withOpenEMR,
   requireRole("patient"),
   validate(appointmentBodySchema),
   AppointmentController.create,
  );
  this.router.patch(
   "/:id",
   authenticate,
   validate(authUserSchema, "user"),
   withOpenEMR,
   requireRole("admin", "doctor", "patient"),
   validate(idParamSchema, "params"),
   validate(appointmentUpdateSchema),
   guardAppointmentUpdate,
   AppointmentController.updateAppointment,
  );
  this.router.post(
   "/:id/accept",
   authenticate,
   validate(authUserSchema, "user"),
   withOpenEMR,
   requireRole("admin", "doctor"),
   validate(idParamSchema, "params"),
   acceptAppointment,
   AppointmentController.accept,
  );
  this.router.post(
   "/:id/confirm",
   authenticate,
   validate(authUserSchema, "user"),
   withOpenEMR,
   requireRole("admin", "doctor"),
   validate(idParamSchema, "params"),
   confirmAppointment,
   AppointmentController.confirm,
  );
  this.router.post(
   "/:id/reschedule",
   authenticate,
   validate(authUserSchema, "user"),
   withOpenEMR,
   requireRole("admin", "doctor", "patient"),
   validate(idParamSchema, "params"),
   validate(appointmentRescheduleSchema),
   rescheduleAppointment,
   AppointmentController.reschedule,
  );
  this.router.post(
   "/:id/done",
   authenticate,
   validate(authUserSchema, "user"),
   withOpenEMR,
   requireRole("admin", "doctor"),
   validate(idParamSchema, "params"),
   completeAppointment,
   AppointmentController.done,
  );
  this.router.post(
   "/:id/cancel",
   authenticate,
   validate(authUserSchema, "user"),
   withOpenEMR,
   requireRole("admin", "doctor"),
   validate(idParamSchema, "params"),
   cancelAppointment,
   AppointmentController.cancel,
  );
  this.router.delete(
   "/:id",
   authenticate,
   validate(authUserSchema, "user"),
   withOpenEMR,
   requireRole("admin", "doctor", "patient"),
   validate(idParamSchema, "params"),
   AppointmentController.remove,
  );
 }
}

export default new AppointmentRouter().router;
