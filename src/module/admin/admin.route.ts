/** @format */
import { authenticate, withOpenEMR } from "@middleware/auth.ts";
import { requireRole } from "@middleware/role-guard.ts";
import AdminController from "@module/admin/admin.controller.ts";
import { Router } from "express";

class AdminRouter {
 router: Router;

 constructor() {
  this.router = Router();
  this.initializeRoutes();
 }

 initializeRoutes() {
  this.router.use(authenticate, withOpenEMR, requireRole("admin"));

  this.router.get("/stats", AdminController.stats);
  this.router.get("/users", AdminController.users);
  this.router.get("/facilities", AdminController.facilities);
 }
}

export default new AdminRouter().router;
