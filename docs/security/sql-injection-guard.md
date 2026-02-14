# SQL Injection Guard

## Purpose
This repository enforces a SQL injection guard for application code under `src/` and `shared/`.
The goal is to block accidental reintroduction of raw SQL patterns during local development and CI.

## Commands
Run the guard directly:

```bash
npm run security:sql
```

Run full lint (guard runs first):

```bash
npm run lint
```

Run guard tests:

```bash
npm run test:security:sql
```

## Enforced Rules
- `SQL001`: forbid unsafe raw APIs (`queryRawUnsafe`, `executeRawUnsafe`, including `$queryRawUnsafe` / `$executeRawUnsafe`)
- `SQL002`: forbid SQL template interpolation (`SELECT/INSERT/UPDATE/DELETE` with `${...}`)
- `SQL003`: forbid SQL string concatenation with `+`
- `SQL004`: forbid raw SQL passed directly as first arg to `.query(...)`

Guard output format:

```text
RULE_ID file:line:column message
```

## Scope and Exclusions
The guard scans only:
- `src/**/*.ts,tsx,js,jsx,mjs,cjs`
- `shared/**/*.ts,tsx,js,jsx,mjs,cjs`

The following top-level directories are excluded:
- `node_modules`
- `.next`
- `vocabularytest`
- `vocabularytest-clone`
- `mobile`
- `cloud-run-scan`
- `supabase/migrations`

## Exception Flow (Allowlist)
Exceptions must be declared in:

`security/sql-allowlist.json`

Required fields per entry:
- `path`
- `rule`
- `reason`
- `expires_on` (`YYYY-MM-DD`)

Example:

```json
{
  "entries": [
    {
      "path": "src/example.ts",
      "rule": "SQL001",
      "reason": "temporary legacy migration path",
      "expires_on": "2026-12-31"
    }
  ]
}
```

Matching is exact by `path + rule`.

## Fail-Closed Behavior
- Invalid allowlist JSON causes failure.
- Missing required fields cause failure.
- Unknown rule IDs cause failure.
- Expired `expires_on` entries cause failure.

## Review Checklist for New Exceptions
1. Confirm there is no safer query builder or RPC alternative.
2. Add a concrete business reason in `reason`.
3. Set a short expiration date.
4. Create a follow-up task to remove the exception.
