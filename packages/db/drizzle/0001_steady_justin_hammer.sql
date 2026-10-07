CREATE TABLE "explains" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"term" text NOT NULL,
	"context" text,
	"native_lang" text DEFAULT 'ru' NOT NULL,
	"target_lang" text DEFAULT 'en' NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "check" jsonb;--> statement-breakpoint
ALTER TABLE "explains" ADD CONSTRAINT "explains_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "explains_user_idx" ON "explains" USING btree ("user_id","created_at");