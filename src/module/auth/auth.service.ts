/** @format */
import APIError from "@error/APIError.ts";
import logger from "@app/logger.ts";
import { provisionOpenEMR } from "@module/openemr/helpers.ts";
import {
 createUser,
 findUserByEmail,
 findUserById,
 toPublicUser,
 updatePasswordHash,
} from "@module/user/helper.ts";
import { roleSchema } from "@db/schema/role.ts";
import { genderSchema } from "@shared/schemas/common.ts";
import { hashPassword, verifyPassword } from "@shared/utils/password.ts";
import { toError } from "@shared/error/error.ts";
import { isProd } from "@/env.ts";
import type { Result } from "@shared/types.ts";
import {
 clearTokens,
 consumePasswordResetToken,
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

export interface RefreshResult {
 token: string;
 refreshToken: string;
}

export interface ForgotPasswordResult {
 success: true;
 /** Present only outside production (no mailer configured). */
 resetToken?: string;
}

export interface LogoutResult {
 success: true;
}

class AuthService {
 register = async (input: RegisterInput): Promise<Result<AuthResult>> => {
  try {
   const [existing] = await findUserByEmail(input.email);
   if (existing) {
    return [null, APIError.conflict("A user with this email already exists")];
   }
   const [openemr, ex] = await provisionOpenEMR(input);
   if (ex || !openemr) {
    return [null, ex];
   }
   const [passwordHash, er] = await hashPassword(input.password);
   if (er || !passwordHash) {
    return [null, er];
   }
   const [user, err] = await createUser({
    email: input.email,
    passwordHash,
    role: input.role,
    firstName: input.firstName,
    lastName: input.lastName,
    clinicId: input.clinicId,
    openemr,
   });
   if (err || !user) {
    return [null, err];
   }
   const [auth, authErr] = await issueSession(toPublicUser(user));
   if (authErr || !auth) return [null, authErr];
   return [auth, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 login = async (input: LoginInput): Promise<Result<AuthResult>> => {
  try {
   const [user] = await findUserByEmail(input.email);
   if (!user) return [null, APIError.unauthorized("Invalid email or password")];
   const [valid, err] = await verifyPassword({
    password: input.password,
    hash: user.passwordHash,
   });
   if (err || !valid) {
    return [null, err];
   }
   const [auth, authErr] = await issueSession(toPublicUser(user));
   if (authErr || !auth) return [null, authErr];
   return [auth, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 refresh = async (input: RefreshTokenInput): Promise<Result<RefreshResult>> => {
  const [userId, err] = await verifyRefreshToken(input.refreshToken);
  if (err || !userId) return [null, err];
  const [user, findErr] = await findUserById(userId);
  if (!user) return [null, findErr];
  // Rotate: revoke the presented token and issue a fresh pair.
  await revokeUserRefreshTokens(userId);
  const [issued, ierr] = await issueSession(toPublicUser(user));
  if (ierr || !issued) return [null, ierr];
  return [{ token: issued.token, refreshToken: issued.refreshToken }, null];
 };

 changePassword = async (
  userId: string,
  input: ChangePasswordInput,
 ): Promise<Result<{ success: true }>> => {
  try {
   const [user, err] = await findUserById(userId);
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
   const [, uerr] = await updatePasswordHash(userId, hash);
   if (uerr) return [null, uerr];
   // Force re-authentication everywhere after a password change.
   await revokeUserRefreshTokens(userId);
   return [{ success: true }, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 forgotPassword = async (
  input: ForgotPasswordInput,
 ): Promise<Result<ForgotPasswordResult>> => {
  try {
   const [user] = await findUserByEmail(input.email);
   // Do not leak whether the email exists.
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
   const [userId, err] = await consumePasswordResetToken(input.token);
   if (err || !userId)
    return [null, err];
   const [hash, herr] = await hashPassword(input.newPassword);
   if (herr || !hash) {
    return [null, herr];
   }
   const [, uerr] = await updatePasswordHash(userId, hash);
   if (uerr) return [null, uerr];
   await revokeUserRefreshTokens(userId);
   return [{ success: true }, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 logout = async (userId: string): Promise<Result<LogoutResult>> => {
  const [, rerr] = await revokeUserRefreshTokens(userId);
  if (rerr) return [null, rerr];
  const [, err] = await clearTokens(userId);
  if (err) return [null, err];
  return [{ success: true }, null];
 };
}

export default new AuthService();
