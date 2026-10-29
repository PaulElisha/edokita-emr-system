/** @format */

import AsyncHandler from "@middleware/async-handler.ts";
import AuthService, {
 type ChangePasswordInput,
 type ForgotPasswordInput,
 type LoginInput,
 type RefreshTokenInput,
 type RegisterInput,
 type ResetPasswordInput,
} from "@module/auth/auth.service.ts";
import { requireUserId } from "@module/auth/helper.ts";
import HttpStatus from "@shared/enum/http.ts";
import type { AuthRequest } from "@shared/http.ts";
import type { Request, Response } from "express";

class AuthController {
 register = AsyncHandler(
  async (req: Request<unknown, unknown, RegisterInput>, res: Response) => {
   const [data, err] = await AuthService.register(req.body);
   if (err) throw err;
   res.status(HttpStatus.CREATED).json({ success: true, data });
  },
 );

 login = AsyncHandler(
  async (req: Request<unknown, unknown, LoginInput>, res: Response) => {
   const [data, err] = await AuthService.login(req.body);
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 logout = AsyncHandler(async (req: AuthRequest, res: Response) => {
  const [data, err] = await AuthService.logout(requireUserId(req));
  if (err) throw err;
  res.json(data);
 });

 refresh = AsyncHandler(
  async (req: Request<unknown, unknown, RefreshTokenInput>, res: Response) => {
   const [data, err] = await AuthService.refresh(req.body);
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 changePassword = AsyncHandler(
  async (
   req: AuthRequest<unknown, unknown, ChangePasswordInput>,
   res: Response,
  ) => {
   const [data, err] = await AuthService.changePassword(
    requireUserId(req),
    req.body,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 forgotPassword = AsyncHandler(
  async (
   req: Request<unknown, unknown, ForgotPasswordInput>,
   res: Response,
  ) => {
   const [data, err] = await AuthService.forgotPassword(req.body);
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 resetPassword = AsyncHandler(
  async (req: Request<unknown, unknown, ResetPasswordInput>, res: Response) => {
   const [data, err] = await AuthService.resetPassword(req.body);
   if (err) throw err;
   res.json({ success: true, data });
  },
 );
}

export default new AuthController();
