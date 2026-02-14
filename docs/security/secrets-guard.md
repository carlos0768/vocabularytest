# Secrets Guard

## Purpose
Prevent accidental commit of secrets into tracked files.

## Commands
Run guard:

```bash
npm run security:secrets
```

Run tests:

```bash
npm run test:security:secrets
```

## Scope
The guard scans only tracked files from `git ls-files`.

Excluded top-level paths:
- `node_modules`
- `.next`
- `vocabularytest`
- `vocabularytest-clone`
- `mobile`
- `cloud-run-scan`

## Rules
- `SECRET001`: API key / secret literal pattern
- `SECRET002`: long secret-like assignment pattern
- `SECRET003`: private key block pattern

Output format:

```text
RULE_ID file:line:column message
```

## Allowlist
Path: `/Users/haradakarurosukei/Desktop/Working/englishvo/security/secrets-allowlist.json`

Required fields:
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
      "rule": "SECRET001",
      "reason": "temporary migration path",
      "expires_on": "2026-12-31"
    }
  ]
}
```

Matching is exact by `path + rule`.

## Fail-Closed Behavior
1. Invalid allowlist JSON fails.
2. Missing required fields fail.
3. Unknown `rule` values fail.
4. Expired `expires_on` entries fail.

## Placeholder Handling
Template placeholders like `your-xxx` and example values in `.env.example` are excluded from detection.
