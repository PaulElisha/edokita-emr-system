/** @format */
import { authenticate, withOpenEMR } from "@middleware/auth.ts";
import { requireRole } from "@middleware/role-guard.ts";
import validate from "@middleware/validation.ts";
import EmrController from "@module/emr/emr.controller.ts";
import {
 emrClinicalParamSchema,
 emrEncounterParamSchema,
 emrPatientParamSchema,
 encounterBodySchema,
 vitalsBodySchema,
} from "@module/emr/emr.service.ts";
import { Router } from "express";

class EmrRouter {
 router: Router;

 constructor() {
  this.router = Router();
  this.initializeRoutes();
 }

 initializeRoutes() {
  this.router.use(
   authenticate,
   withOpenEMR,
   requireRole("admin", "doctor", "patient"),
  );

  this.router.get(
   "/:patientId/summary",
   validate(emrPatientParamSchema, "params"),
   EmrController.summary,
  );
  this.router.get(
   "/:patientId/clinical/:kind",
   validate(emrClinicalParamSchema, "params"),
   EmrController.clinical,
  );
  this.router.get(
   "/:patientId/vitals",
   validate(emrPatientParamSchema, "params"),
   EmrController.vitals,
  );
  this.router.get(
   "/:patientId/labs",
   validate(emrPatientParamSchema, "params"),
   EmrController.labs,
  );
  this.router.get(
   "/:patientId/encounters",
   validate(emrPatientParamSchema, "params"),
   EmrController.encounters,
  );
  this.router.get(
   "/:patientId/encounters/:encounterId",
   validate(emrEncounterParamSchema, "params"),
   EmrController.encounter,
  );

  this.router.post(
   "/:patientId/encounters",
   validate(emrPatientParamSchema, "params"),
   validate(encounterBodySchema),
   EmrController.createEncounter,
  );
  this.router.post(
   "/:patientId/encounters/:encounterId/vitals",
   validate(emrEncounterParamSchema, "params"),
   validate(vitalsBodySchema),
   EmrController.recordVitals,
  );
 }
}

export default new EmrRouter().router;
