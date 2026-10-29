/** @format */

import { sql } from "drizzle-orm";
import {
 index,
 pgTable,
 text,
 timestamp,
 uniqueIndex,
 uuid,
} from "drizzle-orm/pg-core";
import { users } from "./user.ts";

export const emrAccessRequests = pgTable(
 "emr_access_requests",
 {
  id: uuid("id")
   .primaryKey()
   .default(sql`gen_random_uuid()`),
  patientId: text("patient_id").notNull(),
  doctorUserId: uuid("doctor_user_id")
   .notNull()
   .references(() => users.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"),
  reason: text("reason"),
  requestedAt: timestamp("requested_at", { withTimezone: true })
   .notNull()
   .defaultNow(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  reviewedBy: uuid("reviewed_by").references(() => users.id, {
   onDelete: "set null",
  }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
 },
 (t) => [
  index("emr_access_requests_patient_idx").on(t.patientId),
  index("emr_access_requests_doctor_idx").on(t.doctorUserId),
  index("emr_access_requests_doctor_patient_idx").on(
   t.doctorUserId,
   t.patientId,
  ),
 ],
);

export const emrRecordAuthors = pgTable(
 "emr_record_authors",
 {
  id: uuid("id")
   .primaryKey()
   .default(sql`gen_random_uuid()`),
  patientId: text("patient_id").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id").notNull(),
  authorUserId: uuid("author_user_id")
   .notNull()
   .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
   .notNull()
   .defaultNow(),
 },
 (t) => [
  uniqueIndex("emr_record_authors_resource_idx").on(
   t.resourceType,
   t.resourceId,
  ),
  index("emr_record_authors_patient_idx").on(t.patientId),
 ],
);
