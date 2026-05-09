# Security Docs

セキュリティ関連文書の入口です。公開前チェックやAPI/DB変更時はここから該当文書を確認します。

## 既存文書

| 文書 | 用途 |
|---|---|
| [`sql-injection-guard.md`](sql-injection-guard.md) | SQL injection guardの方針とallowlist運用 |
| [`secrets-guard.md`](secrets-guard.md) | secrets guardの方針と誤検知対応 |
| [`dependency-policy.md`](dependency-policy.md) | dependency auditと依存更新方針 |
| [`api-input-validation.md`](api-input-validation.md) | API入力検証の方針 |
| [`security-observation-week1.md`](security-observation-week1.md) | セキュリティ観測メモ |
| [`security-observation-week1-report.md`](security-observation-week1-report.md) | セキュリティ観測レポート |

## 現在の公開前注意点

詳細は [`../prelaunch-maintainability-audit.md`](../prelaunch-maintainability-audit.md) を参照してください。

- `npm run security:deps` は成功している
- `npm run security:all` は成功している
- `security/secrets-allowlist.json` は現状空
- `npm run lint` は広範囲のlegacy lint。公開前Web検証では `npm run verify` / `npm run lint:web` を使う

## 作業ルール

- `SUPABASE_SERVICE_ROLE_KEY` はサーバー側だけで使う。クライアントコードに出さない。
- Raw SQLやservice roleを使う変更は、理由と安全性を明文化する。
- AI API、課金webhook、認証、DB migrationを触る場合は、セキュリティ影響を確認する。
- secrets guardの誤検知をallowlistする場合は、理由と期限を残す。
- dependency auditの失敗を無視して公開する場合は、残リスクを [`../maintenance/DECISIONS.md`](../maintenance/DECISIONS.md) に記録する。
