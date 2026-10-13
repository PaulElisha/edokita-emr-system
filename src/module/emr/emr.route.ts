/** @format */
import { Router } from "express";
import {
  clinical,
  encounter,
  labs,
  summary,
  vitals,
} from "@module/emr/emr.controller.ts";

const emrRouter = Router();

emrRouter.get("/:patientId/summary", summary);
emrRouter.get("/:patientId/clinical/:kind", clinical);
emrRouter.get("/:patientId/vitals", vitals);
emrRouter.get("/:patientId/labs", labs);
emrRouter.get("/:patientId/encounters", (req, res, next) => {
  (req.params as Record<string, string>).kind = "encounters";
  clinical(req, res, next);
});
emrRouter.get("/:patientId/encounters/:encounterId", encounter);

export default emrRouter;