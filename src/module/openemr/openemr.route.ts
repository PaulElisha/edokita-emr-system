import validate from "@middleware/validation.ts";
import { authenticate, withOpenEMR } from "@middleware/auth.ts";
import OpenEMRController from "@module/openemr/openemr.controller.ts";
import { authUserSchema } from "@module/user/helper.ts";
import { Router } from "express";

class OpenEMRRouter {
 router: Router;

 constructor() {
  this.router = Router();
  this.initializeRoutes();
 }

 initializeRoutes() {
  this.router.get("/authorize", authenticate, validate(authUserSchema, "user"), OpenEMRController.authorize);
  this.router.get("/callback", OpenEMRController.handleCallback);
  this.router.post("/refresh", authenticate, validate(authUserSchema, "user"), OpenEMRController.refresh);
  this.router.get("/ping", authenticate, validate(authUserSchema, "user"), withOpenEMR, OpenEMRController.ping);
 }
}

export default new OpenEMRRouter().router;
