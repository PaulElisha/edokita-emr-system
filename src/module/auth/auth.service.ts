/** @format */
import APIError from "@error/APIError.ts";
import { signAppToken } from "@auth/jwt.ts";
import { provisionOpenEMR } from "@module/openemr/helpers.ts";
import {
 createUser,
 findUserByEmail,
 toPublicUser,
 type PublicUser,
} from "@module/user/helper.ts";
import { roleSchema } from "@db/schema/role.ts";
import { genderSchema } from "@shared/schemas/common.ts";
import { hashPassword, verifyPassword } from "@shared/utils/password.ts";
import { toError } from "@shared/error/error.ts";
import type { Result } from "@shared/types.ts";
import { clearTokens } from "@module/auth/helper.ts";
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

export interface AuthResult {
 user: PublicUser;
 token: string;
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
    return [
     null,
     ex ?? APIError.internalServer("Failed to provision OpenEMR record"),
    ];
   }
   const [passwordHash, er] = await hashPassword(input.password);
   if (er || !passwordHash) {
    return [null, er ?? APIError.internalServer("Failed to hash password")];
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
    return [null, err ?? APIError.internalServer("Failed to create user")];
   }
   const token = await signAppToken({
    userId: user.id,
    role: user.role,
    email: user.email,
   });
   return [{ user: toPublicUser(user), token }, null];
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
    return [null, err ?? APIError.unauthorized("Invalid email or password")];
   }
   const token = await signAppToken({
    userId: user.id,
    role: user.role,
    email: user.email,
   });
   return [{ user: toPublicUser(user), token }, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

  logout = async (userId: string): Promise<Result<LogoutResult>> => {
   const [, err] = await clearTokens(userId);
   if (err) return [null, err];
   return [{ success: true }, null];
  };
}

export default new AuthService();
