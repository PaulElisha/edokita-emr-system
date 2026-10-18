import { authenticate } from "@middleware/auth.ts";
import AuthController from "@module/auth/auth.controller.ts";
import validate from "@middleware/validation.ts";
import { loginSchema, registerSchema } from "@module/auth/auth.service.ts";
import {
 changePasswordSchema,
 forgotPasswordSchema,
 refreshTokenSchema,
 resetPasswordSchema,
} from "@module/auth/auth.service.ts";
import { Router } from "express";

class AuthRouter {
 router: Router;

 constructor() {
  this.router = Router();
  this.initializeRoutes();
 }

 initializeRoutes() {
  this.router.post(
   "/register",
   validate(registerSchema),
   AuthController.register,
  );
  this.router.post("/login", validate(loginSchema), AuthController.login);
  this.router.post(
   "/refresh",
   validate(refreshTokenSchema),
   AuthController.refresh,
  );
  this.router.post(
   "/forgot-password",
   validate(forgotPasswordSchema),
   AuthController.forgotPassword,
  );
  this.router.post(
   "/reset-password",
   validate(resetPasswordSchema),
   AuthController.resetPassword,
  );

  this.router.post("/logout", authenticate, AuthController.logout);
  this.router.post(
   "/change-password",
   authenticate,
   validate(changePasswordSchema),
   AuthController.changePassword,
  );
 }
}

export default new AuthRouter().router;
