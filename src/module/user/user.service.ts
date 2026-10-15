/** @format */
import APIError from "@error/APIError.ts";
import { getTokens } from "@module/auth/helper.ts";
import type { Result } from "@shared/types.ts";
import {
 findUserById,
 toPublicUser,
 updateUser,
 type PublicUser,
 type UpdateUserInput,
} from "./helper.ts";

export interface UserProfile {
 user: PublicUser;
 openemr: {
  connected: boolean;
  expiresAt: Date | null;
  scope: string | null;
 };
}

class UserService {
 profile = async (userId: string): Promise<Result<UserProfile>> => {
  const [user, err] = await findUserById(userId);
  if (err || !user) return [null, err ?? APIError.unauthorized()];
  const [tokens] = await getTokens(userId);
  return [
   {
    user: toPublicUser(user),
    openemr: {
     connected: Boolean(tokens),
     expiresAt: tokens?.expiresAt ?? null,
     scope: tokens?.scope ?? null,
    },
   },
   null,
  ];
 };

 update = async (
  userId: string,
  input: UpdateUserInput,
 ): Promise<Result<UserProfile>> => {
  const [, err] = await updateUser(userId, input);
  if (err) return [null, err];
  return await this.profile(userId);
 };
}

export default new UserService();
