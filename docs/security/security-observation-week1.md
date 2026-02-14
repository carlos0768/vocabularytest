# Security Observation Week 1 Runbook

## Goal
Observe security guard behavior from 2026-02-14 to 2026-02-21 and capture daily evidence for:
- false positives
- operational cost
- missed detection risk

This phase is observation-only. Guard rule changes are handled in a separate task.

## Commands
Local daily run:

```bash
npm run security:observe
```

CI daily run:

```bash
npm run security:observe:ci
```

Weekly summary:

```bash
npm run security:observe:summary
```

## Output Files
Daily output directory:

```text
coverage/security-observation/YYYY-MM-DD/
```

Daily files:
- `result.json`
- `security-all.stdout.log`
- `security-all.stderr.log`
- `test-security.stdout.log`
- `test-security.stderr.log`

Weekly report:
- `/Users/haradakarurosukei/Desktop/Working/englishvo/docs/security/security-observation-week1-report.md`

## Triage Priority
- `P0`: `security:deps` high/critical detected
- `P1`: new `security:sql` or `security:secrets` violation
- `P2`: `test:security` failure (excluding known flake)

## Failure Triage Order
1. Check `result.json` for failing command and metrics.
2. Open the matching `*.stderr.log` and `*.stdout.log`.
3. Re-run only failed command locally:
   - `npm run security:all`
   - `npm run test:security`
4. Classify the failure:
   - real finding
   - false positive
   - infrastructure/transient

## Exception Ticket Template
Use this template when an allowlist exception may be needed:

```text
Title: [Security Exception] <rule> <path>

Date:
Rule:
File path:
Reason:
Risk assessment:
Temporary mitigation:
Expiration date (YYYY-MM-DD):
Owner:
```

## Completion Criteria
1. At least 7 daily `result.json` files exist for 2026-02-14..2026-02-21.
2. Every day has restorable stdout/stderr logs for both observed commands.
3. `security-observation-week1-report.md` is generated.
4. Next-week prioritized actions are documented in the weekly report.
