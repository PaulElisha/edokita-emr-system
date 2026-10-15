/** @format */
import { sql } from "drizzle-orm";
import { pgTable, text, uuid } from "drizzle-orm/pg-core";
import { z } from "zod";

export const ROLE_NAMES = ["patient", "doctor", "admin"] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

export const roleSchema = z.enum(ROLE_NAMES);
export type UserRole = RoleName;

export const roles = pgTable("roles", {
 id: uuid("id")
  .primaryKey()
  .default(sql`gen_random_uuid()`),
 name: text("name").$type<RoleName>().notNull().unique(),
});

export type Role = typeof roles.$inferSelect;
