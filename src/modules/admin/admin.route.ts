/** @format */
import { Router } from "express";
import { facilities, stats, users } from "./admin.controller.ts";

const adminRouter = Router();

adminRouter.get("/stats", stats);
adminRouter.get("/users", users);
adminRouter.get("/facilities", facilities);

export default adminRouter;