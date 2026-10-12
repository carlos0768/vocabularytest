# Docs 入口

このリポジトリで作業を始める人 (人間・AI) が最初に読むファイルです。

## 最初に読む順番

1. `CLAUDE.md` — プロダクト概要・機能ごとの仕様と「なぜそうなっているか」・危険箇所
2. このファイル — 検証の回し方、コードの置き場所の約束、資料の地図
3. 触る領域の恒久 docs (下の「資料の地図」)
4. 実コードとその隣のテスト (`*.test.ts`)

docs と実コードが食い違ったら実コードが正です。食い違いを見つけたら、直すか、この README の「既知の残課題」に書いてください。

## 変更前後に必ず通すもの

| コマンド | 中身 | CI |
|---|---|---|
| `npm run typecheck` | `tsc --noEmit` (テストファイル込み) | ✅ `.github/workflows/ci.yml` |
| `npm run lint` | ESLint + SQL injection guard | ✅ `ci.yml` |
| `npm test` | `src/` と `shared/` の `*.test.ts(x)` を**自動で全部**拾って実行。`npm test -- src/lib/quiz` で絞れる | ✅ `ci.yml` |
| `npm run test:security` / `npm run security:all` | ルートのセキュリティテスト・secrets / 依存監査 | ✅ `security.yml` |
| `npm run build` | 本番ビルド | Vercel |

テストは置けば走ります (一覧への登録は不要)。`src/` `shared/` の外に置いたテストは走りません。

## コードの置き場所の約束

巨大ファイルとコピペが増えた主な原因は「既にある共通部品を知らずに、その場で書き直す」ことでした。書く前に下を探してください。

| やりたいこと | 置き場所・使うもの |
|---|---|
| ページ (`src/app/**/page.tsx`) | 画面の組み立てと状態だけ。純粋な計算は `src/lib/<機能>/` に出してテストを書く。表示部品は `src/components/<機能>/` に出す |
| API ルート (`src/app/api/**/route.ts`) | 入出力と認可だけ。処理本体は `src/lib/<機能>/` (例: `lib/scan/`, `lib/battle/`) |
| service role の Supabase クライアント | `src/lib/supabase/admin.ts` (ルートごとに `createClient(url, serviceKey)` を書かない) |
| Cookie セッションの Supabase クライアント (サーバー) | `src/lib/supabase/server.ts` |
| ブラウザから JSON API を叩くときのトークン付きヘッダー | `src/lib/supabase/auth-headers.ts` |
| 録音 (MediaRecorder) の MIME 選択・GCP 向け変換 | `src/lib/speech/recorded-audio.ts` |
| AI 出力の JSON 取り出し | `src/lib/ai/utils/json.ts` |
| 汎用の小物 (`cn`, `shuffleArray` など) | `src/lib/utils.ts` (クライアントからも読むので server 専用 import を入れない) |
| ドメイン型 | `shared/types/` が正。`src/types/` は再エクスポート |

`export` は「ファイルの外から使われている」という意味にそろえてあります (2026-10 に未使用 export を一掃)。ファイル内でしか使わないものは `export` しないでください。使われなくなったコードは消してください —— `*.legacy.tsx` のような「念のため残した旧版」は、誰も使っていないのに後続の変更で律儀に編集され続けていました。

## 資料の地図

恒久 docs:

- `architecture.md` — システム構成と主要データフロー
- `boundaries.md` — 触ってよい領域と危険領域
- `invariants.md` — 破ってはいけない不変条件
- `commands.md` — コマンド一覧と危険度
- `runbooks.md` — 作業手順 (テスト追加・migration 追加など)
- `ops/` — 障害対応 runbook と本番運用 (`ops/README.md` が入口)
  - ログイン: `ops/login-auth-failure-runbook.md` / スキャン: `ops/scan-failure-runbook.md` / 課金: `ops/billing-stripe-failure-runbook.md` / Supabase: `ops/supabase-incident-runbook.md` / AI コスト急増: `ops/ai-cost-spike-runbook.md` / Sentry: `ops/sentry-runbook.md`
- `security/` — セキュリティガードと依存ポリシー
- 機能別の仕様: `OFFLINE-MODE-DESIGN.md`, `paraphrase-quiz.md`, `official-wordbook-editor.md`, `subscription-policy.md`, `word-translations-rework-2026-06-22.md` ほか

調査メモ・日付つきのレポート (`*-2026-MM-DD.md`, `research/`, `ux/`, `ui_tactics/`) は書いた時点のスナップショットです。現状の説明としては使わないでください。

`maintenance/_archive/` は終わった保守作業の作業ログです (2026-05 の公開前整備など)。経緯を調べるとき以外は読まなくて構いません。

## 既知の残課題

- 巨大なページ・ルートがまだ残っています。分割するときは、純粋関数を `src/lib/` に出してテストを書く → 表示部品を `src/components/` に出す、の順で、1 回の変更で 1 ファイルずつ進めてください。
  - `src/app/project/[id]/page.tsx`, `src/app/home-client.tsx`, `src/app/quiz/[projectId]/page.tsx`, `src/app/share/[shareId]/page.tsx`, `src/app/shared/SharedPageClient.tsx`
  - `src/app/api/scan-jobs/process/route.ts` の `processJobById` (1 関数で千行超。contract test が厚いので、段階ごとに関数へ切り出すのが次の一手)
  - `src/app/api/shared-projects/shared.ts`, `groups/shared.ts`, `src/app/api/reels/shared.ts` は API ルート間で共有される実質ライブラリ。`src/lib/` へ移すのが筋
- 401 の応答本文がルートごとにばらばら (`{ error: 'Unauthorized' }` / `{ success: false, error: '認証が必要です。' }` など)。クライアントが本文で分岐していないか確かめてから揃えること
- `src/app/api/subscription/**` (課金) は service role クライアントをルートごとに作ったまま。危険箇所なので整理は単独の変更で行うこと
- ルート直下に試作物・素材 (`stitch/`, `uisu/`, `appimages/`, `*.png`, `*.pdf`, `pro-free-comparison.html` など) が残っている。アプリからは参照されていない
