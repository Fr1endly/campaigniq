CREATE TYPE "public"."prediction_run_status" AS ENUM('running', 'completed', 'insufficient_data', 'failed');--> statement-breakpoint
CREATE TABLE "campaign_predictions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"prediction_run_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"forecast_start_date" date NOT NULL,
	"forecast_end_date" date NOT NULL,
	"previous_revenue" numeric(18, 2) NOT NULL,
	"predicted_revenue" numeric(18, 2) NOT NULL,
	"lower_bound" numeric(18, 2) NOT NULL,
	"upper_bound" numeric(18, 2) NOT NULL,
	"drivers" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_predictions_run_campaign_uq" UNIQUE("prediction_run_id","campaign_id"),
	CONSTRAINT "campaign_predictions_dates_valid" CHECK ("campaign_predictions"."forecast_end_date" >= "campaign_predictions"."forecast_start_date"),
	CONSTRAINT "campaign_predictions_values_valid" CHECK ("campaign_predictions"."previous_revenue" >= 0
        and "campaign_predictions"."lower_bound" >= 0
        and "campaign_predictions"."predicted_revenue" >= "campaign_predictions"."lower_bound"
        and "campaign_predictions"."upper_bound" >= "campaign_predictions"."predicted_revenue")
);
--> statement-breakpoint
CREATE TABLE "prediction_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"status" "prediction_run_status" NOT NULL,
	"target" text NOT NULL,
	"model_version" text NOT NULL,
	"algorithm" text NOT NULL,
	"source_data_revision" bigint NOT NULL,
	"data_as_of" date,
	"training_start_date" date,
	"training_end_date" date,
	"forecast_start_date" date,
	"forecast_end_date" date,
	"training_rows" integer,
	"eligible_campaigns" integer,
	"excluded_campaigns" integer,
	"mae" numeric(18, 2),
	"wape" numeric(8, 4),
	"baseline_mae" numeric(18, 2),
	"baseline_wape" numeric(8, 4),
	"interval_level" integer,
	"interval_coverage" numeric(8, 4),
	"quality" text,
	"parameters" jsonb,
	"coefficients" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"duration_ms" integer,
	"error_message" text,
	CONSTRAINT "prediction_runs_id_org_uq" UNIQUE("id","organization_id"),
	CONSTRAINT "prediction_runs_source_revision_nonnegative" CHECK ("prediction_runs"."source_data_revision" >= 0),
	CONSTRAINT "prediction_runs_counts_nonnegative" CHECK (coalesce("prediction_runs"."training_rows", 0) >= 0
        and coalesce("prediction_runs"."eligible_campaigns", 0) >= 0
        and coalesce("prediction_runs"."excluded_campaigns", 0) >= 0),
	CONSTRAINT "prediction_runs_metrics_nonnegative" CHECK (coalesce("prediction_runs"."mae", 0) >= 0
        and coalesce("prediction_runs"."wape", 0) >= 0
        and coalesce("prediction_runs"."baseline_mae", 0) >= 0
        and coalesce("prediction_runs"."baseline_wape", 0) >= 0),
	CONSTRAINT "prediction_runs_interval_valid" CHECK ("prediction_runs"."interval_level" is null or "prediction_runs"."interval_level" between 1 and 99),
	CONSTRAINT "prediction_runs_coverage_valid" CHECK ("prediction_runs"."interval_coverage" is null or "prediction_runs"."interval_coverage" between 0 and 100),
	CONSTRAINT "prediction_runs_quality_valid" CHECK ("prediction_runs"."quality" is null or "prediction_runs"."quality" in ('beats_baseline', 'below_baseline'))
);
--> statement-breakpoint
ALTER TABLE "campaign_predictions" ADD CONSTRAINT "campaign_predictions_run_org_fk" FOREIGN KEY ("prediction_run_id","organization_id") REFERENCES "public"."prediction_runs"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_predictions" ADD CONSTRAINT "campaign_predictions_campaign_org_fk" FOREIGN KEY ("campaign_id","organization_id") REFERENCES "public"."campaigns"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prediction_runs" ADD CONSTRAINT "prediction_runs_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_predictions_org_campaign_idx" ON "campaign_predictions" USING btree ("organization_id","campaign_id");--> statement-breakpoint
CREATE INDEX "prediction_runs_org_started_idx" ON "prediction_runs" USING btree ("organization_id","started_at");