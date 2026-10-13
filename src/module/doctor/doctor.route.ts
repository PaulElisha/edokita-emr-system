/** @format */
import { Router } from "express";
import { create, index, show } from "@module/doctor/doctor.controller.ts";

const doctorRouter = Router();

doctorRouter.get("/", index);
doctorRouter.get("/:id", show);
doctorRouter.post("/", create);

export default doctorRouter;