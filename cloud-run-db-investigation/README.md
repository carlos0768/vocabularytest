# Cloud Run DB Investigation Service

Security-first, stateless investigation pipeline focused only on DB-related code changes and estimating IO budget exhaustion risk.

## Scope
- Input: PR/commit change metadata from GitHub webhook or GitHub Actions.
- Trigger: Runs assessment only when DB-related rules match (`src/rules/db-rules.ts`).
- Output: Structured result suitable for Notion database `DB調査`.

## API
- `GET /health`
- `POST /investigate` (requires `Authorization: Bearer <WEBHOOK_AUTH_TOKEN>`)

Request body:
```json
{
  "repository": "owner/repo",
  "prNumber": 123,
  "prUrl": "https://github.com/owner/repo/pull/123",
  "commitSha": "abcdef",
  "source": "github-actions",
  "changedFiles": [
    {
      "path": "supabase/migrations/20260321000100_add_index.sql",
      "changeType": "modified",
      "patch": "create index idx_words_term on words(term);"
    }
  ]
}
```

## Required Environment Variables
- `WEBHOOK_AUTH_TOKEN` (required)
- `INVESTIGATION_PROVIDER` (`heuristic` default, or `openai-compatible`)
- `NOTION_API_KEY` (optional, required to write results)
- `NOTION_DATABASE_ID` (optional, required to write results)

OpenAI-compatible provider (uses standard OpenAI API format):
- `OPENAI_COMPATIBLE_ENDPOINT` - e.g., `https://api.openai.com/v1` or your proxy
- `OPENAI_COMPATIBLE_API_KEY`
- `OPENAI_COMPATIBLE_MODEL` (default: `gpt-4o`)

Legacy compatibility: `KIMI_ENDPOINT`, `KIMI_API_KEY`, `KIMI_MODEL` are also supported as fallbacks.

## Notion Mapping (`DB調査`)
Expected property names in the Notion database:
- `Name` (title)
- `Repository` (rich_text)
- `PR` (number)
- `CommitSHA` (rich_text)
- `Source` (select)
- `TriggeredAt` (date)
- `RiskLevel` (select)
- `RiskScore` (number)
- `IOBudgetExhaustionRisk` (number)
- `Provider` (select)
- `Summary` (rich_text)
- `DBChangedFiles` (number)
- `ChangedFiles` (number)
- `PRUrl` (url)
- `RuleMatches` (rich_text)
- `Recommendations` (rich_text)

Note: Assessment summary, factors, and recommendations are written in Japanese when using the `openai-compatible` provider.

## Security Notes
- Service is stateless and performs no filesystem writes.
- Endpoint access is blocked unless bearer token matches `WEBHOOK_AUTH_TOKEN`.
- Input is schema-validated and size-limited (`changedFiles <= 500`, body limit 2MB).
- Principle of least privilege:
  - Cloud Run runtime service account should only have:
    - Secret Manager accessor to specific secrets used by this service.
    - Cloud Logging write (default).
  - Do not grant GitHub/Supabase/Vercel mutating permissions.
- Notion key should only be granted access to `DB調査` database.
- Prefer private ingress + authenticated caller (GitHub OIDC proxy/service account) in production; bearer token is baseline control for MVP.

## Local Commands
```bash
npm ci
npm run test
npm run build
npm run dev
```
