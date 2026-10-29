/** @format */

import { authenticate } from "@middleware/auth.ts";
import { requireRole } from "@middleware/role-guard.ts";
import validate from "@middleware/validation.ts";
import EmrAccessController from "@module/emr-access/emr-access.controller.ts";
import {
 emrAccessPatientParamSchema,
 emrAccessRequestParamSchema,
 emrAccessRequestSchema,
 emrAccessReviewSchema,
} from "@module/emr-access/emr-access.service.ts";
import { authUserSchema } from "@module/user/helper.ts";
import { Router } from "express";

class EmrAccessRouter {
 router: Router;

 constructor() {
  this.router = Router();
  this.initializeRoutes();
 }

 initializeRoutes() {
  this.router.post(
   "/:patientId/requests",
   authenticate,
   validate(authUserSchema, "user"),
   requireRole("doctor"),
   validate(emrAccessPatientParamSchema, "params"),
   validate(emrAccessRequestSchema),
   EmrAccessController.request,
  );
  this.router.get(
   "/requests",
   authenticate,
   validate(authUserSchema, "user"),
   requireRole("patient"),
   EmrAccessController.list,
  );
  this.router.patch(
   "/requests/:requestId",
   authenticate,
   validate(authUserSchema, "user"),
   requireRole("patient"),
   validate(emrAccessRequestParamSchema, "params"),
   validate(emrAccessReviewSchema),
   EmrAccessController.review,
  );
 }
}

export default new EmrAccessRouter().router;
