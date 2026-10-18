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
