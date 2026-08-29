CREATE TYPE "public"."warehouse_refresh_status" AS ENUM('current', 'stale', 'refreshing', 'failed');--> statement-breakpoint
CREATE TABLE "warehouse_refresh_state" (
	"aggregate_key" text PRIMARY KEY NOT NULL,
	"status" "warehouse_refresh_status" NOT NULL,
	"data_revision" bigint DEFAULT 0 NOT NULL,
	"refreshed_revision" bigint DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error_message" text,
	CONSTRAINT "warehouse_refresh_revisions_nonnegative" CHECK ("warehouse_refresh_state"."data_revision" >= 0 and "warehouse_refresh_state"."refreshed_revision" >= 0),
	CONSTRAINT "warehouse_refresh_revision_order" CHECK ("warehouse_refresh_state"."refreshed_revision" <= "warehouse_refresh_state"."data_revision")
);
--> statement-breakpoint
CREATE MATERIALIZED VIEW "public"."organization_daily_performance" AS (
  select
    organization_id,
    date,
    sum(impressions)::bigint as impressions,
    sum(clicks)::bigint as clicks,
    sum(conversions)::bigint as conversions,
    sum(spend)::numeric(18,2) as spend,
    sum(revenue)::numeric(18,2) as revenue
  from marketing_performance
  group by organization_id, date
);--> statement-breakpoint
CREATE UNIQUE INDEX "organization_daily_performance_org_date_uq" ON "organization_daily_performance" ("organization_id", "date");--> statement-breakpoint
INSERT INTO "warehouse_refresh_state" (
  "aggregate_key",
  "status",
  "data_revision",
  "refreshed_revision",
  "completed_at"
) VALUES (
  'organization_daily_performance',
  'current',
  0,
  0,
  now()
);
