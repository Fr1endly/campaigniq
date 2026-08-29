ALTER TABLE "import_runs" ADD COLUMN "inserted_rows" bigint;--> statement-breakpoint
ALTER TABLE "import_runs" ADD COLUMN "updated_rows" bigint;--> statement-breakpoint
ALTER TABLE "import_runs" ADD COLUMN "unchanged_rows" bigint;--> statement-breakpoint
ALTER TABLE "import_runs" ADD CONSTRAINT "import_runs_outcome_counts_valid" CHECK ((
        "import_runs"."inserted_rows" is null
        and "import_runs"."updated_rows" is null
        and "import_runs"."unchanged_rows" is null
      ) or (
        "import_runs"."inserted_rows" >= 0
        and "import_runs"."updated_rows" >= 0
        and "import_runs"."unchanged_rows" >= 0
        and "import_runs"."inserted_rows" + "import_runs"."updated_rows" + "import_runs"."unchanged_rows" = "import_runs"."loaded_rows"
      ));