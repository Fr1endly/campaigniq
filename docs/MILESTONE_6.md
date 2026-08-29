# Milestone 6: Predictive Insights

**Completed:** August 29, 2026

**Scope:** Defensible campaign revenue target, time-based baseline evaluation,
persisted model and prediction metadata, automatic generation, and an
interpretable tenant-scoped Insights product surface.

## Delivered

- Organization-specific forecasts for each eligible campaign's next seven
  calendar days of revenue.
- An explainable scikit-learn Ridge pipeline using only the preceding 28 days of
  warehouse facts, with standardized numeric features and campaign/channel
  categorical features.
- A purged 28-day time holdout with MAE and WAPE compared against the previous
  seven days of revenue.
- Empirical 80% ranges, observed holdout coverage, and the strongest numeric
  model contributions for every forecast.
- Tenant-import-aware model runs and campaign predictions with tenant-safe
  composite foreign keys, decimal revenue storage, constraints, and idempotent
  generation. The global aggregate revision remains audit metadata only.
- Automatic generation after completed imports plus an owner/admin retry API.
  Prediction failures never change import success and never remove the last
  successful forecast.
- A responsive Insights route with forecast summary, comparison chart, campaign
  table, freshness states, evaluation evidence, and explicit limitations.

## Prediction Contract

The target is cumulative campaign revenue for the seven days immediately after
the latest warehouse date. A campaign must have at least 56 observed days, and
the organization must have at least 90 calendar days of history. Missing dates
inside eligible campaign histories are represented as zero-activity days.

The Ridge forecast is published even when it performs worse than the naive
previous-week baseline. The UI labels that result and presents both metrics so
the user can judge the evidence rather than receiving a silent substitution.

## Limitations

- Forecasts are associations from historical campaign behavior, not causal
  estimates or budget recommendations.
- Empirical ranges summarize recent holdout errors and are not guarantees.
- Sparse and new campaigns are excluded until they meet the history threshold.
- Model coefficients and reproducibility metadata are stored, but serialized
  Python model artifacts are intentionally not persisted; inference is a batch
  operation that writes complete forecast rows.

## Verification

Coverage includes feature and target construction, minimum history, purged time
splits, prediction bounds, revision idempotency, database tenant constraints,
stale-result retention, API organization isolation, and desktop/mobile Insights
journeys.

## Next

No post-Phase 6 product milestone is currently approved. Phase 4 AWS deployment
remains approved but postponed.
