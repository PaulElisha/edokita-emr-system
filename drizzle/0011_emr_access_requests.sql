CREATE TABLE "emr_access_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" text NOT NULL,
	"doctor_user_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" uuid,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "emr_access_requests" ADD CONSTRAINT "emr_access_requests_doctor_user_id_app_users_id_fk" FOREIGN KEY ("doctor_user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emr_access_requests" ADD CONSTRAINT "emr_access_requests_reviewed_by_app_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "emr_access_requests_patient_idx" ON "emr_access_requests" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "emr_access_requests_doctor_idx" ON "emr_access_requests" USING btree ("doctor_user_id");--> statement-breakpoint
CREATE INDEX "emr_access_requests_doctor_patient_idx" ON "emr_access_requests" USING btree ("doctor_user_id","patient_id");