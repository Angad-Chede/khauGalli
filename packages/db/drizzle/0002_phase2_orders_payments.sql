-- 0002_phase2_orders_payments.sql
-- Add Phase 2 Orders, Payments, State Machine Events, and Webhooks

CREATE TABLE IF NOT EXISTS "orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_number" varchar(50) NOT NULL UNIQUE,
	"user_id" uuid NOT NULL,
	"restaurant_id" uuid NOT NULL,
	"address_snapshot" jsonb NOT NULL,
	"status" varchar(30) DEFAULT 'CREATED' NOT NULL,
	"payment_mode" varchar(20) DEFAULT 'ONLINE' NOT NULL,
	"idempotency_key" varchar(100) NOT NULL,
	"subtotal_paise" integer NOT NULL,
	"tax_paise" integer NOT NULL,
	"delivery_fee_paise" integer NOT NULL,
	"platform_fee_paise" integer NOT NULL,
	"packaging_fee_paise" integer NOT NULL,
	"discount_paise" integer DEFAULT 0 NOT NULL,
	"grand_total_paise" integer NOT NULL,
	"prep_time_minutes" integer,
	"cancellation_reason" text,
	"customer_notes" text,
	"placed_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action,
	CONSTRAINT "orders_restaurant_id_fk" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_orders_user_idempotency" ON "orders" ("user_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_restaurant_status_created" ON "orders" ("restaurant_id", "status", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_user_created" ON "orders" ("user_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_orders_status" ON "orders" ("status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "order_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"menu_item_id" uuid,
	"item_snapshot" jsonb NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_paise" integer NOT NULL,
	"modifiers_total_paise" integer DEFAULT 0 NOT NULL,
	"line_total_paise" integer NOT NULL,
	"selected_modifiers_snapshot" jsonb,
	CONSTRAINT "order_items_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "order_items_menu_item_id_fk" FOREIGN KEY ("menu_item_id") REFERENCES "menu_items"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_order_items_order_id" ON "order_items" ("order_id");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "order_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" varchar(30),
	"to_status" varchar(30) NOT NULL,
	"actor_role" varchar(30) NOT NULL,
	"actor_id" uuid,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_events_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_order_events_order_created" ON "order_events" ("order_id", "created_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"razorpay_order_id" varchar(100),
	"razorpay_payment_id" varchar(100),
	"amount_paise" integer NOT NULL,
	"currency" varchar(10) DEFAULT 'INR' NOT NULL,
	"status" varchar(30) DEFAULT 'PENDING' NOT NULL,
	"error_code" text,
	"error_description" text,
	"raw_webhook_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_order_id" ON "payments" ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_razorpay_order_id" ON "payments" ("razorpay_order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_razorpay_payment_id" ON "payments" ("razorpay_payment_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_status" ON "payments" ("status");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "webhook_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"provider" varchar(30) DEFAULT 'RAZORPAY' NOT NULL,
	"provider_event_id" varchar(100) NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_webhook_events_provider_event" ON "webhook_events" ("provider", "provider_event_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_webhook_events_processed_at" ON "webhook_events" ("processed_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "refunds" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"payment_id" uuid,
	"amount_paise" integer NOT NULL,
	"reason" text NOT NULL,
	"provider_refund_id" varchar(100),
	"status" varchar(30) DEFAULT 'PROCESSED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refunds_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE no action ON UPDATE no action,
	CONSTRAINT "refunds_payment_id_fk" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE no action ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_refunds_order_id" ON "refunds" ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_refunds_payment_id" ON "refunds" ("payment_id");
