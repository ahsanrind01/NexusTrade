CREATE TYPE "public"."order_type" AS ENUM('LIMIT', 'MARKET');--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "type" "order_type" DEFAULT 'LIMIT' NOT NULL;--> statement-breakpoint
