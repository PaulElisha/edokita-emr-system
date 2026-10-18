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
  if (err || !user) return [null, err];
  const [tokens] = await getTokens(userId);
  const connected =
   user.role === "patient"
    ? Boolean(user.openemr.patientId)
    : Boolean(tokens?.accessToken && tokens.expiresAt.getTime() > Date.now());
  return [
   {
    user: toPublicUser(user),
    openemr: {
     connected,
     expiresAt: connected && tokens ? tokens.expiresAt : null,
     scope: connected && tokens ? tokens.scope : null,
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
