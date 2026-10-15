/** @format */

import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./user.ts";

export const openemrTokens = pgTable("openemr_tokens", {
 userId: uuid("user_id")
  .primaryKey()
  .references(() => users.id, { onDelete: "cascade" }),
 accessToken: text("access_token").notNull(),
 refreshToken: text("refresh_token"),
 expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
 scope: text("scope"),
 subject: text("subject"),
 updatedAt: timestamp("updated_at", { withTimezone: true })
  .notNull()
  .defaultNow(),
});

export const openemrAuthStates = pgTable("openemr_auth_states", {
 state: text("state").primaryKey(),
 userId: uuid("user_id")
  .notNull()
  .references(() => users.id, { onDelete: "cascade" }),
 verifier: text("verifier").notNull(),
 nonce: text("nonce").notNull(),
 createdAt: timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow(),
});
