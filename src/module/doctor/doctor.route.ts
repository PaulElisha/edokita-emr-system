/** @format */
import { authenticate, withOpenEMR } from "@middleware/auth.ts";
import { requireRole } from "@middleware/role-guard.ts";
import validate from "@middleware/validation.ts";
import DoctorController from "@module/doctor/doctor.controller.ts";
import {
 doctorBodySchema,
 doctorListQuerySchema,
} from "@module/doctor/doctor.service.ts";
import { idParamSchema } from "@shared/schemas/params.ts";
import { Router } from "express";

class DoctorRouter {
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
   requireRole("admin"),
   validate(doctorListQuerySchema, "query"),
   DoctorController.index,
  );
  this.router.get(
   "/patients",
   authenticate,
   withOpenEMR,
   requireRole("doctor"),
   DoctorController.myPatients,
  );

  this.router.get(
   "/:id",
   authenticate,
   withOpenEMR,
   requireRole("admin"),
   validate(idParamSchema, "params"),
   DoctorController.show,
  );
  this.router.post(
   "/",
   authenticate,
   withOpenEMR,
   requireRole("admin"),
   validate(doctorBodySchema),
   DoctorController.create,
  );
  this.router.put(
   "/:id",
   authenticate,
   withOpenEMR,
   requireRole("admin", "doctor"),
   validate(idParamSchema, "params"),
   validate(doctorBodySchema),
   DoctorController.update,
  );
 }
}

export default new DoctorRouter().router;
