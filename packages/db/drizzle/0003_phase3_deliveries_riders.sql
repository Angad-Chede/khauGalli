-- 0003_phase3_deliveries_riders.sql
-- Add Phase 3 Riders, Deliveries, Offers, and Live Geospatial Location

CREATE TABLE IF NOT EXISTS "riders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"vehicle_type" varchar(30) DEFAULT 'MOTORCYCLE' NOT NULL,
	"vehicle_number" varchar(30),
	"kyc_status" varchar(30) DEFAULT 'VERIFIED' NOT NULL,
	"is_online" boolean DEFAULT false NOT NULL,
	"is_busy" boolean DEFAULT false NOT NULL,
	"rating_average" numeric(3, 2) DEFAULT '4.80' NOT NULL,
	"rating_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "riders_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_riders_user_id" ON "riders" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_riders_availability" ON "riders" ("is_online", "is_busy");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "rider_current_location" (
	"rider_id" uuid PRIMARY KEY NOT NULL,
	"geog" geography(Point, 4326) NOT NULL,
	"heading_degrees" integer,
	"speed_kmh" numeric(4, 1),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rider_current_location_rider_id_fk" FOREIGN KEY ("rider_id") REFERENCES "riders"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_rider_current_location_geog" ON "rider_current_location" USING gist ("geog");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"rider_id" uuid,
	"status" varchar(30) DEFAULT 'PENDING_ASSIGNMENT' NOT NULL,
	"pickup_geog" geography(Point, 4326) NOT NULL,
	"dropoff_geog" geography(Point, 4326) NOT NULL,
	"pickup_otp_hash" varchar(100) NOT NULL,
	"delivery_otp_hash" varchar(100) NOT NULL,
	"distance_meters" integer DEFAULT 1000 NOT NULL,
	"payout_paise" integer DEFAULT 4000 NOT NULL,
	"picked_up_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deliveries_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "deliveries_rider_id_fk" FOREIGN KEY ("rider_id") REFERENCES "riders"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_deliveries_order_id" ON "deliveries" ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_deliveries_rider_id" ON "deliveries" ("rider_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_deliveries_status" ON "deliveries" ("status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "delivery_offers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"delivery_id" uuid NOT NULL,
	"rider_id" uuid NOT NULL,
	"status" varchar(30) DEFAULT 'OFFERED' NOT NULL,
	"payout_paise" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "delivery_offers_delivery_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "delivery_offers_rider_id_fk" FOREIGN KEY ("rider_id") REFERENCES "riders"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_delivery_offers_delivery_rider" ON "delivery_offers" ("delivery_id", "rider_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_delivery_offers_rider_status" ON "delivery_offers" ("rider_id", "status");
