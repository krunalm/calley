CREATE TABLE "event_exceptions" (
	"id" varchar(128) PRIMARY KEY NOT NULL,
	"recurring_event_id" varchar(128) NOT NULL,
	"user_id" varchar(128) NOT NULL,
	"original_date" timestamp with time zone NOT NULL,
	"overrides" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "event_exceptions" ADD CONSTRAINT "event_exceptions_recurring_event_id_events_id_fk" FOREIGN KEY ("recurring_event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_exceptions" ADD CONSTRAINT "event_exceptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_event_exceptions_parent" ON "event_exceptions" USING btree ("recurring_event_id");--> statement-breakpoint
CREATE INDEX "idx_event_exceptions_user" ON "event_exceptions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_event_exceptions_date" ON "event_exceptions" USING btree ("recurring_event_id","original_date") WHERE "event_exceptions"."deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_reset_tokens_one_active_per_user" ON "password_reset_tokens" USING btree ("user_id") WHERE "password_reset_tokens"."used_at" IS NULL;