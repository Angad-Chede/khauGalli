-- 0001_phase1_catalog_enhancements.sql
-- Add Phase 1 catalog enhancements: restaurant operational fields, hierarchical modifiers, outbox and audit log

ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "accepting_orders" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "menu_version" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "rating_average" numeric(3, 2) DEFAULT '4.50' NOT NULL;
--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "rating_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "hero_image_url" text;
--> statement-breakpoint
ALTER TABLE "restaurants" ADD COLUMN IF NOT EXISTS "delivery_radius_meters" integer DEFAULT 5000 NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_restaurants_status_open" ON "restaurants" ("status", "is_open", "accepting_orders");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "modifier_groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"menu_item_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"min_selections" integer DEFAULT 0 NOT NULL,
	"max_selections" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "modifier_groups_menu_item_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_modifier_groups_item_id" ON "modifier_groups" ("menu_item_id", "sort_order");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "modifier_options" (
	"id" uuid PRIMARY KEY NOT NULL,
	"modifier_group_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"price_paise" integer DEFAULT 0 NOT NULL,
	"is_veg" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "modifier_options_modifier_group_id_fk" FOREIGN KEY ("modifier_group_id") REFERENCES "modifier_groups"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_modifier_options_group_id" ON "modifier_options" ("modifier_group_id", "sort_order");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "outbox_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"aggregate_type" varchar(50) NOT NULL,
	"aggregate_id" uuid NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_outbox_unprocessed" ON "outbox_events" ("processed_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_outbox_aggregate" ON "outbox_events" ("aggregate_type", "aggregate_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "audit_log" (
	"id" uuid PRIMARY KEY NOT NULL,
	"actor_id" uuid,
	"actor_role" varchar(50) NOT NULL,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid NOT NULL,
	"diff" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_log_entity" ON "audit_log" ("entity_type", "entity_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_audit_log_actor" ON "audit_log" ("actor_id");
--> statement-breakpoint
DROP TABLE IF EXISTS "item_modifiers";
