# Agent Center DB Repository Spec

## Purpose

Agent Center V1 is production-smoked with a persistence abstraction and a file-backed bridge. Before real merchant pilots, Agent Center needs durable database persistence because the workflow is multi-step, auditable, and expected to survive serverless instance churn.

Durable DB persistence is required so:

- detected issues survive redeploys and serverless cold starts
- resolution plans survive approval, apply, retest, and review workflows
- usage events remain auditable and idempotent
- production validation reports can be shared and revisited
- retest and before/after verification history is durable
- internal demo fixture cleanup and production validation cleanup work across invocations

This spec defines the recommended DB-backed `AgentCenterRepository` implementation for merchant pilot readiness. It does not change merchant-facing semantics and does not introduce payment, PSP, order write-back, refunds, settlement, or real billing.

## Current State

Current repository implementations:

- `InMemoryAgentCenterRepository`
  - default local/test backend
  - process-local
  - fast and deterministic for tests
  - not durable across process restart, deploy, or serverless instance routing

- `FileBackedAgentCenterRepository`
  - bridge backend behind `AGENT_CENTER_STATE_BACKEND=persistent`
  - stores full `AgentCenterState` JSON at `AGENT_CENTER_STATE_FILE`
  - passed controlled production smoke using `/tmp/pivota-agent-center-state.json`
  - not a durable multi-instance production database

Current env config:

```bash
AGENT_CENTER_STATE_BACKEND=memory
AGENT_CENTER_STATE_BACKEND=persistent
AGENT_CENTER_STATE_FILE=/tmp/pivota-agent-center-state.json
```

File-backed limitations on Vercel:

- `/tmp` is instance-local and not a shared durable store.
- Traffic can route to different serverless instances.
- Files may not survive redeploys, region routing, or instance replacement.
- It can validate repository semantics in a controlled smoke, but it is not suitable as the source of truth for merchant pilots.

## Recommended DB Options

### Postgres / Neon

Pros:

- Postgres-compatible SQL and JSONB support.
- Good fit for mixed relational keys plus flexible agent payloads.
- Strong uniqueness constraints for usage idempotency.
- Works well with staged schema migration.
- Managed serverless Postgres options are mature.

Cons:

- Requires connection pooling or serverless-friendly driver configuration.
- Needs migration management.

### Supabase Postgres

Pros:

- Postgres-compatible.
- Built-in dashboard, SQL editor, and row-level security options.
- Easy staging/prod project split.

Cons:

- App must still manage service-role access carefully.
- Realtime/auth features are not needed for this V1 repository.

### Vercel Postgres If Available

Pros:

- Good operational fit if provisioned in the same Vercel project/team.
- Simple env integration when available.
- Postgres-compatible patterns apply.

Cons:

- Availability depends on current Vercel product/project setup.
- This repo currently has no configured Vercel Postgres client or DB env.

### Vercel KV

Pros:

- Useful for limited key-value caching.
- Can work for small ephemeral lookup/state needs.

Cons:

- Not ideal for full Agent Center relational state.
- Harder to enforce relational constraints.
- Harder to query by merchant, store, issue, scan target, provider, status, and created time.
- Not recommended as the primary repository for pilot readiness.

Recommendation: use a Postgres-compatible database for V1 pilot readiness.

## Table Schema Plan

Use one table per core Agent Center record family. Store stable query fields as typed columns and keep the full domain object in `payload JSONB`. This preserves current V1 flexibility while enabling indexes, cleanup, audit, and future migrations.

Common column conventions:

- `id TEXT PRIMARY KEY`
- `merchant_id TEXT`
- `store_id TEXT`
- `scan_target_id TEXT`
- `issue_id TEXT`
- `product_entity_id TEXT`
- `status TEXT`
- `payload JSONB NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL`
- `deleted_at TIMESTAMPTZ`

### `agent_center_merchant_stores`

- Primary key: `id`
- Columns:
  - `id TEXT PRIMARY KEY`
  - `merchant_id TEXT NOT NULL`
  - `store_id TEXT GENERATED OR SAME AS id` optional if useful
  - `status TEXT` from integration status
  - `payload JSONB NOT NULL`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`
  - `deleted_at TIMESTAMPTZ`

### `agent_center_scan_targets`

- Primary key: `id`
- Columns:
  - `id TEXT PRIMARY KEY`
  - `merchant_id TEXT NOT NULL`
  - `store_id TEXT NOT NULL`
  - `scan_mode TEXT`
  - `status TEXT`
  - `payload JSONB NOT NULL`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`
  - `deleted_at TIMESTAMPTZ`

### `agent_center_issues`

- Primary key: `id`
- Columns:
  - `id TEXT PRIMARY KEY`
  - `merchant_id TEXT NOT NULL`
  - `store_id TEXT NOT NULL`
  - `scan_target_id TEXT NOT NULL`
  - `issue_type TEXT NOT NULL`
  - `severity TEXT`
  - `status TEXT NOT NULL`
  - `product_entity_id TEXT`
  - `payload JSONB NOT NULL`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`
  - `deleted_at TIMESTAMPTZ`

### `agent_center_product_understanding_diagnoses`

- Primary key: `id`
- Columns:
  - `id TEXT PRIMARY KEY`
  - `merchant_id TEXT NOT NULL`
  - `store_id TEXT NOT NULL`
  - `scan_target_id TEXT`
  - `issue_id TEXT NOT NULL`
  - `product_entity_id TEXT`
  - `status TEXT`
  - `payload JSONB NOT NULL`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`
  - `deleted_at TIMESTAMPTZ`

### `agent_center_offer_execution_diagnoses`

- Primary key: `id`
- Columns:
  - `id TEXT PRIMARY KEY`
  - `merchant_id TEXT NOT NULL`
  - `store_id TEXT NOT NULL`
  - `issue_id TEXT NOT NULL`
  - `product_entity_id TEXT`
  - `status TEXT`
  - `payload JSONB NOT NULL`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`
  - `deleted_at TIMESTAMPTZ`

### `agent_center_checkout_verification_diagnoses`

- Primary key: `id`
- Columns:
  - `id TEXT PRIMARY KEY`
  - `merchant_id TEXT NOT NULL`
  - `store_id TEXT NOT NULL`
  - `issue_id TEXT NOT NULL`
  - `product_entity_id TEXT`
  - `status TEXT`
  - `payload JSONB NOT NULL`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`
  - `deleted_at TIMESTAMPTZ`

### `agent_center_gmv_assurance_snapshots`

- Primary key: `id`
- Columns:
  - `id TEXT PRIMARY KEY`
  - `merchant_id TEXT NOT NULL`
  - `store_id TEXT NOT NULL`
  - `scan_target_id TEXT`
  - `product_entity_id TEXT`
  - `readiness_level TEXT`
  - `status TEXT`
  - `payload JSONB NOT NULL`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`
  - `deleted_at TIMESTAMPTZ`

### `agent_center_issue_resolution_plans`

- Primary key: `id`
- Columns:
  - `id TEXT PRIMARY KEY`
  - `issue_id TEXT NOT NULL`
  - `merchant_id TEXT NOT NULL`
  - `store_id TEXT NOT NULL`
  - `scan_target_id TEXT`
  - `blocker_type TEXT`
  - `source_agent TEXT`
  - `status TEXT NOT NULL`
  - `owner_type TEXT`
  - `payload JSONB NOT NULL`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`
  - `deleted_at TIMESTAMPTZ`

### `agent_center_usage_events`

- Primary key: `id`
- Columns:
  - `id TEXT PRIMARY KEY`
  - `idempotency_key TEXT NOT NULL`
  - `merchant_id TEXT NOT NULL`
  - `store_id TEXT`
  - `scan_target_id TEXT`
  - `issue_id TEXT`
  - `agent_type TEXT NOT NULL`
  - `workflow_type TEXT`
  - `event_type TEXT NOT NULL`
  - `provider TEXT`
  - `scan_mode TEXT`
  - `billing_mode TEXT NOT NULL DEFAULT 'preview_only'`
  - `billing_status TEXT NOT NULL DEFAULT 'not_invoiced'`
  - `quantity NUMERIC NOT NULL DEFAULT 1`
  - `status TEXT`
  - `payload JSONB NOT NULL`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`
  - `deleted_at TIMESTAMPTZ`

### `agent_center_production_validation_runs`

- Primary key: `id`
- Columns:
  - `id TEXT PRIMARY KEY`
  - `status TEXT NOT NULL`
  - `environment TEXT`
  - `merchant_id TEXT`
  - `store_id TEXT`
  - `scan_target_id TEXT`
  - `product_entity_id TEXT`
  - `payload JSONB NOT NULL`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`
  - `completed_at TIMESTAMPTZ`
  - `deleted_at TIMESTAMPTZ`

### `agent_center_demo_fixtures`

- Primary key: `id`
- Columns:
  - `id TEXT PRIMARY KEY`
  - `fixture_id TEXT NOT NULL`
  - `preset TEXT`
  - `environment TEXT`
  - `cleanup_status TEXT NOT NULL`
  - `status TEXT`
  - `payload JSONB NOT NULL`
  - `created_at TIMESTAMPTZ NOT NULL`
  - `updated_at TIMESTAMPTZ NOT NULL`
  - `expires_at TIMESTAMPTZ`
  - `deleted_at TIMESTAMPTZ`

## Indexes and Constraints

Recommended indexes:

- `merchant_id`
- `store_id`
- `scan_target_id`
- `issue_id`
- `fixture_id`
- `production_validation_run_id` where present or represented in payload/query column
- `product_entity_id`
- `agent_type`
- `provider`
- `status`
- `created_at`
- compound `merchant_id, created_at DESC`
- compound `store_id, created_at DESC`
- compound `scan_target_id, created_at DESC`
- compound `issue_id, created_at DESC`

Required constraints:

- unique `agent_center_usage_events.idempotency_key`
- check `billing_mode = 'preview_only'` for V1 usage events if real billing is not implemented
- check `billing_status = 'not_invoiced'` for V1 usage events if real billing is not implemented

Optional constraints:

- unique active issue resolution plan per `issue_id`
  - Example partial index: unique on `issue_id` where `deleted_at IS NULL` and `status NOT IN ('rejected', 'ignored')`
  - Use only if one-active-plan semantics are desired.

## Repository Mapping

`AgentCenterRepository` methods should map to SQL operations as follows.

### `getById(collection, id)`

SQL:

```sql
SELECT payload
FROM <table>
WHERE id = $1
  AND deleted_at IS NULL
LIMIT 1;
```

For demo fixtures, `getById("demoFixtures", fixtureId)` should also support `fixture_id = $1`.

### `list(collection)`

SQL:

```sql
SELECT payload
FROM <table>
WHERE deleted_at IS NULL
ORDER BY created_at ASC;
```

Use pagination before merchant pilot volume grows.

### `upsert(collection, record)`

SQL:

```sql
INSERT INTO <table> (id, ..., payload, created_at, updated_at)
VALUES ($1, ..., $payload, $created_at, $updated_at)
ON CONFLICT (id)
DO UPDATE SET
  payload = EXCLUDED.payload,
  updated_at = EXCLUDED.updated_at,
  status = EXCLUDED.status;
```

For usage events, use `ON CONFLICT (idempotency_key) DO NOTHING` or return the existing row. This preserves deterministic idempotency.

### `deleteById(collection, id)`

Prefer soft delete for audit-sensitive records:

```sql
UPDATE <table>
SET deleted_at = now(),
    updated_at = now(),
    status = COALESCE(status, 'deleted')
WHERE id = $1;
```

Hard delete can be used only for internal demo fixture temporary state if compliance requirements allow it.

### `usageEventsBy(filters)`

SQL:

```sql
SELECT payload
FROM agent_center_usage_events
WHERE deleted_at IS NULL
  AND ($1::text IS NULL OR merchant_id = $1)
  AND ($2::text IS NULL OR store_id = $2)
  AND ($3::text IS NULL OR agent_type = $3)
  AND ($4::text IS NULL OR provider = $4)
ORDER BY created_at ASC;
```

### `snapshotsBy(filters)`

SQL:

```sql
SELECT payload
FROM agent_center_gmv_assurance_snapshots
WHERE deleted_at IS NULL
  AND ($1::text IS NULL OR merchant_id = $1)
  AND ($2::text IS NULL OR store_id = $2)
  AND ($3::text IS NULL OR product_entity_id = $3)
ORDER BY created_at DESC;
```

### Query Helpers

Map helper methods directly to typed indexed columns:

- `byMerchantId(collection, merchantId)` -> `WHERE merchant_id = $1`
- `byStoreId(collection, storeId)` -> `WHERE store_id = $1`
- `byScanTargetId(collection, scanTargetId)` -> `WHERE scan_target_id = $1`
- `byIssueId(collection, issueId)` -> `WHERE issue_id = $1`
- `byFixtureId(collection, fixtureId)` -> `WHERE fixture_id = $1` or JSONB containment if the table does not have a typed fixture column
- `byProductionValidationRunId(collection, runId)` -> typed `production_validation_run_id` when added, or relationship lookup through `agent_center_production_validation_runs.payload`

## Migration Phases

### Phase 1: Schema And Adapter Behind Env Flag

- Add DB schema migrations.
- Add `DbAgentCenterRepository`.
- Gate with `AGENT_CENTER_STATE_BACKEND=db`.
- Keep `memory` as default local/test backend.
- Keep `file` available as fallback bridge.

### Phase 2: Repository Contract Tests

- Run the same repository contract tests against:
  - memory
  - file
  - DB
- Cover CRUD, query helpers, usage idempotency, production validation lifecycle, fixture cleanup, and resolution plan cleanup.

### Phase 3: Staging Internal Validation On DB

- Enable DB backend in staging.
- Run internal demo fixtures.
- Run real production validation payloads against staging.
- Confirm issue, plan, usage, snapshot, and cleanup durability across multiple requests.

### Phase 4: Production Internal Validation On DB

- Enable DB backend for internal production validation only.
- Keep merchant UI unchanged.
- Run Isntree-style real validation and controlled fixture validation.
- Confirm deletion/cleanup, retest history, and usage audit rows.

### Phase 5: Merchant Pilot

- Enable Agent Center DB persistence for selected pilot merchants.
- Keep all usage `preview_only` / `not_invoiced`.
- Share validation reports and issue resolution plans with pilot operators.
- Monitor query performance and schema gaps before broad rollout.

## Env Config

Proposed production-ready config:

```bash
AGENT_CENTER_STATE_BACKEND=memory
AGENT_CENTER_STATE_BACKEND=file
AGENT_CENTER_STATE_BACKEND=db

AGENT_CENTER_STATE_FILE=/tmp/pivota-agent-center-state.json
AGENT_CENTER_DATABASE_URL=postgres://...
AGENT_CENTER_DB_SSL=true
AGENT_CENTER_DB_SCHEMA=agent_center
```

Notes:

- Rename current `persistent` backend option to `file` or keep `persistent` as a backward-compatible alias for file-backed bridge.
- `AGENT_CENTER_STATE_BACKEND=db` should be the only durable pilot backend.
- Use `AGENT_CENTER_DB_SCHEMA=agent_center` if the shared database has other app tables.

## Backfill And Export

File-backed export:

- Read JSON from `AGENT_CENTER_STATE_FILE`.
- Validate it against current `AgentCenterState` shape.
- Insert core records into DB tables using repository `upsert`.

Import guidance:

- Useful for dev/staging smoke data.
- Not required for merchant production if no real pilots exist yet.
- Production pilot should start on DB-backed persistence from day one.

Backfill order:

1. merchant stores
2. scan targets
3. issues
4. diagnoses
5. resolution plans
6. snapshots
7. production validation runs
8. demo fixtures
9. usage events

Usage events should preserve original IDs and idempotency keys.

## Rollback Plan

If DB-backed repository has an issue:

1. Switch `AGENT_CENTER_STATE_BACKEND` back to `file` or `memory`.
2. Keep DB writes disabled.
3. Preserve an export of DB state before rollback.
4. Keep internal routes gated.
5. Do not expose partially migrated state to merchants.
6. Re-run repository contract tests before re-enabling DB.

Rollback should not introduce billing behavior. Usage remains preview-only and not invoiced.

## Security And Privacy

Rules:

- Internal production validation and demo fixture routes remain gated.
- Usage remains `preview_only` / `not_invoiced`.
- Merchant UI shows AI credits and usage, not token-level provider costs.
- No real billing, invoice, subscription, PSP, payment, order write-back, refund, settlement, or transaction-fee state is introduced.
- Do not store API keys, internal secrets, checkout credentials, PSP tokens, or merchant platform secrets in `payload JSONB`.
- Redact raw provider outputs if they include sensitive merchant data or user-provided private text.
- Prefer storing normalized findings, recommendations, and references over raw full transcripts when possible.
- Restrict DB service credentials to server-side runtime only.

## Validation Commands

```bash
npm run test:agent-center
npm run lint
npm run build
```

DB implementation should add a separate opt-in integration command, for example:

```bash
AGENT_CENTER_STATE_BACKEND=db npm run test:agent-center
```

## Follow-Up Implementation Tasks

Recommended next implementation tasks:

1. Choose Postgres provider and provision staging/prod databases.
2. Add DB dependency and connection helper.
3. Add schema migration files for the tables above.
4. Add `DbAgentCenterRepository`.
5. Update backend config to support `memory | file | db`.
6. Add repository contract test runner shared across memory, file, and DB backends.
7. Add DB-specific tests for usage idempotency constraints.
8. Add export/import script from file-backed JSON to DB.
9. Enable DB backend in staging internal validation.
10. Run production internal validation on DB before merchant pilot.

No DB adapter is implemented in this milestone because the repo does not currently have a configured database client or database environment.
