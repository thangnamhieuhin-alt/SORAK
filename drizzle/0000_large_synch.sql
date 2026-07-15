CREATE TYPE "public"."milestone_status" AS ENUM('locked', 'reached', 'badge_minted');--> statement-breakpoint
CREATE TYPE "public"."tip_method" AS ENUM('direct', 'claimable_balance');--> statement-breakpoint
CREATE TYPE "public"."tip_status" AS ENUM('pending', 'submitted', 'confirmed', 'claimable', 'claimed', 'failed');--> statement-breakpoint
CREATE TABLE "auth_nonces" (
	"nonce" text PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "badges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"milestone_id" uuid NOT NULL,
	"recipient_public_key" text NOT NULL,
	"recipient_name" text,
	"asset_code" text NOT NULL,
	"issuer_public_key" text NOT NULL,
	"claimable_balance_id" text,
	"stellar_tx_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creators" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handle" text NOT NULL,
	"display_name" text NOT NULL,
	"bio" text,
	"category" text DEFAULT 'Creator' NOT NULL,
	"avatar_color" text DEFAULT 'rose' NOT NULL,
	"owner_public_key" text NOT NULL,
	"goal_amount" text,
	"usdc_trustline" boolean DEFAULT false NOT NULL,
	"account_funded" boolean DEFAULT false NOT NULL,
	"network" text DEFAULT 'testnet' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "creators_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" text NOT NULL,
	"route" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" text NOT NULL,
	"response_body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"tier" integer NOT NULL,
	"title" text NOT NULL,
	"threshold_amount" text NOT NULL,
	"badge_asset_code" text NOT NULL,
	"status" "milestone_status" DEFAULT 'locked' NOT NULL,
	"reached_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_id" uuid NOT NULL,
	"fan_public_key" text NOT NULL,
	"fan_name" text,
	"asset" text DEFAULT 'XLM' NOT NULL,
	"amount" text NOT NULL,
	"message" text,
	"method" "tip_method" DEFAULT 'direct' NOT NULL,
	"status" "tip_status" DEFAULT 'pending' NOT NULL,
	"claimable_balance_id" text,
	"stellar_tx_hash" text,
	"version" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "badges" ADD CONSTRAINT "badges_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "badges" ADD CONSTRAINT "badges_milestone_id_milestones_id_fk" FOREIGN KEY ("milestone_id") REFERENCES "public"."milestones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tips" ADD CONSTRAINT "tips_creator_id_creators_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."creators"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "badges_creator_idx" ON "badges" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "badges_recipient_idx" ON "badges" USING btree ("recipient_public_key");--> statement-breakpoint
CREATE INDEX "creators_owner_idx" ON "creators" USING btree ("owner_public_key");--> statement-breakpoint
CREATE INDEX "idempotency_keys_pk" ON "idempotency_keys" USING btree ("key","route");--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "milestones_creator_tier_idx" ON "milestones" USING btree ("creator_id","tier");--> statement-breakpoint
CREATE INDEX "tips_creator_idx" ON "tips" USING btree ("creator_id");--> statement-breakpoint
CREATE INDEX "tips_fan_idx" ON "tips" USING btree ("fan_public_key");--> statement-breakpoint
CREATE INDEX "tips_creator_status_created_idx" ON "tips" USING btree ("creator_id","status","created_at");