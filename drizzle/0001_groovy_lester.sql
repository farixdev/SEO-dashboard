DROP INDEX "backlinks_anchor1_idx";--> statement-breakpoint
DROP INDEX "backlinks_anchor2_idx";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "invite_token_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "invite_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "invite_accepted_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "backlinks_anchor1_lower_idx" ON "backlinks" USING btree ("project_id",lower(btrim("anchor_text_1")));--> statement-breakpoint
CREATE INDEX "backlinks_anchor2_lower_idx" ON "backlinks" USING btree ("project_id",lower(btrim("anchor_text_2")));--> statement-breakpoint
CREATE INDEX "users_invite_token_idx" ON "users" USING btree ("invite_token_hash");