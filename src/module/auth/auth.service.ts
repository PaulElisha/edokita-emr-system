/** @format */

import APIError from "@error/APIError.ts";
import logger from "@app/logger.ts";
import { Transactional } from "@db/transaction.ts";
import OpenEMRService, {
 ROLE_SCOPES,
} from "@module/openemr/openemr.service.ts";
import {
 bumpSessionEpoch,
 createUser,
 findUserByEmail,
 findUserById,
 findUserByIdWithPassword,
 getOpenEMRCredentials,
 saveOpenEMRCredentials,
 updatePasswordHash,
 type OpenEMRCredentials,
 type OpenEMRProvision,
 type PublicUser,
} from "@module/user/helper.ts";

import { getTokens } from "@openemr/utils.ts";
import { getOpenEMRToken } from "@openemr/service.config.ts";
import { roleSchema, type UserRole } from "@db/schema/role.ts";
import { genderSchema } from "@shared/schemas/common.ts";
import { hashPassword, verifyPassword } from "@shared/utils/password.ts";
import { toError } from "@shared/error/error.ts";
import { isProd } from "@/env.ts";
import type { Result } from "@shared/types.ts";
import {
 clearAccessToken,
 consumePasswordResetToken,
 isIdle,
 issuePasswordResetToken,
 issueSession,
 revokeUserRefreshTokens,
 verifyRefreshToken,
 type AuthResult,
} from "@module/auth/helper.ts";
import { z } from "zod";

export const registerSchema = z
 .object({
  email: z.string().email(),
  password: z.string().min(8),
  role: roleSchema,
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  clinicId: z.string().optional(),
  phone: z.string().min(1),
  birthDate: z.string().min(1),
  gender: genderSchema,
  npi: z.string().min(1).optional(),
 })
 .superRefine((value, ctx) => {
  if (value.role === "doctor" && !value.npi) {
   ctx.addIssue({
    code: "custom",
    message: "npi is required for doctors",
    path: ["npi"],
   });
  }
 });
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
 email: z.string().email(),
 password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const refreshTokenSchema = z.object({
 refreshToken: z.string().min(1),
});
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;

export const changePasswordSchema = z.object({
 currentPassword: z.string().min(1),
 newPassword: z.string().min(8),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const forgotPasswordSchema = z.object({
 email: z.string().email(),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
 token: z.string().min(1),
 newPassword: z.string().min(8),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

interface RefreshResult {
 token: string;
 refreshToken: string;
}

interface ForgotPasswordResult {
 success: true;
 resetToken?: string;
}

interface LogoutResult {
 success: true;
}

function hasRequiredScopes(
 granted: string | null,
 role: UserRole,
): boolean {
 const required = ROLE_SCOPES[role];
 if (!required) return true;
 const have = new Set((granted ?? "").split(/\s+/).filter(Boolean));
 return required
  .split(/\s+/)
  .filter(Boolean)
  .every((scope) => have.has(scope));
}

class AuthService {
 register = async (input: RegisterInput): Promise<Result<AuthResult>> => {
  try {
   const [existing] = await findUserByEmail(input.email);
   if (existing) {
    return [null, APIError.conflict("A user with this email already exists")];
   }
   const [provisioned, ex] = await OpenEMRService.provisionOpenEMR(input);
   if (ex || !provisioned) {
    return [null, ex];
   }
   const [passwordHash, er] = await hashPassword(input.password);
   if (er || !passwordHash) {
    return [null, er];
   }
   const auth = await this.createRegisteredUser(
    input,
    provisioned.link,
    passwordHash,
    provisioned.credentials,
   );
   return [auth, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 @Transactional()
 private async createRegisteredUser(
  input: RegisterInput,
  link: OpenEMRProvision,
  passwordHash: string,
  credentials?: OpenEMRCredentials,
 ): Promise<AuthResult> {
  const [user, err] = await createUser({
   email: input.email,
   passwordHash,
   role: input.role,
   firstName: input.firstName,
   lastName: input.lastName,
   clinicId: input.clinicId,
   openemr: link,
  });
  if (err || !user) {
   throw err ?? APIError.internalServer("Failed to create user");
  }
  if (credentials) {
   const [, credErr] = await saveOpenEMRCredentials(user.id, credentials);
   if (credErr) {
    logger.warn(
     `Failed to store OpenEMR credentials for ${user.email}: ${credErr.message}`,
    );
   }
  }
  const [issued, authErr] = await issueSession(user);
  if (authErr || !issued) {
   throw authErr ?? APIError.internalServer("Failed to issue session");
  }
  return issued;
 }

 login = async (input: LoginInput): Promise<Result<AuthResult>> => {
  try {
   const [user] = await findUserByEmail(input.email);
   if (!user) return [null, APIError.unauthorized("Invalid email or password")];
   const [valid, err] = await verifyPassword({
    password: input.password,
    hash: user.passwordHash,
   });
   if (err) return [null, err];
   if (!valid) {
    return [null, APIError.unauthorized("Invalid email or password")];
   }
   await this.autoConnectOpenEMR(user.id, user.role);
   const [auth, authErr] = await issueSession(user);
   if (authErr || !auth) return [null, authErr];
   return [auth, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 private autoConnectOpenEMR = async (
  userId: string,
  role: UserRole,
 ): Promise<void> => {
  try {
   const [tokens] = await getTokens(userId);
   const staleScopes =
    !!tokens?.refreshToken && !hasRequiredScopes(tokens.scope, role);
   if (tokens?.refreshToken && !staleScopes) {
    const [accessToken, rErr] = await getOpenEMRToken(userId);
    if (!rErr && accessToken) return;
    logger.warn(
     `OpenEMR refresh failed for user ${userId}: ${rErr?.message}; falling back to credentials`,
    );
   }
   const [credentials] = await getOpenEMRCredentials(userId);
   if (!credentials) return;
   const [, err] = await OpenEMRService.connectWithCredentials(
    userId,
    credentials,
   );
   if (err) {
    logger.warn(
     `OpenEMR auto-connect failed for user ${userId}: ${err.message}`,
    );
   }
  } catch (e) {
   logger.warn(
    `OpenEMR auto-connect error for user ${userId}: ${toError(e).message}`,
   );
  }
 };

 refresh = async (input: RefreshTokenInput): Promise<Result<RefreshResult>> => {
  try {
   const [verified, err] = await verifyRefreshToken(input.refreshToken);
   if (err || !verified) return [null, err];
   const { userId, createdAt } = verified;
   if (isIdle(createdAt)) {
    await revokeUserRefreshTokens(userId);
    return [
     null,
     APIError.unauthorized(
      "Session expired due to inactivity. Please log in again.",
     ),
    ];
   }
   const [user, findErr] = await findUserById(userId);
   if (!user) return [null, findErr];
   const issued = await this.rotateSession(user);
   return [{ token: issued.token, refreshToken: issued.refreshToken }, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 @Transactional()
 private async rotateSession(user: PublicUser): Promise<AuthResult> {
  const [, rerr] = await revokeUserRefreshTokens(user.id);
  if (rerr) throw rerr;
  const [session, ierr] = await issueSession(user);
  if (ierr || !session) {
   throw ierr ?? APIError.internalServer("Failed to issue session");
  }
  return session;
 }

 changePassword = async (
  userId: string,
  input: ChangePasswordInput,
 ): Promise<Result<{ success: true }>> => {
  try {
   const [user, err] = await findUserByIdWithPassword(userId);
   if (err || !user) return [null, err];
   const [valid] = await verifyPassword({
    password: input.currentPassword,
    hash: user.passwordHash,
   });
   if (!valid) {
    return [null, APIError.badRequest("Current password is incorrect")];
   }
   const [hash, herr] = await hashPassword(input.newPassword);
   if (herr || !hash) {
    return [null, herr];
   }
   await this.persistPasswordChange(userId, hash);
   return [{ success: true }, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 @Transactional()
 private async persistPasswordChange(
  userId: string,
  hash: string,
 ): Promise<void> {
  const [, uerr] = await updatePasswordHash(userId, hash);
  if (uerr) throw uerr;
  const [, rerr] = await revokeUserRefreshTokens(userId);
  if (rerr) throw rerr;
  const [, eerr] = await bumpSessionEpoch(userId);
  if (eerr) throw eerr;
 }

 forgotPassword = async (
  input: ForgotPasswordInput,
 ): Promise<Result<ForgotPasswordResult>> => {
  try {
   const [user] = await findUserByEmail(input.email);
   if (!user) return [{ success: true }, null];
   const [token, err] = await issuePasswordResetToken(user.id);
   if (err || !token) return [null, err];
   logger.info({ userId: user.id }, "Password reset token issued");
   return [
    isProd() ? { success: true } : { success: true, resetToken: token },
    null,
   ];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 resetPassword = async (
  input: ResetPasswordInput,
 ): Promise<Result<{ success: true }>> => {
  try {
   const [hash, herr] = await hashPassword(input.newPassword);
   if (herr || !hash) {
    return [null, herr];
   }
   await this.persistPasswordReset(input.token, hash);
   return [{ success: true }, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 @Transactional()
 private async persistPasswordReset(
  token: string,
  hash: string,
 ): Promise<void> {
  const [userId, err] = await consumePasswordResetToken(token);
  if (err || !userId) {
   throw err ?? APIError.badRequest("Invalid or expired reset token");
  }
  const [, uerr] = await updatePasswordHash(userId, hash);
  if (uerr) throw uerr;
  const [, rerr] = await revokeUserRefreshTokens(userId);
  if (rerr) throw rerr;
  const [, eerr] = await bumpSessionEpoch(userId);
  if (eerr) throw eerr;
 }

 async logout(userId: string): Promise<Result<LogoutResult>> {
  try {
   await this.revokeSession(userId);
   return [{ success: true }, null];
  } catch (e) {
   return [null, toError(e)];
  }
 }

 @Transactional()
 private async revokeSession(userId: string): Promise<void> {
  const [, rerr] = await revokeUserRefreshTokens(userId);
  if (rerr) throw rerr;
  const [, eerr] = await bumpSessionEpoch(userId);
  if (eerr) throw eerr;
  const [, err] = await clearAccessToken(userId);
  if (err) throw err;
 }
}

export default new AuthService();
