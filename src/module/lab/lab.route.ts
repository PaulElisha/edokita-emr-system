import { authenticate, withOpenEMR } from "@middleware/auth.ts";
import { requireRole } from "@middleware/role-guard.ts";
import validate from "@middleware/validation.ts";
import LabController from "@module/lab/lab.controller.ts";
import {
 labOrderBodySchema,
 labOrderListQuerySchema,
 labResultBodySchema,
 labResultListQuerySchema,
 labResultParamSchema,
} from "@module/lab/lab.service.ts";
import { authUserSchema } from "@module/user/helper.ts";
import { Router } from "express";

class LabRouter {
 router: Router;

 constructor() {
  this.router = Router();
  this.initializeRoutes();
 }

 initializeRoutes() {
  this.router.use(authenticate, validate(authUserSchema, "user"), withOpenEMR);

  this.router.get(
   "/orders",
   requireRole("admin", "doctor", "lab", "patient"),
   validate(labOrderListQuerySchema, "query"),
   LabController.listOrders,
  );
  this.router.post(
   "/orders",
   requireRole("admin", "doctor"),
   validate(labOrderBodySchema),
   LabController.createOrder,
  );
  this.router.get(
   "/results",
   requireRole("admin", "doctor", "lab", "patient"),
   validate(labResultListQuerySchema, "query"),
   LabController.listResults,
  );
  this.router.get(
   "/results/:resultId",
   requireRole("admin", "doctor", "lab", "patient"),
   validate(labResultParamSchema, "params"),
   LabController.getResult,
  );
  this.router.post(
   "/results",
   requireRole("admin", "lab"),
   validate(labResultBodySchema),
   LabController.createResult,
  );
 }
}

export default new LabRouter().router;
