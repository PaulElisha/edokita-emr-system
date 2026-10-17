INSERT INTO "roles" ("name") VALUES ('lab') ON CONFLICT ("name") DO NOTHING;--> statement-breakpoint
