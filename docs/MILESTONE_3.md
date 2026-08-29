# Milestone 3: Import Product Experience

**Completed:** August 29, 2026

**Scope:** Organization-isolated import APIs, direct local object-storage uploads,
asynchronous ETL processing, import history, and data-quality reporting.

## Delivered

- MinIO in Docker Compose as the local S3-compatible raw-file store, including a
  durable volume, health check, bucket initialization, and browser CORS origin.
- Presigned `PUT` uploads that send CSV bytes directly from the browser to object
  storage instead of proxying them through NestJS.
- Authenticated import create, list, detail, process, and issue-report endpoints.
- Organization ownership derived only from the Better Auth session for every
  import operation and object key.
- An asynchronous local processing handoff that verifies the uploaded object,
  downloads it to an isolated temporary path, invokes the existing Python ETL by
  import-run ID, and removes the temporary file.
- Imports UI with file validation, drag/drop selection, upload progress, live ETL
  polling, terminal results, filtering, pagination, and failure details.
- Data Quality UI with import selection in URL state, valid-record percentage,
  loaded/rejected proportions, and issue counts grouped by rule and field.
- Route invalidation after terminal processing so import reporting and previously
  loaded analytics data are refreshed after a successful load.

## Local Flow

```text
Browser POST /api/imports
  -> NestJS creates an uploading import run and signs a tenant-scoped object key
  -> Browser PUTs the CSV directly to MinIO
  -> Browser POSTs /api/imports/:id/process
  -> NestJS verifies the object and dispatches the Python ETL
  -> Python validates, loads, and finalizes import metadata transactionally
  -> Browser polls /api/imports/:id until completed or failed
```

The explicit process call is the local orchestration boundary. Phase 4 replaces
that handoff with an S3 event and Lambda while preserving the import and ETL
contracts.

## Data and Tenant Behavior

- Raw object keys are namespaced as `raw/<organization>/<import>/<filename>`.
- Import lookup, history, processing, and issue reports require both the import ID
  and the session-resolved organization ID.
- The process endpoint does not accept organization IDs and verifies object size
  before dispatch.
- Completed imports remain idempotent; processing imports reject concurrent starts;
  failed imports can be retried against the retained raw object.
- Row and issue totals are read from the Python ETL's existing transactional import
  metadata.

## Verification

Coverage includes API service integration tests for organization isolation and
issue reconciliation, formatter unit tests, and Playwright desktop/mobile coverage
for a real presigned upload through completion and quality inspection.

## Next

Phase 4 moves object storage and processing to AWS S3 and Lambda, PostgreSQL to
RDS, and adds reproducible CloudFormation, least-privilege IAM, and monitoring.
