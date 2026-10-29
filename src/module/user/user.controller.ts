import AsyncHandler from "@middleware/async-handler.ts";
import UserService from "@module/user/user.service.ts";
import type { UpdateUserInput } from "@module/user/helper.ts";
import { requireUserId } from "@module/auth/helper.ts";
import type { AuthRequest } from "@shared/http.ts";
import type { Response } from "express";

class UserController {
 profile = AsyncHandler(async (req: AuthRequest, res: Response) => {
  const [data, err] = await UserService.profile(requireUserId(req));
  if (err) throw err;
  res.json({ success: true, data });
 });

 update = AsyncHandler(
  async (
   req: AuthRequest<unknown, unknown, UpdateUserInput>,
   res: Response,
  ) => {
   const [data, err] = await UserService.update(requireUserId(req), req.body);
   if (err) throw err;
   res.json({ success: true, data });
  },
 );
}

export default new UserController();
