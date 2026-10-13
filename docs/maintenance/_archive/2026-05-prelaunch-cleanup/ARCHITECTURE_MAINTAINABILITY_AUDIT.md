# Architecture Maintainability Audit

作成日: 2026-05-07

目的: P2-Aとして、公開後にAIと人間が安全に変更を続けられるよう、API route / repository / 巨大ファイル / 危険領域の責務と依存関係を棚卸しする。

## Scope

今回やったこと:

- `docs/README.md`, `docs/maintenance/AI_HANDOFF.md`, `docs/maintenance/TASKS.md`, `package.json` を確認
- `src/app/api`, `src/lib`, `shared`, `supabase/migrations` を棚卸し
- 認証、課金、スキャン、同期、DB migration、PWA/offlineの責務境界を整理
- 巨大ファイル5本の責務マップと壊れやすい箇所を整理
- 次のP2-Bで扱うリファクタ優先度を、実装変更なしで評価

今回やっていないこと:

- コード変更
- 巨大ファイル分割
- 機能追加
- 過去のSupabase migration編集
- 認証、課金、スキャン、同期、DB migrationの挙動変更
- P2-Bの詳細リファクタ手順化、P2-Cの実装

## Summary

現状の構造は「API routeが境界チェックを行い、重い業務処理も同じroute内に多く残っている」状態です。課金は `src/lib/subscription/` へ共通化が進んでいますが、スキャン、認証OTP、学習系AI生成はrouteが直接オーケストレーションを持っています。

最も危険な集中箇所は `src/app/api/scan-jobs/process/route.ts` です。ジョブ状態管理、Storage download、AI抽出、lexicon解決、project/word保存、example生成、通知、timing log、post-processing enqueueを1本で担当しています。次点で `src/app/page.tsx` と `src/app/project/[id]/page.tsx` が、UI表示、repository選択、offline cache、scan開始、sessionStorage受け渡し、push通知を同時に持っています。

公開前の方針どおり、今すぐ大分割するより、P2-Bでは「routeを薄くする前に守るべきcontractと確認コマンドを固定する」ことが先です。特にスキャンと課金は、失敗時復旧点がDB row/RPC/webhook idempotencyに依存しているため、責務移動前に現状contractのtestまたは手動検証条件が必要です。

## 1. API Route / Server Action / Repository Responsibility Inventory

### Server Actions

`rg 'use server' src` と `rg 'server action|Server Action|action=' src/app src/components src/lib` では、現行のServer Action利用は確認できませんでした。

現状のサーバー境界は主に以下です。

- Next.js API route: 認証済みHTTP境界、billing webhook、scan worker、AI生成、share import
- Supabase client/server/admin helper: cookie / bearer / service role client作成
- Repository層: browser側のlocal / remote / hybrid / readonly data access
- Supabase migration/RPC/RLS: scan usage, webhook idempotency, subscription session claim, sync対象table

### API Route Groups

| 領域 | 主なroute | 認証境界 | 主なDB更新 | 外部サービス呼び出し | 現在の責務 | lib/repositoryへ寄せる候補 |
|---|---|---|---|---|---|---|
| Auth OTP | `src/app/api/auth/send-otp/route.ts`, `verify-otp`, `signup-verify`, `reset-password` | service role + server cookie client | `otp_requests`, `auth.users`, session cookie | Resend, Supabase Auth Admin | OTP発行、試行回数、期限、ユーザー作成/更新、session確立 | OTP lifecycle、Resend送信、admin user lookup/create/updateの共通helper |
| Auth callback | `src/app/auth/callback/route.ts`, `src/app/auth/confirm/route.ts` | Supabase Auth cookie flow | session cookie | Supabase Auth | OAuth/magic link callback | 現状は薄い。route維持でよい |
| Profile/preferences/activity | `src/app/api/profile/route.ts`, `user-preferences`, `activity` | cookie auth | `profiles`, `user_preferences`, activity系table | Supabase | ユーザー設定/プロフィール/活動ログ | 共通auth guardとstatus serialization |
| Stripe checkout | `src/app/api/subscription/create/route.ts` | cookie auth | `subscription_sessions` | Stripe Checkout | 現在subscription確認、pending session再利用、Checkout作成 | session作成/reuse判定をbilling serviceへ寄せる候補 |
| Stripe webhook | `src/app/api/subscription/webhook/route.ts` | Stripe signature | `webhook_events`, `subscriptions`, `subscription_sessions` | Stripe | signature検証、event idempotency、subscription反映 | webhook event handler単位のservice分離。ただしsignature検証はroute境界に残す |
| Stripe reconcile | `src/app/api/subscription/reconcile/route.ts` | cookie auth | `subscriptions`, `subscription_sessions` | Stripe | Checkout成功画面からの復旧、session検証、subscription反映 | webhookと共有する検証/activation補助はさらに `src/lib/subscription/` へ |
| Billing cancel/me/test | `cancel`, `me`, `test-grant` | cookie auth or test guard | `subscriptions` | Stripe cancel | subscription snapshot、cancel at period end、test grant | status mappingは既にlibあり。test routeは本番gate注意 |
| App Store billing | `appstore/verify`, `appstore/notifications` | cookie/bearer or Apple signed notification | `subscriptions`, `webhook_events` | App Store Server API/Notifications | transaction検証、original transaction ownership、notification反映 | notification type mappingとsubscription update payload生成 |
| Immediate scan | `src/app/api/extract/route.ts` | cookie or Bearer via route client | `daily_scan_usage`, lexicon/example関連 | OpenAI/Gemini/Cloud Run | validation、Pro mode enforcement、scan usage increment、AI抽出、lexicon解決、example生成 | scan request validation、usage check、provider/mode dispatch、lexicon/example orchestration |
| Background scan create | `src/app/api/scan-jobs/create/route.ts` | Bearer auth + service role | `daily_scan_usage`, `scan_jobs` | Supabase Storage | uploaded file existence check、batch usage increment、save mode判定、job insert、`after(processJobById)` | save mode判定、job payload validation、storage existence check |
| Legacy scan jobs | `src/app/api/scan-jobs/route.ts` | Bearer auth + service role | `scan_jobs`, Storage `scan-images` | Supabase Storage | multipart upload、job list/detail/delete、timeout failure marking、pending retrigger | job list/status/timeout policy helper。routeはHTTP shapeに集中させる |
| Background scan process | `src/app/api/scan-jobs/process/route.ts` | internal worker token for POST、direct function call internally | `scan_jobs`, `projects`, `words`, `lexicon_entries`, job queues | Supabase Storage, OpenAI/Gemini/Cloud Run, Web Push, APNS, Google Sheets timing | job claim、image download、AI extraction、dedupe、lexicon、example、project/word save、rollback、notification、timing、post-processing enqueue | 最優先候補。scan-job service、storage adapter、mode extraction service、save-result service、notification/timing adapter |
| Word create | `src/app/api/words/create/route.ts` | Bearer/cookie auth | `words`, `lexicon_entries`, lexicon resolution jobs | AI backfill indirectly | project ownership確認、master-first lexicon、word insert/upsert、post job enqueue | remoteRepositoryから使う重要境界。lexicon/backfill helper化候補 |
| Quiz distractors | `generate-quiz-distractors`, `regenerate-distractors`, `quiz2/similar/*` | auth、Pro checkはrouteにより差あり | `words`, similar cache | OpenAI, embeddings/RPC | distractor/example/POS生成、similar word lookup/cache | quiz AI generation service、prompt/schemaをroute外へ |
| Sentence/dictation/translation | `sentence-quiz`, `sentence-quiz/lite`, `dictation/grade`, `translate` | auth、Pro checkありのrouteあり | 一部なしまたはstats系 | OpenAI | inline prompt/schema、AI呼び出し、result shaping | prompt/schema/service分離。`sentence-quiz` はrouteが大きい |
| Lexicon jobs | `word-lexicon-resolution/process`, `lexicon-enrichment/process` | internal worker | lexicon job tables, `lexicon_entries`, `words` | AI | job claim/list/processing、afterで次job起動 | job runner service化候補 |
| Share/import/community | `share-import/*`, `shared-projects/*` | auth + service role helper | `projects`, `words`, `project_members`, `project_likes`, `share_import_logs` | OpenAI in preview | share preview、import commit、metrics、like/member/public read | shared project service/helperは一部あり。import duplicate/limit logicを集約候補 |
| Notifications | `notifications/push-subscription`, `ios-device-token` | Bearer tokenをservice roleで検証 | `web_push_subscriptions`, `ios_device_tokens` | Supabase Auth | token登録/削除 | 現状薄め。共通Bearer user resolver候補 |
| Ops/health/search/embeddings | `ops/api-costs`, `health`, `search/semantic`, `embeddings/*`, `similar-cache/rebuild` | admin/internal/auth/feature gate | `api_cost_events`, embedding/similar tables | OpenAI embeddings | dashboard data、health、feature-gated rebuild | feature gate/admin guard共通化 |

### API Routes Holding Too Much Responsibility

優先して薄くすべきroute候補:

| 優先 | route | routeが持ちすぎている責務 | 影響 |
|---|---|---|---|
| 高 | `src/app/api/scan-jobs/process/route.ts` | worker auth、job state machine、Storage、AI、lexicon、DB save、rollback、通知、timing log、post queue | scan成功率、Pro保存、通知、AI cost、DB整合性に直結 |
| 高 | `src/app/api/extract/route.ts` | request validation、usage increment、Pro mode enforcement、provider選択、AI抽出、lexicon/example生成 | free/pro scan、PDF/image、即時登録導線に直結 |
| 中 | `src/app/api/scan-jobs/route.ts` | upload、list/detail/delete、timeout recovery、pending retrigger | background scanの復旧挙動に直結 |
| 中 | `src/app/api/subscription/webhook/route.ts` | event別handlerがroute内に集約。idempotencyは重要で変更リスク高 | Pro反映、解約、支払い失敗反映に直結 |
| 中 | `src/app/api/subscription/reconcile/route.ts` | Checkout成功復旧の検証分岐がroute内に多い | webhook遅延時のユーザー復旧に直結 |
| 中 | `src/app/api/auth/reset-password/route.ts` | OTP送信/検証/password更新/session確立を単一routeで処理 | login障害・account takeover防止に直結 |
| 中 | `src/app/api/sentence-quiz/route.ts` | prompt/schema/embedding/vector search/multi-question生成をroute内に保持 | Pro学習機能、AI cost、生成品質に影響 |
| 低-中 | `src/app/api/share-import/commit/route.ts` | import duplicate検出、project作成、word insert、lexicon、logがrouteに集中 | shared project importの整合性に影響 |

### Repository / Lib Layer Responsibilities

| 層 | 主なfile | 担当 | 注意点 |
|---|---|---|---|
| Repository selector | `src/lib/db/index.ts` | subscription状態から `localRepository`, `remoteRepository`, `hybridRepository`, `readonlyRemoteRepository` を選択 | `active` はhybrid、wasPro inactiveはreadonly remote、freeはlocalという公開前invariant |
| Local repository | `src/lib/db/local-repository.ts`, `dexie.ts`, `migration.ts` | IndexedDB永続化、local CRUD、client-side migration | server-sideから触らない。schema変更はPWA/offline影響あり |
| Remote repository | `src/lib/db/remote-repository.ts` | Supabase browser clientでremote CRUD。word作成は `/api/words/create` に寄せる | session/Bearer取得、RLS、API route contractに依存 |
| Hybrid repository | `src/lib/db/hybrid-repository.ts` | Pro用local-first + remote sync、full/delta sync、offline queue | 空remote時の破壊的同期回避、mutation時のlocal/remote二重更新が壊れやすい |
| Readonly remote | `src/lib/db/readonly-remote-repository.ts` | 元Proユーザー向けremote readのみ | inactive Proのデータアクセス境界 |
| Sync queue | `src/lib/db/sync-queue.ts` | IndexedDB queue、retry、remoteRepositoryへの再送 | retry上限、削除/作成順序、offline復旧が壊れやすい |
| Supabase helpers | `src/lib/supabase/*` | browser/server/route/admin client、middleware、scan usage、scan job/project source compat | service roleはserver-only。cookie/Bearer/auth headerの違いに注意 |
| AI helpers | `src/lib/ai/*` | extraction、provider selection、Cloud Run fallback、example/distractor/insight/prompt | prompt output contractとroute側parseが密結合 |
| Billing helpers | `src/lib/subscription/*`, `src/lib/stripe/*`, `src/lib/appstore/*` | subscription status、Stripe client/config、activation/reconcile、App Store検証 | Stripe/App Store双方が同じ `subscriptions` に反映する |
| Notifications | `src/lib/notifications/*` | Web Push/APNS送信、client subscription | scan completion/failure通知とenvに依存 |
| Shared contracts | `shared/types/index.ts`, `shared/db/mappers.ts`, `shared/source-labels.ts`, `shared/lexicon.ts` | DB/API/domain type、mapper、source label normalization | DB schemaやprompt sourceLabelsと同時に影響する |

## 2. Giant File Responsibility Maps

### `src/app/api/scan-jobs/process/route.ts`

担当:

- internal worker POST route
- `processJobById(jobId)` direct worker function
- service role client作成
- `scan_jobs` のclaim、status遷移、failed/completed更新
- Storage bucket `scan-images` から画像取得
- mode別AI抽出: `all`, `circled`, `eiken`, `idiom`
- AI provider key確認、Cloud Run timing collection
- 抽出結果parse、dedupe、invalid Japanese除外、sourceLabels整形
- master-first lexicon解決、fallback Japanese backfill
- `client_local` 結果保存
- `server_cloud` project作成/更新、words保存、失敗時rollback
- example sentence生成、example generation summary作成、lexicon example保存
- quiz prefill候補処理
- word lexicon resolution job enqueue
- Web Push/APNS通知
- timing logをGoogle Sheetsへ送る補助

触ると壊れやすい箇所:

- job claim条件: `pending` だけを `processing` にするatomic update。二重処理防止に直結
- `save_mode`: `client_local` と `server_cloud` で保存先と返却payloadが違う
- scan usageとの関係: usage incrementはcreate route側で先に行われるため、process失敗時に自動rollbackされない
- no-words path: failed扱い、通知、timing logが通常成功と違う
- project/word保存失敗時のrollback: 新規projectだけ削除する前提
- example生成: best-effortだがpayloadとlexicon更新に影響する
- post-processing `after()`: lexicon resolution、pronunciation、quiz prefillが本処理後に非同期で走る
- notification: completed/failedの両方でWeb Push/APNSを送る
- env: `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY`, `CLOUD_RUN_URL`, `CLOUD_RUN_AUTH_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `INTERNAL_WORKER_TOKEN`, `SCAN_TIMING_*`

P2-Bで詳細化する候補:

- route境界: internal worker authとrequest parsingだけ残す
- job runner: claim/status/timeout/result write
- extraction service: image download、mode dispatch、timeout、dedupe
- persistence service: client local result payload / server cloud project+word保存
- notification/timing adapter: 成否通知とtiming log

### `src/app/page.tsx`

担当:

- Home画面全体
- auth/subscription状態取得
- repository選択に基づくproject/word load
- home cache/session restore
- project一覧、favorites、wrong answers、stats、modals、selection state
- push subscription登録とscan job通知
- background scan job polling/acknowledge
- project CRUD、word CRUD、manual word追加
- share link生成
- scan開始導線
- free/pro gating、word limit gating
- PDF expansion、画像圧縮、Supabase Storage upload
- `/api/extract` immediate scan
- `/api/scan-jobs/create` background scan
- `/scan/confirm` へのsessionStorage受け渡し

触ると壊れやすい箇所:

- auth loadとhome cache復元順序
- active Pro / free / wasProでrepositoryが変わる箇所
- scan開始時のPro mode判定とfree daily scan UI
- immediate scanとbackground scanの分岐
- PDF複数ページ展開と画像圧縮
- Storage upload後にjob createが失敗した場合のUI/残骸
- scan job完了通知の重複防止
- localStorage/sessionStorage key: home cache、scan confirm、acknowledged jobs
- project/wordのremote更新後にlocal cacheが古くなる箇所

P2-Bで詳細化する候補:

- scan開始hook
- home data loading hook
- scan job notification hook
- project/word mutation helper
- cache/sessionStorage keyのcontract化

### `src/app/project/[id]/page.tsx`

担当:

- Project detail画面全体
- auth/subscription/preference取得
- repository選択、project/word load
- home cacheからのpreload
- Pro remote updateとoffline cache
- project visited marker、scroll restore
- active Proではmutationに `hybridRepository` を使うinvariant
- word CRUD、bulk delete、favorite、status、vocabulary type変更
- manual word追加とword limit gating
- scan-to-add導線: `/api/extract` して `/scan/confirm` へsessionStorage
- share sheet、share scope更新、invite code copy
- search/filter/sort/select mode、action sheet、UI table

触ると壊れやすい箇所:

- ownership判定とremote/local fallback
- active Pro mutation repository。remoteだけ更新するとquiz/offline用IndexedDBが古くなる
- `/scan/confirm` sessionStorage payload
- word limitはclient gatingとserver routeの責務が混在
- share scope変更はremote repositoryとRLS/共有テーブルに依存
- bulk操作後のcache invalidationとscroll restore
- offline cache更新タイミング

P2-Bで詳細化する候補:

- project data loader
- word mutation service/hook
- scan-to-add helper
- share UI/data helper
- filter/sort/select state分離

### `src/app/quiz/[projectId]/page.tsx`

担当:

- Quiz画面全体
- normal/review/collection mode
- auth/subscription/preference取得
- repository選択とsource words load
- sessionStorageによるquiz state保存/復元
- local distractor生成
- `/api/generate-quiz-distractors` による背景distractor改善
- review modeのdue words取得
- collection modeの単語取得
- answer判定、spaced repetition更新
- stats/wrong answers更新
- favorite toggle
- type-in mode
- quiz complete/restart/next review

触ると壊れやすい箇所:

- 30分TTLのsessionStorage復元と最新word状態のmerge
- answer後のrepository更新。local/remote/hybridで永続化先が違う
- review modeは複数projectのwordと復習状態に依存
- background distractor更新中に表示中questionが変わる可能性
- `aiEnabled=false` 時の分岐
- Pro/freeのquestion countとAI補助の境界

P2-Bで詳細化する候補:

- quiz state reducer
- quiz persistence adapter
- source word loader
- answer persistence helper
- distractor generation service/hook

### `src/lib/ai/prompts.ts`

担当:

- 共通source label instruction
- 通常word extraction prompt
- example付きword extraction prompt
- circled word extraction/verification prompt
- EIKEN level description/order/filter helper
- grammar OCR/analysis prompt
- EIKEN OCR/word analysis prompt
- idiom extraction prompt
- highlighted word extraction/verification prompt
- wrong-answer OCR/analysis prompt

主な呼び出し元:

- `src/lib/ai/extract-words.ts`
- `src/lib/ai/extract-circled-words.ts`
- `src/lib/ai/extract-eiken-words.ts`
- `src/lib/ai/extract-idioms.ts`
- `src/lib/ai/extract-highlighted-words.ts`
- `src/lib/ai/extract-wrong-answers.ts`
- `src/lib/ai/prompts.translation-context.test.ts`

触ると壊れやすい箇所:

- JSON output contract: `word`, `japanese`, `sourceLabels`, `partOfSpeechTags`, `exampleSentence` 系
- source label wording: `shared/source-labels.ts` の正規化とscan routeの表示に影響
- EIKEN order/filter: `eiken` scan modeの抽出対象に影響
- grammar prompt: 現行routeは確認できないが、過去機能/将来復活時の互換性に影響
- testsは一部translation contextや抽出関数にあるが、全promptのsnapshot/contract testではない

P2-Bで詳細化する候補:

- extraction domain別prompt file
- source label ruleをshared contractとして明示
- prompt output schemaとparse側のcontract test

## 3. Dangerous Area Dependencies

### Auth

| 項目 | 内容 |
|---|---|
| 主なcode | `src/hooks/use-auth.ts`, `src/lib/supabase/server.ts`, `route-client.ts`, `middleware.ts`, `admin.ts`, `src/app/api/auth/*`, `src/app/auth/*` |
| 外部サービス | Supabase Auth, Resend |
| 主要env | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `NEXT_PUBLIC_APP_URL` |
| 主要table | `otp_requests`, `subscriptions`, `profiles`, Supabase `auth.users` |
| 主要migration | `010_otp_requests.sql`, `20260403180000_create_profiles.sql`, RLS hardening系migration |
| 関連runbook | `docs/ops/login-auth-failure-runbook.md`, `docs/ops/supabase-incident-runbook.md`, `docs/ops/production-env-checklist.md` |
| 触る時の境界 | cookie/Bearer/service roleの違い、session cache、auth state change時のsync/offline副作用を確認する |

### Billing

| 項目 | 内容 |
|---|---|
| 主なcode | `src/app/api/subscription/*`, `src/lib/subscription/*`, `src/lib/stripe/*`, `src/lib/appstore/*` |
| 外部サービス | Stripe Checkout/Webhook/API, App Store Server API/Notifications, Supabase |
| 主要env | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID`, `NEXT_PUBLIC_APP_URL`, `APPLE_IAP_*`, `SUPABASE_SERVICE_ROLE_KEY` |
| 主要table/RPC | `subscriptions`, `subscription_sessions`, `webhook_events`, `claim_subscription_session`, `claim_webhook_event` |
| 主要migration | `019_harden_subscriptions_and_webhooks.sql`, `20260209011000_komoju_hardening.sql`, `20260404200000_migrate_komoju_to_stripe.sql`, subscription guardrail系migration |
| 関連runbook | `docs/ops/billing-stripe-failure-runbook.md`, `docs/ops/production-env-checklist.md`, `docs/ops/supabase-incident-runbook.md` |
| 触る時の境界 | Stripe webhook signature、webhook idempotency、reconcile復旧、`pro_source='none'` はinactive扱い、App StoreとStripeの同一subscription row反映を崩さない |

### Scan

| 項目 | 内容 |
|---|---|
| 主なcode | `src/app/api/extract/route.ts`, `src/app/api/scan-jobs/*`, `src/app/page.tsx`, `src/app/project/[id]/page.tsx`, `src/lib/ai/*`, `src/lib/supabase/scan-usage.ts`, `scan-jobs-compat.ts` |
| 外部サービス | OpenAI, Gemini, Cloud Run scan service, Supabase Storage, Web Push, APNS, optional Google Sheets timing endpoint |
| 主要env | `OPENAI_API_KEY`, `GOOGLE_AI_API_KEY`, `CLOUD_RUN_URL`, `CLOUD_RUN_AUTH_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `INTERNAL_WORKER_TOKEN`, `MASTER_FIRST_SCAN_DISABLED_MODES`, `SCAN_TIMING_*`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `APNS_*` |
| 主要table/storage/RPC | `daily_scan_usage`, `scan_jobs`, `projects`, `words`, `lexicon_entries`, `word_lexicon_resolution_jobs`, `lexicon_enrichment_jobs`, Storage bucket `scan-images`, `check_and_increment_scan`, `check_and_increment_scan_batch` |
| 主要migration | `003_add_scan_usage_tracking.sql`, `20260223100000_scan_jobs_ios_backendization.sql`, `20260302090000_fix_scan_jobs_update_rls_drift.sql`, lexicon/job系migration |
| 関連runbook | `docs/ops/scan-failure-runbook.md`, `docs/ops/scan-example-sentences-runbook.md`, `docs/ops/ai-cost-spike-runbook.md`, `docs/ops/production-env-checklist.md` |
| 触る時の境界 | scan usageは抽出前にincrementされる。backgroundはcreateとprocessが分離。Pro-only modeはserver-side enforcement必須 |

### Sync / Offline / PWA

| 項目 | 内容 |
|---|---|
| 主なcode | `src/lib/db/index.ts`, `hybrid-repository.ts`, `sync-queue.ts`, `remote-repository.ts`, `local-repository.ts`, `src/lib/offline/recent-project-offline.ts`, `src/components/pwa/*`, `public/sw.js`, `src/hooks/use-auth.ts` |
| 外部サービス | Supabase, browser IndexedDB, Service Worker, Web Push |
| 主要env | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` |
| 主要table | `projects`, `words`, `lexicon_entries`, local Dexie tables, sync queue metadata |
| 主要migration | project/word/lexicon関連migration、RLS hardening系migration |
| 関連runbook | `docs/ops/supabase-incident-runbook.md`, `docs/ops/production-env-checklist.md`, `docs/boundaries.md`, `docs/invariants.md` |
| 触る時の境界 | IndexedDBはserver-sideで触らない。`fullSync` の空remote guard、active Proのhybrid repository、wasPro readonly remoteを崩さない |

### DB Migration

| 項目 | 内容 |
|---|---|
| 主なcode/docs | `supabase/migrations/`, `shared/types/index.ts`, `shared/db/mappers.ts`, `docs/boundaries.md`, `docs/invariants.md` |
| 外部サービス | Supabase Database/Auth/Storage |
| 主要env | `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` |
| 主要table/RPC | `subscriptions`, `subscription_sessions`, `webhook_events`, `daily_scan_usage`, `scan_jobs`, `projects`, `words`, `lexicon_entries`, `project_members`, `project_likes`, `share_import_logs`, `profiles`, `otp_requests` |
| 現状 | migration fileは76 files。過去migrationは編集禁止。DB変更は新しいmigrationで行う |
| 関連runbook | `docs/ops/supabase-incident-runbook.md`, `docs/ops/production-env-checklist.md`, `docs/boundaries.md`, `docs/invariants.md` |
| 触る時の境界 | RLS、RPC signature、mapper/type、API routeのselect/insert/update payloadを同時確認する |

## 4. Data Flows And Recovery Points

### Scan: start -> save -> usage update

Immediate scan flow:

1. Client (`src/app/page.tsx` or `src/app/project/[id]/page.tsx`) checks UI-level limits and sends image/PDF to `/api/extract`.
2. `/api/extract` authenticates by cookie or Bearer.
3. Route validates input, mode, image/PDF type, and Pro-only mode.
4. Route calls Supabase scan usage RPC before AI extraction.
5. Route calls AI extraction through direct provider or Cloud Run provider selection.
6. Route resolves lexicon master-first, falls back to Japanese backfill, and may generate examples.
7. Result is returned to client. Client stores scan confirmation data in sessionStorage and moves to `/scan/confirm` or applies project-specific flow.

Background scan flow:

1. Client uploads image(s) to Supabase Storage bucket `scan-images`.
2. Client calls `/api/scan-jobs/create` with Bearer token and uploaded path(s).
3. Create route verifies files, increments scan usage with batch RPC, decides `save_mode`, inserts `scan_jobs`.
4. Create route schedules `processJobById(job.id)` in `after()`.
5. Worker claims pending job and downloads images.
6. Worker runs AI extraction per image/mode with timeout and concurrency.
7. Worker dedupes words and resolves lexicon.
8. For `client_local`, worker stores result payload on `scan_jobs` for client retrieval.
9. For `server_cloud`, worker creates/updates project, inserts words, generates examples, and schedules follow-up jobs.
10. Worker marks job completed or failed and sends Web Push/APNS.

Recovery points:

- `daily_scan_usage`: usage is incremented before extraction. Failed scan does not automatically decrement.
- `scan_jobs.status`: `pending`, `processing`, `completed`, `failed` is the operational truth for background scans.
- `/api/scan-jobs` GET marks old pending/processing jobs failed after timeout and can retrigger pending jobs.
- `scan_jobs.result`: completed `client_local` jobs are recoverable from this payload.
- `projects` / `words`: completed `server_cloud` jobs are recovered from saved DB rows.
- Storage `scan-images`: useful for diagnosing failed background jobs while object lifecycle retains the file.
- Runbook: start with `docs/ops/scan-failure-runbook.md`.

### Stripe: checkout -> webhook/reconcile -> subscription

Checkout flow:

1. Authenticated client calls `/api/subscription/create`.
2. Route reads current `subscriptions` and avoids creating a new session for already-active Pro.
3. Route creates or reuses a pending Stripe Checkout Session and records `subscription_sessions`.
4. User completes Checkout on Stripe.

Webhook flow:

1. Stripe sends event to `/api/subscription/webhook`.
2. Route verifies `STRIPE_WEBHOOK_SECRET` signature before parsing as trusted.
3. Route claims event in `webhook_events` for idempotency.
4. Event handler updates `subscription_sessions` and/or `subscriptions`.
5. Route marks webhook event processed or failed.

Reconcile flow:

1. Success page or client calls `/api/subscription/reconcile`.
2. Route authenticates user and validates the requested Checkout Session belongs to them.
3. Route fetches Stripe Checkout Session and subscription if needed.
4. Shared activation logic updates `subscriptions` and `subscription_sessions` when payment is complete.

Recovery points:

- `webhook_events`: idempotency and failed event inspection.
- `subscription_sessions`: Checkout session state, ownership, Stripe IDs, pending/succeeded/failed.
- `subscriptions`: effective Pro state used by app.
- `/api/subscription/reconcile`: user-facing recovery when webhook is delayed or missed.
- Stripe Dashboard event/session/subscription pages.
- Runbook: start with `docs/ops/billing-stripe-failure-runbook.md`.

### Login / Auth

OTP signup/login flow:

1. Client requests OTP.
2. `/api/auth/send-otp` uses service role to check user/OTP state, writes `otp_requests`, sends email through Resend.
3. Verify route checks code, expiry, attempts, and marks OTP verified.
4. Route creates or finds Supabase Auth user and establishes session cookies through Supabase auth flow.
5. Client `use-auth` loads Supabase session, subscription row, and optimistic cache.

Password reset flow:

1. `/api/auth/reset-password` action `send-otp` creates OTP and sends email.
2. action `verify-otp` validates OTP.
3. action `set-password` updates Supabase Auth user password and signs the user in.

Client auth side effects:

- `use-auth` caches optimistic session/subscription in localStorage.
- On active Pro, it can trigger hybrid full sync or sync queue processing.
- On sign out or user change, it clears auth/subscription/sync/home/session-scoped cache.

Recovery points:

- Supabase Auth `auth.users` and auth logs.
- `otp_requests` rows for code expiry/attempts.
- Resend delivery logs.
- `subscriptions` row created on signup trigger.
- Client localStorage/sessionStorage can hold stale optimistic state.
- Runbook: start with `docs/ops/login-auth-failure-runbook.md`.

### Sync / Offline / PWA

Flow:

1. Repository selection uses subscription status.
2. Free users use local IndexedDB repository.
3. Active Pro users use `hybridRepository`: local-first mutations plus remote sync.
4. Former Pro users use readonly remote repository.
5. `hybridRepository.fullSync(userId)` runs first full sync or delta sync depending on sync metadata.
6. When offline or remote write fails, mutations are queued in `syncQueue`.
7. `syncQueue.processQueue()` retries remote operations and drops items after retry limit.
8. `recent-project-offline` caches recent projects/words for offline access.
9. PWA components and `public/sw.js` support offline/service worker behavior and push-related UX.

Recovery points:

- Local IndexedDB data and sync queue.
- Supabase `projects`, `words`, `lexicon_entries`.
- Sync metadata used by hybrid repository.
- Empty remote guard in `fullSync`: protects local data when remote appears empty.
- Service Worker cache can serve stale assets/data until refreshed.
- Runbook: Supabase incidents start with `docs/ops/supabase-incident-runbook.md`; PWA changes require manual browser/offline verification.

## 5. Refactor Priority

This table is not a P2-B implementation plan. It is the priority input for the next planning step.

| Priority | Candidate | Risk | Change frequency | User impact | Current tests/verification | AI-safety effect |
|---|---|---|---|---|---|---|
| P1 | `src/app/api/scan-jobs/process/route.ts` service boundary | Very high | Medium-high | Scan success, Pro save, notification, AI cost | Some AI helper tests and `npm run verify`; route-level worker flow coverage is limited | Very high. Reduces blast radius of future scan changes |
| P1 | Shared scan validation/usage/mode helpers for `/api/extract`, `/api/scan-jobs/create`, `/api/scan-jobs/route` | High | High | Free/pro scan limits and modes | scan usage helper tests limited; runbook exists | High. Prevents Pro-only and usage logic drift |
| P1 | Contract tests around scan job states and save modes before splitting | High | Medium | Background scan recovery | Not enough route-level coverage confirmed | High. Lets AI refactor without changing behavior |
| P2 | Billing route handler extraction around webhook/reconcile/session creation | High | Medium | Pro activation/cancel/refund | `src/lib/subscription/*` tests exist; webhook route remains large | Medium-high. Billing already has some shared lib boundary |
| P2 | Auth OTP lifecycle helper extraction | Medium-high | Medium | Signup/login/password reset | auth route tests not confirmed in verify list | Medium-high. Reduces duplicate service-role OTP handling |
| P2 | Home/project scan client hooks | Medium-high | High | Core scan UX and data consistency | mostly covered by build/lint, manual UX risk | High. Separates UI from scan side effects |
| P2 | Quiz state/persistence/distractor hooks | Medium | Medium | Quiz correctness and progress persistence | some helper tests; page integration limited | Medium. Safer edits to quiz UI and generation |
| P2 | `src/lib/ai/prompts.ts` domain split plus prompt contract tests | Medium | Medium | AI extraction quality | prompt translation context and extraction tests exist, but not full contract snapshots | Medium-high. Avoids unrelated prompt edits changing multiple modes |
| P3 | Share import service extraction | Medium | Low-medium | Shared project import | shared-project tests exist | Medium. Smaller blast radius for community features |
| P3 | Ops/admin/feature gate helper consolidation | Low-medium | Low | Ops only | security tests for some guards | Low-medium. Cleaner admin/internal route changes |

Recommended order for P2-B:

1. Define behavior contracts and verification points for scan job states/save modes.
2. Plan the smallest possible extraction from `scan-jobs/process/route.ts`, without moving multiple responsibilities at once.
3. Plan shared scan helper extraction for validation/usage/mode enforcement.
4. Plan billing/auth helper extraction only after scan boundaries are written down.
5. Plan UI hook extraction for Home/Project/Quiz after server-side scan contracts are stable.

## Open Risks

- `npx tsc --noEmit` is known to fail and is not the current public gate.
- `npm run verify` is the public minimum gate, but route-level integration coverage for scan worker and billing webhook is still thin.
- Supabase live RLS drift, Cloud Run production env, and App Store / IAP external settings remain P2-D confirmation tasks.
- Prompt changes can silently alter extraction quality even when build/test pass.
- Service Worker/offline behavior needs browser/manual verification, not only unit tests.

