import { sql } from "drizzle-orm";
import {
 index,
 integer,
 pgTable,
 text,
 timestamp,
 uuid,
} from "drizzle-orm/pg-core";
import { users } from "./user.ts";

export const appointmentOverrides = pgTable("appointment_overrides", {
 id: uuid("id")
  .primaryKey()
  .default(sql`gen_random_uuid()`),
 appointmentUuid: text("appointment_uuid").notNull().unique(),
 status: text("status"),
 start: timestamp("start", { withTimezone: true }),
 end: timestamp("end", { withTimezone: true }),
 note: text("note"),
 updatedBy: uuid("updated_by").references(() => users.id, {
  onDelete: "set null",
 }),
 createdAt: timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow(),
 updatedAt: timestamp("updated_at", { withTimezone: true })
  .notNull()
  .defaultNow(),
});

export const providerSchedules = pgTable(
 "provider_schedules",
 {
  id: uuid("id")
   .primaryKey()
   .default(sql`gen_random_uuid()`),
  practitionerId: text("practitioner_id").notNull(),
  weekday: integer("weekday").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  slotMinutes: integer("slot_minutes").notNull().default(30),
  active: integer("active").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true })
   .notNull()
   .defaultNow(),
 },
 (t) => [index("provider_schedules_practitioner_idx").on(t.practitionerId)],
);

export const appointmentWaitlist = pgTable("appointment_waitlist", {
 id: uuid("id")
  .primaryKey()
  .default(sql`gen_random_uuid()`),
 patientId: text("patient_id").notNull(),
 practitionerId: text("practitioner_id"),
 preferredDate: text("preferred_date"),
 reason: text("reason"),
 status: text("status").notNull().default("waiting"),
 createdAt: timestamp("created_at", { withTimezone: true })
  .notNull()
  .defaultNow(),
});
