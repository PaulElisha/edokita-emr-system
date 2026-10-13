/** @format */
import { Router } from "express";
import { create, index, show, update } from "@module/patient/patient.controller.ts";

const patientRouter = Router();

patientRouter.get("/", index);
patientRouter.get("/:id", show);
patientRouter.post("/", create);
patientRouter.put("/:id", update);

export default patientRouter;