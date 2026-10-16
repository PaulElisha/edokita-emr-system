/** @format */
import { sql } from "drizzle-orm";
import {
 index,
 jsonb,
 pgTable,
 primaryKey,
 text,
 timestamp,
 uuid,
} from "drizzle-orm/pg-core";
import { users } from "./user.ts";

/**
 * Local secure messaging. OpenEMR's message API has no read/list endpoint, so
 * conversations and messages are owned by this app while OpenEMR keeps the
 * clinical chart.
 */
export const conversationThreads = pgTable("conversation_threads", {
 id: uuid("id")
  .primaryKey()
  .default(sql`gen_random_uuid()`),
 subject: text("subject"),
 patientId: text("patient_id"),
 practitionerId: text("practitioner_id"),
 createdBy: uuid("created_by").references(() => users.id, {
  onDelete: "set null",
 }),
 lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
 createdAt: timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow(),
});

export const conversationMessages = pgTable(
 "conversation_messages",
 {
  id: uuid("id")
   .primaryKey()
   .default(sql`gen_random_uuid()`),
  threadId: uuid("thread_id")
   .notNull()
   .references(() => conversationThreads.id, { onDelete: "cascade" }),
  senderId: uuid("sender_id").references(() => users.id, {
   onDelete: "set null",
  }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
   .notNull()
   .defaultNow(),
 },
 (t) => [index("conversation_messages_thread_idx").on(t.threadId)],
);

export const threadReads = pgTable(
 "thread_reads",
 {
  threadId: uuid("thread_id")
   .notNull()
   .references(() => conversationThreads.id, { onDelete: "cascade" }),
  userId: uuid("user_id")
   .notNull()
   .references(() => users.id, { onDelete: "cascade" }),
  lastReadAt: timestamp("last_read_at", { withTimezone: true })
   .notNull()
   .defaultNow(),
 },
 (t) => [primaryKey({ columns: [t.threadId, t.userId] })],
);

export const notifications = pgTable(
 "notifications",
 {
  id: uuid("id")
   .primaryKey()
   .default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
   .notNull()
   .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  body: text("body"),
  data: jsonb("data"),
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
   .notNull()
   .defaultNow(),
 },
 (t) => [index("notifications_user_idx").on(t.userId)],
);
