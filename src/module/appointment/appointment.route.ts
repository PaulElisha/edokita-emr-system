/** @format */
import { authenticate, withOpenEMR } from "@middleware/auth.ts";
import { requireRole } from "@middleware/role-guard.ts";
import validate from "@middleware/validation.ts";
import AppointmentController from "@module/appointment/appointment.controller.ts";
import {
 appointmentBodySchema,
 appointmentListQuerySchema,
 slotsQuerySchema,
} from "@module/appointment/appointment.service.ts";
import { idParamSchema } from "@shared/schemas/params.ts";
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
   withOpenEMR,
   requireRole("admin", "doctor", "patient"),
   validate(appointmentListQuerySchema, "query"),
   AppointmentController.getAppointments,
  );
  this.router.get(
   "/categories",
   authenticate,
   withOpenEMR,
   requireRole("admin", "doctor", "patient"),
   AppointmentController.categories,
  );
  this.router.get(
   "/slots",
   authenticate,
   withOpenEMR,
   requireRole("admin", "doctor", "patient"),
   validate(slotsQuerySchema, "query"),
   AppointmentController.slots,
  );
  this.router.get(
   "/:id",
   authenticate,
   withOpenEMR,
   requireRole("admin", "doctor", "patient"),
   validate(idParamSchema, "params"),
   AppointmentController.getAppointment,
  );
  this.router.post(
   "/",
   authenticate,
   withOpenEMR,
   requireRole("admin", "doctor", "patient"),
   validate(appointmentBodySchema),
   AppointmentController.create,
  );
 }
}

export default new AppointmentRouter().router;
