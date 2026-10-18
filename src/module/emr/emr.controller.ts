import asyncHandler from "@middleware/async-handler.ts";
import type { OpenEMRRequest } from "@shared/http.ts";
import type { Response } from "express";
import {
 recordEmrAuthor,
 type EmrResourceType,
} from "@module/emr/helper.ts";
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
 summary = asyncHandler(async (req: OpenEMRRequest<EmrPatientParam>, res: Response) => {
  const [data, err] = await EmrService.summary(
   req.openemr,
   req.params.patientId,
  );
  if (err) throw err;
  res.json({ success: true, data });
 });

 clinical = asyncHandler(
  async (req: OpenEMRRequest<EmrClinicalParam>, res: Response) => {
   const [data, err] = await EmrService.clinical(
    req.openemr,
    req.params.patientId,
    req.params.kind as ClinicalKind,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 vitals = asyncHandler(async (req: OpenEMRRequest<EmrPatientParam>, res: Response) => {
  const [data, err] = await EmrService.observations(
   req.openemr,
   req.params.patientId,
   "vital-signs",
  );
  if (err) throw err;
  res.json({ success: true, data });
 });

 labs = asyncHandler(async (req: OpenEMRRequest<EmrPatientParam>, res: Response) => {
  const [data, err] = await EmrService.observations(
   req.openemr,
   req.params.patientId,
   "laboratory",
  );
  if (err) throw err;
  res.json({ success: true, data });
 });

 labObservation = asyncHandler(
  async (req: OpenEMRRequest<EmrObservationParam>, res: Response) => {
   const [data, err] = await EmrService.observation(
    req.openemr,
    req.params.patientId,
    req.params.observationId,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 encounters = asyncHandler(
  async (req: OpenEMRRequest<EmrPatientParam>, res: Response) => {
   const [data, err] = await EmrService.clinical(
    req.openemr,
    req.params.patientId,
    "encounters",
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 encounter = asyncHandler(
  async (req: OpenEMRRequest<EmrEncounterParam>, res: Response) => {
   const [data, err] = await EmrService.encounter(
    req.openemr,
    req.params.patientId,
    req.params.encounterId,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 createEncounter = asyncHandler(
  async (
   req: OpenEMRRequest<EmrPatientParam, unknown, CreateEncounterInput>,
   res: Response,
  ) => {
   const [data, err] = await EmrService.createEncounter(
    req.openemr,
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

  recordVitals = asyncHandler(
   async (
    req: OpenEMRRequest<EmrEncounterParam, unknown, RecordVitalsInput>,
    res: Response,
   ) => {
    const [data, err] = await EmrService.recordVitals(
     req.openemr,
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

  updateVitals = asyncHandler(
   async (
    req: OpenEMRRequest<EmrVitalItemParam, unknown, RecordVitalsInput>,
    res: Response,
   ) => {
    const [data, err] = await EmrService.updateVitals(
     req.openemr,
     req.params.patientId,
     req.params.encounterId,
     req.params.vitalId,
     req.body,
    );
    if (err) throw err;
    res.json({ success: true, data });
   },
  );

  createCondition = asyncHandler(
   async (
    req: OpenEMRRequest<EmrPatientParam, unknown, ConditionInput>,
    res: Response,
   ) => {
   const [data, err] = await EmrService.createCondition(
    req.openemr,
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

  updateCondition = asyncHandler(
   async (
    req: OpenEMRRequest<EmrClinicalItemParam, unknown, ConditionInput>,
    res: Response,
   ) => {
    const [data, err] = await EmrService.updateCondition(
     req.openemr,
     req.params.patientId,
     req.params.itemId,
     req.body,
    );
    if (err) throw err;
    res.json({ success: true, data });
   },
  );

  deleteCondition = asyncHandler(
   async (req: OpenEMRRequest<EmrClinicalItemParam>, res: Response) => {
    const [data, err] = await EmrService.deleteCondition(
     req.openemr,
     req.params.patientId,
     req.params.itemId,
    );
    if (err) throw err;
    res.json({ success: true, data });
   },
  );

  createAllergy = asyncHandler(
   async (req: OpenEMRRequest<EmrPatientParam, unknown, AllergyInput>, res: Response) => {
    const [data, err] = await EmrService.createAllergy(
     req.openemr,
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

  updateAllergy = asyncHandler(
   async (
    req: OpenEMRRequest<EmrClinicalItemParam, unknown, AllergyInput>,
    res: Response,
   ) => {
    const [data, err] = await EmrService.updateAllergy(
     req.openemr,
     req.params.patientId,
     req.params.itemId,
     req.body,
    );
    if (err) throw err;
    res.json({ success: true, data });
   },
  );

  deleteAllergy = asyncHandler(
   async (req: OpenEMRRequest<EmrClinicalItemParam>, res: Response) => {
    const [data, err] = await EmrService.deleteAllergy(
     req.openemr,
     req.params.patientId,
     req.params.itemId,
    );
    if (err) throw err;
    res.json({ success: true, data });
   },
  );

  createMedication = asyncHandler(
   async (
    req: OpenEMRRequest<EmrPatientParam, unknown, MedicationInput>,
    res: Response,
   ) => {
    const [data, err] = await EmrService.createMedication(
     req.openemr,
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

  updateMedication = asyncHandler(
   async (
    req: OpenEMRRequest<EmrClinicalItemParam, unknown, MedicationInput>,
    res: Response,
   ) => {
    const [data, err] = await EmrService.updateMedication(
     req.openemr,
     req.params.patientId,
     req.params.itemId,
     req.body,
    );
    if (err) throw err;
    res.json({ success: true, data });
   },
  );

  deleteMedication = asyncHandler(
   async (req: OpenEMRRequest<EmrClinicalItemParam>, res: Response) => {
    const [data, err] = await EmrService.deleteMedication(
     req.openemr,
     req.params.patientId,
     req.params.itemId,
    );
    if (err) throw err;
    res.json({ success: true, data });
   },
  );

  createSoapNote = asyncHandler(
   async (
    req: OpenEMRRequest<EmrEncounterParam, unknown, SoapNoteInput>,
    res: Response,
   ) => {
    const [data, err] = await EmrService.createSoapNote(
     req.openemr,
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

  updateSoapNote = asyncHandler(
   async (
    req: OpenEMRRequest<EmrSoapNoteParam, unknown, SoapNoteInput>,
    res: Response,
   ) => {
    const [data, err] = await EmrService.updateSoapNote(
     req.openemr,
     req.params.patientId,
     req.params.encounterId,
     req.params.noteId,
     req.body,
    );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 soapNotes = asyncHandler(
  async (req: OpenEMRRequest<EmrEncounterParam>, res: Response) => {
   const [data, err] = await EmrService.soapNotes(
    req.openemr,
    req.params.patientId,
    req.params.encounterId,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 soapNote = asyncHandler(
  async (req: OpenEMRRequest<EmrSoapNoteParam>, res: Response) => {
   const [data, err] = await EmrService.soapNote(
    req.openemr,
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
