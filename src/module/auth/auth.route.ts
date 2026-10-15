/** @format */
import { authenticate } from "@middleware/auth.ts";
import AuthController from "@module/auth/auth.controller.ts";
import UserController from "@module/user/user.controller.ts";
import validate from "@middleware/validation.ts";
import { loginSchema, registerSchema } from "@module/auth/auth.service.ts";
import { Router } from "express";

class AuthRouter {
 router: Router;

 constructor() {
  this.router = Router();
  this.initializeRoutes();
 }

 initializeRoutes() {
  // Public routes.
  this.router.post(
   "/register",
   validate(registerSchema),
   AuthController.register,
  );
  this.router.post("/login", validate(loginSchema), AuthController.login);

  this.router.post("/logout", authenticate, AuthController.logout);
 }
}

export default new AuthRouter().router;
