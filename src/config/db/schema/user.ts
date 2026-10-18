import { sql } from "drizzle-orm";
import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { roles } from "./role.ts";

export const users = pgTable("app_users", {
 id: uuid("id")
  .primaryKey()
  .default(sql`gen_random_uuid()`),
 email: text("email").notNull().unique(),
 passwordHash: text("password_hash").notNull(),
 roleId: uuid("role_id")
  .notNull()
  .references(() => roles.id),
 firstName: text("first_name").notNull(),
 lastName: text("last_name").notNull(),
 clinicId: text("clinic_id"),
 openemrSubject: text("openemr_subject"),
 openemrFhirUser: text("openemr_fhir_user"),
 openemrPatientId: text("openemr_patient_id"),
 openemrPractitionerId: text("openemr_practitioner_id"),
 openemrUsername: text("openemr_username"),
 openemrPassword: text("openemr_password"),
 sessionEpoch: integer("session_epoch").notNull().default(0),
 createdAt: timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow(),
});
