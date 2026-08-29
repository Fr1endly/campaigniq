# Milestone 5: Advanced SQL and Warehouse Operations

**Completed:** August 29, 2026

**Scope:** Observable incremental loading, product-facing window queries,
measured materialized aggregation, refresh operations, and tenant-scoped
warehouse status.

## Delivered

- Fact-level inserted, updated, and unchanged counts for every new completed
  import. Exact no-op facts retain their original import provenance and avoid a
  physical update.
- Organization-scoped ETL advisory locks so concurrent loads cannot invalidate
  incremental classification.
- Seven-day rolling revenue and spend averages built from a zero-filled date
  spine, plus current/prior revenue ranks and movement for campaign momentum.
- Warehouse freshness, volume, 30-day quality, success rate, duration, and
  throughput reporting on the Imports screen.
- PostgreSQL readiness reporting separate from the API liveness endpoint.
- A materialized organization/day aggregate with revision-based freshness,
  concurrent refresh, base-fact fallback, and administrator retry.

## Aggregate Measurement

`npm run db:benchmark` creates rollback-only synthetic data, runs five warm
`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)` samples, measures concurrent refresh,
prints JSON, and removes the benchmark schema with the transaction rollback.

The adoption thresholds were live-query p95 above 150 ms, at least 3x query
speedup, and refresh below 5 seconds at one million facts.

|     Facts |  Live p95 | Aggregate p95 | Speedup |  Rank p95 | Refresh |
| --------: | --------: | ------------: | ------: | --------: | ------: |
|   100,000 | 14,546 ms |       46.8 ms |  310.8x |  3,044 ms |  214 ms |
| 1,000,000 |  7,894 ms |       11.6 ms |  682.6x | 45,304 ms |  930 ms |

Environment: PostgreSQL 17.11 in the local Docker runtime on a four-thread
Intel Core i5-7360U host with 8 GB memory. Absolute timings are machine-specific;
the relative result cleared every approved threshold, so the daily materialized
aggregate was adopted for overview totals and trends.

Campaign ranking remains a live fact query because an organization/day aggregate
cannot preserve campaign-level dimensions. It is acceptable for the current
2,160-fact demo dataset, but the benchmark identifies it as the next aggregate
candidate before operating near one million facts.

## Refresh and Failure Behavior

Each committed import increments a warehouse data revision and marks reporting
stale in the same transaction. The ETL then serializes concurrent refreshes with
a PostgreSQL advisory lock and refreshes the materialized view concurrently.
Analytics uses the aggregate only when its refreshed revision equals the data
revision; stale, refreshing, or failed state automatically reads base facts.

Refresh failure never changes a completed import into a failed import. Owners and
administrators can retry from Imports, while all members retain current analytics
through the live-query fallback.

## Verification

Coverage includes mixed insert/update/no-op ETL imports, preserved provenance,
refresh revision reconciliation, stale and current analytics equivalence,
rolling windows, rank movement, tenant-scoped warehouse status, and desktop and
mobile product journeys.

## Next

Phase 6 establishes a defensible predictive target, baseline evaluation, stored
model metadata and predictions, and an interpretable Insights product surface.
Phase 4 AWS deployment remains approved but postponed.
