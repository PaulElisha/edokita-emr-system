/** @format */
import { hash, type Options, verify } from "@node-rs/argon2";
import type { Result } from "@shared/types.ts";
import { toError } from "@shared/error/error.ts";
import { z } from "zod";

const opts: Options = {
 memoryCost: 65536, // 64 MiB
 timeCost: 3, // 3 iterations
 parallelism: 4, // 4 lanes
 outputLen: 32, // 32 bytes
 algorithm: 2, // Argon2id
};

export const verifyPasswordSchema = z.object({
 password: z.string(),
 hash: z.string(),
});
export type VerifyPasswordInput = z.infer<typeof verifyPasswordSchema>;

export async function hashPassword(password: string): Promise<Result<string>> {
 try {
  const result = await hash(password, opts);
  return [result, null];
 } catch (e) {
  return [null, toError(e)];
 }
}

export async function verifyPassword(
 data: VerifyPasswordInput,
): Promise<Result<boolean>> {
 try {
  const result = await verify(data.hash, data.password, opts);
  return [result, null];
 } catch (e) {
  return [null, toError(e)];
 }
}
