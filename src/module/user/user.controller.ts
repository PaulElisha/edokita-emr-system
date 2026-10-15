/** @format */
import type { JwtPayload } from "@auth/jwt.ts";
import APIError from "@error/APIError.ts";
import asyncHandler from "@middleware/async-handler.ts";
import UserService from "@module/user/user.service.ts";
import type { UpdateUserInput } from "@module/user/helper.ts";
import type { Request, Response } from "express";

function toUserId(req: { user?: JwtPayload }): string {
 if (!req.user) throw APIError.unauthorized();
 return req.user.userId;
}

class UserController {
 profile = asyncHandler(async (req: Request, res: Response) => {
  const [data, err] = await UserService.profile(toUserId(req));
  if (err) throw err;
  res.json({ success: true, data });
 });

 update = asyncHandler(
  async (req: Request<unknown, unknown, UpdateUserInput>, res: Response) => {
   const [data, err] = await UserService.update(toUserId(req), req.body);
   if (err) throw err;
   res.json({ success: true, data });
  },
 );
}

export default new UserController();
