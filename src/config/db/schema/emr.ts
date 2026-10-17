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

/**
 * Attribution for EMR records written through our API. OpenEMR does not store
 * the author for problem-list items, vitals, or SOAP notes, so we record who
 * posted each record (and when) ourselves. `resourceId` is the id our read API
 * exposes (the resource uuid, or the SOAP note id).
 */
export const emrRecordAuthors = pgTable(
 "emr_record_authors",
 {
  id: uuid("id")
   .primaryKey()
   .default(sql`gen_random_uuid()`),
  /** OpenEMR patient uuid (as used in the API path). */
  patientId: text("patient_id").notNull(),
  /** `encounter` | `condition` | `allergy` | `medication` | `soap_note`. */
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
