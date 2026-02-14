# Dependency Security Policy

## Enforcement
Dependency risk is enforced by:
- `/Users/haradakarurosukei/Desktop/Working/englishvo/scripts/check-deps-audit.mjs`
- npm script: `npm run security:deps`
- CI workflow: `/Users/haradakarurosukei/Desktop/Working/englishvo/.github/workflows/security.yml`

## Severity Threshold
`high` and `critical` vulnerabilities fail checks immediately.

Implementation command:

```bash
npm audit --omit=dev --audit-level=high --json
```

## Update Policy
1. Fix all `high`/`critical` findings immediately.
2. Prefer patch/minor upgrades in the same PR.
3. Major upgrades are handled in a separate PR when risk of behavior change is high.

## Operational Notes
1. Security checks run in CI on `push` and `pull_request`.
2. Local verification:

```bash
npm run security:deps
```
