CREATE TABLE "emr_record_authors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" text NOT NULL,
	"author_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "emr_record_authors" ADD CONSTRAINT "emr_record_authors_author_user_id_app_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "emr_record_authors_resource_idx" ON "emr_record_authors" USING btree ("resource_type","resource_id");--> statement-breakpoint
CREATE INDEX "emr_record_authors_patient_idx" ON "emr_record_authors" USING btree ("patient_id");