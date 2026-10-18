import SystemController from "@module/system/system.controller.ts";
import { Router } from "express";

class SystemRouter {
 router: Router;

 constructor() {
  this.router = Router();
  this.initializeRoutes();
 }

 initializeRoutes() {
  this.router.get("/version", SystemController.version);
  this.router.get("/capability", SystemController.capability);
 }
}

export default new SystemRouter().router;
