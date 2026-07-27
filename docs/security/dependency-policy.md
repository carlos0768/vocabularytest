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
4. When no fixed release exists upstream, record a time-boxed exception in the allowlist instead of lowering the threshold.

## Allowlist
Path: `security/deps-audit-allowlist.json`

```json
{
  "entries": [
    {
      "package": "postcss",
      "advisory": "GHSA-xxxx-xxxx-xxxx",
      "reason": "なぜ許容できるのか / いつ解消できるのか",
      "expires_on": "2026-10-31"
    }
  ]
}
```

Rules:
- One entry per advisory (`package` + GHSA id). All four fields are required.
- A finding is suppressed **only when every advisory behind that package is allowlisted**, so a newly published advisory on an allowlisted package still fails the check.
- A package that is vulnerable only through a dependency (npm audit reports `via: ["other-package"]`) can never be allowlisted -- allowlist the root-cause package instead.
- `expires_on` is `YYYY-MM-DD`. An expired entry is a configuration error and fails the check, so exceptions cannot rot silently.

Current entries: `postcss` (`next` が同梱、修正版が未リリース。`npm audit` の `fixAvailable` は `next` のメジャーダウングレードのみ)。postcss の修正版が出たら bump してエントリを削除する。

## Operational Notes
1. Security checks run in CI on `push` and `pull_request`.
2. Local verification:

```bash
npm run security:deps
```
