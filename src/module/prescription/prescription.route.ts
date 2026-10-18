import { authenticate, withOpenEMR } from "@middleware/auth.ts";
import { requireRole } from "@middleware/role-guard.ts";
import validate from "@middleware/validation.ts";
import PrescriptionController from "@module/prescription/prescription.controller.ts";
import {
 prescriptionBodySchema,
 prescriptionListQuerySchema,
} from "@module/prescription/prescription.service.ts";
import { idParamSchema } from "@shared/schemas/params.ts";
import { z } from "zod";
import { Router } from "express";

const deleteQuerySchema = z.object({ patientId: z.string().optional() });

class PrescriptionRouter {
 router: Router;

 constructor() {
  this.router = Router();
  this.initializeRoutes();
 }

 initializeRoutes() {
  this.router.use(authenticate, withOpenEMR);

  this.router.get(
   "/",
   requireRole("admin", "doctor", "patient"),
   validate(prescriptionListQuerySchema, "query"),
   PrescriptionController.list,
  );
  this.router.get(
   "/:id",
   requireRole("admin", "doctor"),
   validate(idParamSchema, "params"),
   PrescriptionController.get,
  );
  this.router.post(
   "/",
   requireRole("admin", "doctor"),
   validate(prescriptionBodySchema),
   PrescriptionController.create,
  );
  this.router.delete(
   "/:id",
   requireRole("admin", "doctor"),
   validate(idParamSchema, "params"),
   validate(deleteQuerySchema, "query"),
   PrescriptionController.remove,
  );
 }
}

export default new PrescriptionRouter().router;
