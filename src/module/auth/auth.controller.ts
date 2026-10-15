/** @format */
import APIError from "@error/APIError.ts";
import type { JwtPayload } from "@auth/jwt.ts";
import asyncHandler from "@middleware/async-handler.ts";
import AuthService, {
 type LoginInput,
 type RegisterInput,
} from "@module/auth/auth.service.ts";
import HttpStatus from "@shared/enum/http.ts";
import type { Request, Response } from "express";

function userId(req: { user?: JwtPayload }): string {
 if (!req.user) throw APIError.unauthorized();
 return req.user.userId;
}

class AuthController {
 register = asyncHandler(
  async (req: Request<unknown, unknown, RegisterInput>, res: Response) => {
   const [data, err] = await AuthService.register(req.body);
   if (err) throw err;
   res.status(HttpStatus.CREATED).json({ success: true, data });
  },
 );

 login = asyncHandler(
  async (req: Request<unknown, unknown, LoginInput>, res: Response) => {
   const [data, err] = await AuthService.login(req.body);
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 logout = asyncHandler(async (req: Request, res: Response) => {
  const [data, err] = await AuthService.logout(userId(req));
  if (err) throw err;
  res.json(data);
 });
}

export default new AuthController();
