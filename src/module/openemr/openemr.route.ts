import { authenticate, withOpenEMR } from "@middleware/auth.ts";
import OpenEMRController from "@module/openemr/openemr.controller.ts";
import { Router } from "express";

class OpenEMRRouter {
 router: Router;

 constructor() {
  this.router = Router();
  this.initializeRoutes();
 }

 initializeRoutes() {
  this.router.get("/authorize", authenticate, OpenEMRController.authorize);
  this.router.get("/callback", OpenEMRController.handleCallback);
  this.router.post("/refresh", authenticate, OpenEMRController.refresh);
  this.router.get("/ping", authenticate, withOpenEMR, OpenEMRController.ping);
 }
}

export default new OpenEMRRouter().router;
