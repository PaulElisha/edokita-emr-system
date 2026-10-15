/** @format */
import asyncHandler from "@middleware/async-handler.ts";
import type { Request, Response } from "express";
import EmrService, {
 type ClinicalKind,
 type CreateEncounterInput,
 type EmrClinicalParam,
 type EmrEncounterParam,
 type EmrPatientParam,
 type RecordVitalsInput,
} from "@module/emr/emr.service.ts";

class EmrController {
 summary = asyncHandler(async (req: Request<EmrPatientParam>, res: Response) => {
  const [data, err] = await EmrService.summary(
   req.openemr!,
   req.params.patientId,
  );
  if (err) throw err;
  res.json({ success: true, data });
 });

 clinical = asyncHandler(
  async (req: Request<EmrClinicalParam>, res: Response) => {
   const [data, err] = await EmrService.clinical(
    req.openemr!,
    req.params.patientId,
    req.params.kind as ClinicalKind,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 vitals = asyncHandler(async (req: Request<EmrPatientParam>, res: Response) => {
  const [data, err] = await EmrService.observations(
   req.openemr!,
   req.params.patientId,
   "vital-signs",
  );
  if (err) throw err;
  res.json({ success: true, data });
 });

 labs = asyncHandler(async (req: Request<EmrPatientParam>, res: Response) => {
  const [data, err] = await EmrService.observations(
   req.openemr!,
   req.params.patientId,
   "laboratory",
  );
  if (err) throw err;
  res.json({ success: true, data });
 });

 encounters = asyncHandler(
  async (req: Request<EmrPatientParam>, res: Response) => {
   const [data, err] = await EmrService.clinical(
    req.openemr!,
    req.params.patientId,
    "encounters",
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 encounter = asyncHandler(
  async (req: Request<EmrEncounterParam>, res: Response) => {
   const [data, err] = await EmrService.encounter(
    req.openemr!,
    req.params.patientId,
    req.params.encounterId,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 createEncounter = asyncHandler(
  async (
   req: Request<EmrPatientParam, unknown, CreateEncounterInput>,
   res: Response,
  ) => {
   const [data, err] = await EmrService.createEncounter(
    req.openemr!,
    req.params.patientId,
    req.body,
   );
   if (err) throw err;
   res.status(201).json({ success: true, data });
  },
 );

 recordVitals = asyncHandler(
  async (
   req: Request<EmrEncounterParam, unknown, RecordVitalsInput>,
   res: Response,
  ) => {
   const [data, err] = await EmrService.recordVitals(
    req.openemr!,
    req.params.patientId,
    req.params.encounterId,
    req.body,
   );
   if (err) throw err;
   res.status(201).json({ success: true, data });
  },
 );
}

export default new EmrController();
