# Release Acceptance Criteria

MERKEN を「公開できる」と判断するための固定基準です。

この文書の目的は、際限なく問題を探し続けないことです。ここにある条件をすべて満たしたら、既知の P1/P2 が残っていても初回一般公開 v1.0 としてリリース可能と判断します。逆に 1 つでも満たせない場合は、公開しません。

## 対象にする公開バージョン

初回一般公開 v1.0 の目的:

- 不特定多数のユーザーが自分で登録できる。
- 主要導線である signup、login、scan、wordbook、quiz、share が本番で動く。
- v1.0 は無料公開版とし、課金導線は `NEXT_PUBLIC_BILLING_ENABLED=false` で隠す。
- ユーザーデータ、secret、AI コストに致命的な事故を起こさない。
- 問題が起きた時、運用者が検知し、影響範囲を見て、rollback できる。

初回一般公開 v1.0 に含めないもの:

- Stripe live 課金の公開
- lint warning 0 件化
- UI の全面改善
- docs の全面整理
- Sentry / Analytics / Speed Insights の完全導入
- すべての P1/P2 の解消
- CI/CD の理想形への作り込み
- Next.js middleware から proxy への移行

これらは公開後タスクにできます。ただし、下の「リリースを止める条件」に該当する場合は公開前対応です。

## リリース判定

次の 7 項目をすべて満たしたら公開可能です。

| No | 項目 | 判定 |
|---:|---|---|
| 1 | 自動検証が通っている | must |
| 2 | Cloud Run scan service が安全に動く | must |
| 3 | Production env がそろっている | must |
| 4 | 本番 smoke test が通っている | must |
| 5 | 課金導線が公開されていない | must |
| 6 | AI コストと abuse の最低限の歯止めがある | must |
| 7 | rollback と日次監視の手順を運用者が実行できる | must |

## 1. 自動検証が通っている

公開直前の commit で次をすべて通します。

```bash
git status --short --branch
git diff --check
npm run verify
npm audit --omit=dev --audit-level=high
npm run security:secrets
```

合格条件:

- `npm run verify` が成功する。
- `npm test` が通常 test 98 ファイルをすべて実行し、538 tests が成功する。
- dependency audit は Web 本体で high / critical 0。
- secrets guard が violations 0。
- lint warning は既存分を許容する。ただし公開直前の warning 数を記録する。

## 2. Cloud Run scan service が安全に動く

Cloud Run scan service は画像スキャンの中核なので、Web 本体とは別に gate します。

```bash
npm test --prefix cloud-run-scan
npm run build --prefix cloud-run-scan
npm audit --prefix cloud-run-scan --omit=dev --audit-level=high
```

合格条件:

- test が成功する。
- build が成功する。
- production dependency の high / critical が 0。
- 本番 Cloud Run に `CLOUD_RUN_AUTH_TOKEN` が設定され、Vercel 側の token と一致している。
- Gemini quota / fallback / timeout の挙動を runbook で追える。

## 3. Production env がそろっている

`docs/ops/production-env-checklist.md` に沿って Vercel Production env を確認します。

v1.0 無料公開で最低限必要な env:

- Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- App URL: `NEXT_PUBLIC_APP_URL=https://www.merken.jp`
- Billing flag: `NEXT_PUBLIC_BILLING_ENABLED=false`
- Auth / email: `RESEND_API_KEY` と Supabase Auth redirect / Site URL
- Cloud Run: `CLOUD_RUN_URL`, `CLOUD_RUN_AUTH_TOKEN`
- Admin / worker: `ADMIN_SECRET`, `INTERNAL_WORKER_TOKEN`
- AI route auth: `REQUIRE_AUTH_TRANSLATE`, `REQUIRE_AUTH_GENERATE_EXAMPLES`, `REQUIRE_AUTH_DICTATION_GRADE`
- AI limits: `ENABLE_AI_USAGE_LIMITS`, `AI_LIMIT_*`
- Cost dashboard: `API_COST_USD_TO_JPY`

v1.0 では不要な env:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID`

合格条件:

- Production に localhost / preview URL / test secret が混ざっていない。
- `NEXT_PUBLIC_` に secret が入っていない。
- Supabase Auth Site URL と redirect allowlist が `https://www.merken.jp` と一致している。
- `.env.example` や docs と本番設定の差分が、意図した差分として説明できる。

## 4. 本番 smoke test が通っている

Production deployment で `https://www.merken.jp` を対象に実施します。

必須導線:

- `/` が表示できる。
- `/signup` で新規メール登録できる。
- OTP メールが届き、認証完了できる。
- `/login` でログインできる。
- 代表画像 1 枚を scan できる。
- scan 結果から wordbook / project が作成される。
- quiz を開始し、少なくとも 1 問回答できる。
- `/shared` が表示できる。
- share URL が開ける。
- `/api/health` が `ok` または理由を説明できる `degraded` を返す。
- `/ops/api-costs` に `ADMIN_SECRET` で入れる。
- `/pricing`, `/subscription`, `/correction`, `/parser` は無料 v1.0 では公開導線にならない。

合格条件:

- 主要導線で 500、無限 redirect、白画面がない。
- scan 失敗時にユーザーへ失敗が伝わる。
- 他ユーザーの private project を直接 URL で読めない。
- build log に出る既知 warning は説明できる。未知の env / auth / migration error は残さない。

## 5. 課金導線が公開されていない

v1.0 は無料公開なので、Stripe live 動作確認は公開条件にしません。代わりに、課金導線が外から使えないことを条件にします。

合格条件:

- `NEXT_PUBLIC_BILLING_ENABLED=false` が Production に設定されている。
- `/pricing` と `/subscription` は `/` へ redirect される。
- `/correction` と `/parser` は課金前提機能として `/` へ redirect される。
- Pro upgrade CTA は主要 UI に表示されない。
- `/api/subscription/create` は billing disabled の時に 404 を返す。
- Stripe test key を Production に入れない。

Stripe 課金を公開する時は、この項目を「Stripe live checkout / webhook / reconcile / Pro 反映が確認済み」に差し替え、`docs/ops/billing-stripe-failure-runbook.md` を使って別リリース gate を作ります。

## 6. AI コストと abuse の最低限の歯止めがある

公開時点で完璧な bot 対策は要求しません。ただし、コストが青天井になる状態では出しません。

合格条件:

- 高コスト AI route は認証必須になっている。
- `ENABLE_AI_USAGE_LIMITS` が有効。
- 日次 feature usage limit が本番で効く。
- `/ops/api-costs` で provider / model / operation / status / cost を確認できる。
- Cloud Run fallback の cost cap または停止手段を説明できる。
- `/api/generate-examples` は Cloud Run aware な `generateExampleSentences` 経由で動き、古い direct OpenAI key 判定に依存しない。

## 7. rollback と日次監視の手順を運用者が実行できる

公開後に問題が起きる前提で、戻せることを条件にします。

合格条件:

- 現在の production commit SHA を記録している。
- Vercel rollback または revert commit の手順を説明できる。
- rollback 後に見る導線を 5 分以内に実行できる。
- `docs/ops/production-operations-handbook.md` の毎日 5 分確認を実行できる。
- Vercel Runtime Logs、Cloud Run Logs、Supabase Logs の場所を開ける。
- P0 / P1 / P2 の切り分け基準を説明できる。

## リリースを止める条件

次のどれかに当てはまる場合は、他が通っていても公開しません。

- `npm run verify` が失敗している。
- Web 本体または Cloud Run production dependency に high / critical がある。
- Production env が未確認。
- Supabase service role key、AI provider key、Cloud Run token、`ADMIN_SECRET` などの secret 漏えい疑いがある。
- signup / login / scan / quiz のどれかが本番で成立しない。
- 課金導線が表示されている、または billing disabled 時に subscription API が使える。
- AI usage limit が無効、または高コスト route が未認証で公開されている。
- 他ユーザーの private data を読める疑いがある。
- rollback 手順が説明できない。

## 公開後に回してよいもの

次は公開停止条件ではありません。

- lint warning の既存分
- middleware から proxy への移行
- Sentry / Analytics / Speed Insights の導入
- Log Drains の導入
- `/shared` の build-time fetch 改善。ただし本番で runtime 表示が動くことは確認する。
- docs の重複整理
- UI 文言、余白、細かい導線改善
- IP rate limit / WAF の強化。ただし認証と usage limit は必須。
- Stripe live 課金の公開準備

## 現時点の最短リリース条件

2026-06-13 時点で、リリース判断は次に固定します。

1. `cloud-run-scan` の production dependency audit が high / critical 0。
2. Vercel Production env が無料公開 v1.0 の構成でそろっている。
3. `/api/generate-examples` が Cloud Run-aware 実装に修正済み。
4. `NEXT_PUBLIC_BILLING_ENABLED=false` により、課金導線が外から使えない。
5. 現在の commit を本番へ deploy し、`https://www.merken.jp` で smoke test を通す。
6. rollback と日次監視の手順を運用者が説明できる。

この 6 つが終わり、この文書の 7 項目がすべて yes になったら、残りは公開後の運用タスクとして扱います。
