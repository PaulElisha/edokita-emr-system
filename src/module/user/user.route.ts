/** @format */
import { authenticate } from "@middleware/auth.ts";
import validate from "@middleware/validation.ts";
import { updateUserSchema } from "@module/user/helper.ts";
import UserController from "@module/user/user.controller.ts";
import { Router } from "express";

class UserRouter {
 router: Router;

 constructor() {
  this.router = Router();
  this.initializeRoutes();
 }

 initializeRoutes() {
  this.router.get("/profile", authenticate, UserController.profile);
  this.router.put(
   "/update",
   authenticate,
   validate(updateUserSchema),
   UserController.update,
  );
 }
}

export default new UserRouter().router;
