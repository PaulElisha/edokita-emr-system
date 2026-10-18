import { authenticate, withOpenEMR } from "@middleware/auth.ts";
import { requireRole } from "@middleware/role-guard.ts";
import validate from "@middleware/validation.ts";
import EmrController from "@module/emr/emr.controller.ts";
import {
 allergyBodySchema,
 conditionBodySchema,
 emrClinicalItemParamSchema,
 emrClinicalParamSchema,
 emrEncounterParamSchema,
 emrObservationParamSchema,
 emrPatientParamSchema,
 emrSoapNoteParamSchema,
 emrVitalItemParamSchema,
 encounterBodySchema,
 medicationBodySchema,
 soapNoteBodySchema,
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
  this.router.use(authenticate, withOpenEMR);

  this.router.get(
   "/:patientId/summary",
   requireRole("admin", "doctor", "patient"),
   validate(emrPatientParamSchema, "params"),
   EmrController.summary,
  );
  this.router.get(
   "/:patientId/clinical/:kind",
   requireRole("admin", "doctor", "patient"),
   validate(emrClinicalParamSchema, "params"),
   EmrController.clinical,
  );
  this.router.get(
   "/:patientId/vitals",
   requireRole("admin", "doctor", "patient"),
   validate(emrPatientParamSchema, "params"),
   EmrController.vitals,
  );
  this.router.get(
   "/:patientId/labs",
   requireRole("admin", "doctor", "patient"),
   validate(emrPatientParamSchema, "params"),
   EmrController.labs,
  );
  this.router.get(
   "/:patientId/labs/:observationId",
   requireRole("admin", "doctor", "patient"),
   validate(emrObservationParamSchema, "params"),
   EmrController.labObservation,
  );
  this.router.get(
   "/:patientId/encounters",
   requireRole("admin", "doctor", "patient"),
   validate(emrPatientParamSchema, "params"),
   EmrController.encounters,
  );
  this.router.get(
   "/:patientId/encounters/:encounterId",
   requireRole("admin", "doctor", "patient"),
   validate(emrEncounterParamSchema, "params"),
   EmrController.encounter,
  );

  this.router.post(
   "/:patientId/encounters",
   requireRole("admin", "doctor"),
   validate(emrPatientParamSchema, "params"),
   validate(encounterBodySchema),
   EmrController.createEncounter,
  );
  this.router.post(
   "/:patientId/encounters/:encounterId/vitals",
   requireRole("admin", "doctor"),
   validate(emrEncounterParamSchema, "params"),
   validate(vitalsBodySchema),
   EmrController.recordVitals,
  );
  this.router.put(
   "/:patientId/encounters/:encounterId/vitals/:vitalId",
   requireRole("admin", "doctor"),
   validate(emrVitalItemParamSchema, "params"),
   validate(vitalsBodySchema),
   EmrController.updateVitals,
  );

  this.router.post(
   "/:patientId/conditions",
   requireRole("admin", "doctor"),
   validate(emrPatientParamSchema, "params"),
   validate(conditionBodySchema),
   EmrController.createCondition,
  );
  this.router.put(
   "/:patientId/conditions/:itemId",
   requireRole("admin", "doctor"),
   validate(emrClinicalItemParamSchema, "params"),
   validate(conditionBodySchema),
   EmrController.updateCondition,
  );
  this.router.delete(
   "/:patientId/conditions/:itemId",
   requireRole("admin", "doctor"),
   validate(emrClinicalItemParamSchema, "params"),
   EmrController.deleteCondition,
  );

  this.router.post(
   "/:patientId/allergies",
   requireRole("admin", "doctor"),
   validate(emrPatientParamSchema, "params"),
   validate(allergyBodySchema),
   EmrController.createAllergy,
  );
  this.router.put(
   "/:patientId/allergies/:itemId",
   requireRole("admin", "doctor"),
   validate(emrClinicalItemParamSchema, "params"),
   validate(allergyBodySchema),
   EmrController.updateAllergy,
  );
  this.router.delete(
   "/:patientId/allergies/:itemId",
   requireRole("admin", "doctor"),
   validate(emrClinicalItemParamSchema, "params"),
   EmrController.deleteAllergy,
  );

  this.router.post(
   "/:patientId/medications",
   requireRole("admin", "doctor"),
   validate(emrPatientParamSchema, "params"),
   validate(medicationBodySchema),
   EmrController.createMedication,
  );
  this.router.put(
   "/:patientId/medications/:itemId",
   requireRole("admin", "doctor"),
   validate(emrClinicalItemParamSchema, "params"),
   validate(medicationBodySchema),
   EmrController.updateMedication,
  );
  this.router.delete(
   "/:patientId/medications/:itemId",
   requireRole("admin", "doctor"),
   validate(emrClinicalItemParamSchema, "params"),
   EmrController.deleteMedication,
  );

  this.router.get(
   "/:patientId/encounters/:encounterId/soap-notes",
   requireRole("admin", "doctor", "patient"),
   validate(emrEncounterParamSchema, "params"),
   EmrController.soapNotes,
  );
  this.router.get(
   "/:patientId/encounters/:encounterId/soap-notes/:noteId",
   requireRole("admin", "doctor", "patient"),
   validate(emrSoapNoteParamSchema, "params"),
   EmrController.soapNote,
  );
  this.router.post(
   "/:patientId/encounters/:encounterId/soap-notes",
   requireRole("admin", "doctor"),
   validate(emrEncounterParamSchema, "params"),
   validate(soapNoteBodySchema),
   EmrController.createSoapNote,
  );
  this.router.put(
   "/:patientId/encounters/:encounterId/soap-notes/:noteId",
   requireRole("admin", "doctor"),
   validate(emrSoapNoteParamSchema, "params"),
   validate(soapNoteBodySchema),
   EmrController.updateSoapNote,
  );
 }
}

export default new EmrRouter().router;
