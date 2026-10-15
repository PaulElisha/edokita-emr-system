CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" text NOT NULL
);--> statement-breakpoint
ALTER TABLE "roles" ADD CONSTRAINT "roles_name_unique" UNIQUE("name");--> statement-breakpoint
INSERT INTO "roles" ("name") VALUES ('patient'), ('doctor'), ('admin');--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "role_id" uuid;--> statement-breakpoint
UPDATE "app_users" SET "role_id" = "roles"."id" FROM "roles" WHERE "roles"."name" = "app_users"."role";--> statement-breakpoint
UPDATE "app_users" SET "role_id" = (SELECT "id" FROM "roles" WHERE "name" = 'patient') WHERE "role_id" IS NULL;--> statement-breakpoint
ALTER TABLE "app_users" ALTER COLUMN "role_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "app_users" DROP COLUMN "role";--> statement-breakpoint
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;
