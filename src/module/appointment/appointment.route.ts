/** @format */
import { Router } from "express";
import { create, index, show } from "@module/appointment/appointment.controller.ts";

const appointmentRouter = Router();

appointmentRouter.get("/", index);
appointmentRouter.get("/:id", show);
appointmentRouter.post("/", create);

export default appointmentRouter;