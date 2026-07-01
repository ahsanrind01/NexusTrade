CREATE TYPE "public"."order_side" AS ENUM('BUY', 'SELL');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('PENDING', 'FILLED', 'CANCELLED', 'PARTIAL');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('MAKER', 'TAKER');--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"asset" text NOT NULL,
	"side" "order_side" NOT NULL,
	"price" numeric NOT NULL,
	"amount" numeric NOT NULL,
	"status" "order_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trade_id" text NOT NULL,
	"user_id" text NOT NULL,
	"order_id" uuid NOT NULL,
	"asset" text NOT NULL,
	"side" "order_side" NOT NULL,
	"role" "role" NOT NULL,
	"price" numeric NOT NULL,
	"amount" numeric NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;