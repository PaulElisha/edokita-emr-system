import { authenticate, withOpenEMR } from "@middleware/auth.ts";
import { requireRole } from "@middleware/role-guard.ts";
import validate from "@middleware/validation.ts";
import PatientController from "@module/patient/patient.controller.ts";
import {
 patientBodySchema,
 patientListQuerySchema,
} from "@module/patient/patient.service.ts";
import { idParamSchema } from "@shared/schemas/params.ts";
import { Router } from "express";

class PatientRouter {
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
   validate(patientListQuerySchema, "query"),
   PatientController.index,
  );
  this.router.get(
   "/:id",
   authenticate,
   withOpenEMR,
   requireRole("admin", "doctor"),
   validate(idParamSchema, "params"),
   PatientController.show,
  );
  this.router.post(
   "/",
   authenticate,
   withOpenEMR,
   requireRole("admin"),
   validate(patientBodySchema),
   PatientController.create,
  );
  this.router.put(
   "/:id",
   authenticate,
   withOpenEMR,
   requireRole("admin", "patient"),
   validate(idParamSchema, "params"),
   validate(patientBodySchema),
   PatientController.update,
  );
 }
}

export default new PatientRouter().router;
