/** @format */
import { Router } from "express";
import { create, index, show, update } from "@module/doctor/doctor.controller.ts";

const doctorRouter = Router();

doctorRouter.get("/", index);
doctorRouter.get("/:id", show);
doctorRouter.post("/", create);
doctorRouter.put("/:id", update);

export default doctorRouter;