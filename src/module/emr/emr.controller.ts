/** @format */

import AsyncHandler from "@middleware/async-handler.ts";
import type { OpenEMRRequest } from "@shared/http.ts";
import type { Response } from "express";
import { recordEmrAuthor, type EmrResourceType } from "@module/emr/helper.ts";
import EmrService, {
 type AllergyInput,
 type ClinicalKind,
 type ConditionInput,
 type CreateEncounterInput,
 type EmrClinicalItemParam,
 type EmrClinicalParam,
 type EmrEncounterParam,
 type EmrObservationParam,
 type EmrPatientParam,
 type EmrSoapNoteParam,
 type EmrVitalItemParam,
 type MedicationInput,
 type ObservationInput,
 type RecordVitalsInput,
 type SoapNoteInput,
} from "@module/emr/emr.service.ts";

const attribute = (
 patientId: string,
 type: EmrResourceType,
 id: unknown,
 userId: string,
): Promise<void> =>
 id === undefined || id === null || id === ""
  ? Promise.resolve()
  : recordEmrAuthor(patientId, type, String(id), userId);

class EmrController {
 summary = AsyncHandler(
  async (req: OpenEMRRequest<EmrPatientParam>, res: Response) => {
   const [data, err] = await EmrService.summary(req.params.patientId);
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 clinical = AsyncHandler(
  async (req: OpenEMRRequest<EmrClinicalParam>, res: Response) => {
   const [data, err] = await EmrService.clinical(
    req.params.patientId,
    req.params.kind as ClinicalKind,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 vitals = AsyncHandler(
  async (req: OpenEMRRequest<EmrPatientParam>, res: Response) => {
   const [data, err] = await EmrService.vitalObservations(req.params.patientId);
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 observations = AsyncHandler(
  async (req: OpenEMRRequest<EmrPatientParam>, res: Response) => {
   const category =
    typeof req.query.category === "string" ? req.query.category : undefined;
   const [data, err] = await EmrService.observations(
    req.params.patientId,
    category,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 observation = AsyncHandler(
  async (req: OpenEMRRequest<EmrObservationParam>, res: Response) => {
   const [data, err] = await EmrService.observation(
    req.params.patientId,
    req.params.observationId,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 createObservation = AsyncHandler(
  async (
   req: OpenEMRRequest<EmrPatientParam, unknown, ObservationInput>,
   res: Response,
  ) => {
   const [data, err] = await EmrService.createObservation(
    req.params.patientId,
    req.body,
   );
   if (err) throw err;
   await attribute(
    req.params.patientId,
    "observation",
    data?.observation_uuid ?? data?.id,
    req.user.userId,
   );
   res.status(201).json({ success: true, data });
  },
 );

 updateObservation = AsyncHandler(
  async (
   req: OpenEMRRequest<EmrObservationParam, unknown, Partial<ObservationInput>>,
   res: Response,
  ) => {
   const [data, err] = await EmrService.updateObservation(
    req.params.observationId,
    req.body,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 deleteObservation = AsyncHandler(
  async (req: OpenEMRRequest<EmrObservationParam>, res: Response) => {
   const [data, err] = await EmrService.deleteObservation(
    req.params.patientId,
    req.params.observationId,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 encounters = AsyncHandler(
  async (req: OpenEMRRequest<EmrPatientParam>, res: Response) => {
   const [data, err] = await EmrService.clinical(
    req.params.patientId,
    "encounters",
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 encounter = AsyncHandler(
  async (req: OpenEMRRequest<EmrEncounterParam>, res: Response) => {
   const [data, err] = await EmrService.encounter(
    req.params.patientId,
    req.params.encounterId,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 createEncounter = AsyncHandler(
  async (
   req: OpenEMRRequest<EmrPatientParam, unknown, CreateEncounterInput>,
   res: Response,
  ) => {
   const [data, err] = await EmrService.createEncounter(
    req.params.patientId,
    req.body,
   );
   if (err) throw err;
   await attribute(
    req.params.patientId,
    "encounter",
    data?.euuid ?? data?.id,
    req.user.userId,
   );
   res.status(201).json({ success: true, data });
  },
 );

 recordVitals = AsyncHandler(
  async (
   req: OpenEMRRequest<EmrEncounterParam, unknown, RecordVitalsInput>,
   res: Response,
  ) => {
   const [data, err] = await EmrService.recordVitals(
    req.params.patientId,
    req.params.encounterId,
    req.body,
   );
   if (err) throw err;
   await attribute(
    req.params.patientId,
    "encounter",
    req.params.encounterId,
    req.user.userId,
   );
   res.status(201).json({ success: true, data });
  },
 );

 updateVitals = AsyncHandler(
  async (
   req: OpenEMRRequest<EmrVitalItemParam, unknown, RecordVitalsInput>,
   res: Response,
  ) => {
   const [data, err] = await EmrService.updateVitals(
    req.params.patientId,
    req.params.encounterId,
    req.params.vitalId,
    req.body,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 createCondition = AsyncHandler(
  async (
   req: OpenEMRRequest<EmrPatientParam, unknown, ConditionInput>,
   res: Response,
  ) => {
   const [data, err] = await EmrService.createCondition(
    req.params.patientId,
    req.body,
   );
   if (err) throw err;
   await attribute(
    req.params.patientId,
    "condition",
    data?.uuid ?? data?.id,
    req.user.userId,
   );
   res.status(201).json({ success: true, data });
  },
 );

 updateCondition = AsyncHandler(
  async (
   req: OpenEMRRequest<EmrClinicalItemParam, unknown, ConditionInput>,
   res: Response,
  ) => {
   const [data, err] = await EmrService.updateCondition(
    req.params.patientId,
    req.params.itemId,
    req.body,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 deleteCondition = AsyncHandler(
  async (req: OpenEMRRequest<EmrClinicalItemParam>, res: Response) => {
   const [data, err] = await EmrService.deleteCondition(
    req.params.patientId,
    req.params.itemId,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 createAllergy = AsyncHandler(
  async (
   req: OpenEMRRequest<EmrPatientParam, unknown, AllergyInput>,
   res: Response,
  ) => {
   const [data, err] = await EmrService.createAllergy(
    req.params.patientId,
    req.body,
   );
   if (err) throw err;
   await attribute(
    req.params.patientId,
    "allergy",
    data?.uuid ?? data?.id,
    req.user.userId,
   );
   res.status(201).json({ success: true, data });
  },
 );

 updateAllergy = AsyncHandler(
  async (
   req: OpenEMRRequest<EmrClinicalItemParam, unknown, AllergyInput>,
   res: Response,
  ) => {
   const [data, err] = await EmrService.updateAllergy(
    req.params.patientId,
    req.params.itemId,
    req.body,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 deleteAllergy = AsyncHandler(
  async (req: OpenEMRRequest<EmrClinicalItemParam>, res: Response) => {
   const [data, err] = await EmrService.deleteAllergy(
    req.params.patientId,
    req.params.itemId,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 createMedication = AsyncHandler(
  async (
   req: OpenEMRRequest<EmrPatientParam, unknown, MedicationInput>,
   res: Response,
  ) => {
   const [data, err] = await EmrService.createMedication(
    req.params.patientId,
    req.body,
   );
   if (err) throw err;
   await attribute(
    req.params.patientId,
    "medication",
    data?.uuid,
    req.user.userId,
   );
   res.status(201).json({ success: true, data });
  },
 );

 updateMedication = AsyncHandler(
  async (
   req: OpenEMRRequest<EmrClinicalItemParam, unknown, MedicationInput>,
   res: Response,
  ) => {
   const [data, err] = await EmrService.updateMedication(
    req.params.patientId,
    req.params.itemId,
    req.body,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 deleteMedication = AsyncHandler(
  async (req: OpenEMRRequest<EmrClinicalItemParam>, res: Response) => {
   const [data, err] = await EmrService.deleteMedication(
    req.params.patientId,
    req.params.itemId,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 createSoapNote = AsyncHandler(
  async (
   req: OpenEMRRequest<EmrEncounterParam, unknown, SoapNoteInput>,
   res: Response,
  ) => {
   const [data, err] = await EmrService.createSoapNote(
    req.params.patientId,
    req.params.encounterId,
    req.body,
   );
   if (err) throw err;
   await attribute(
    req.params.patientId,
    "soap_note",
    data?.sid ?? data?.id,
    req.user.userId,
   );
   res.status(201).json({ success: true, data });
  },
 );

 updateSoapNote = AsyncHandler(
  async (
   req: OpenEMRRequest<EmrSoapNoteParam, unknown, SoapNoteInput>,
   res: Response,
  ) => {
   const [data, err] = await EmrService.updateSoapNote(
    req.params.patientId,
    req.params.encounterId,
    req.params.noteId,
    req.body,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 soapNotes = AsyncHandler(
  async (req: OpenEMRRequest<EmrEncounterParam>, res: Response) => {
   const [data, err] = await EmrService.soapNotes(
    req.params.patientId,
    req.params.encounterId,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 soapNote = AsyncHandler(
  async (req: OpenEMRRequest<EmrSoapNoteParam>, res: Response) => {
   const [data, err] = await EmrService.soapNote(
    req.params.patientId,
    req.params.encounterId,
    req.params.noteId,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );
}

export default new EmrController();
