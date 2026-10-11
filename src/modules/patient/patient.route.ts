/** @format */
import { Router } from "express";
import { create, index, show } from "./patient.controller.ts";

const patientRouter = Router();

patientRouter.get("/", index);
patientRouter.get("/:id", show);
patientRouter.post("/", create);

export default patientRouter;