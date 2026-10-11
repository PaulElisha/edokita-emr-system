/** @format */
import { Router } from "express";
import { capability, version } from "./system.controller.ts";

const systemRouter = Router();

systemRouter.get("/version", version);
systemRouter.get("/capability", capability);

export default systemRouter;