# Sentry エラー監視 Runbook

MERKENのエラー監視は [Sentry](https://sentry.io) (`@sentry/nextjs`) で行う。
本番の未処理例外・APIルートのエラー・クライアント側のクラッシュを1か所に集約し、
`/health` やVercel logsだけでは拾えない「ユーザー側で起きた失敗」を検知するのが目的。

## 前提: DSN未設定なら完全にno-op

`NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` が空なら `Sentry.init()` を呼ばない。
ローカル開発やCIでは何も設定しなくてよく、ネットワーク送信も発生しない。

ただし **SDK自体はDSNの有無にかかわらずクライアントバンドルに含まれる**
(エラーバウンダリが `Sentry.captureException` を静的importしているため)。
導入時に計測したコストは全chunk合計で **約 +77KB (gzip後)**。
DSNを空にしても転送量は戻らないので、「監視を止める」ことはできても
「バンドルを軽くする」ことはできない点に注意する。

## 構成ファイル

| ファイル | 役割 |
|---|---|
| `src/instrumentation.ts` | `register()` でNode/Edgeの初期化を動的import。`onRequestError` でサーバー側エラーを送信 |
| `src/instrumentation-client.ts` | ブラウザ側の `Sentry.init()`。`onRouterTransitionStart` でApp Routerの遷移を計装 |
| `src/lib/observability/sentry.server.ts` | Node.jsランタイムの初期化 |
| `src/lib/observability/sentry.edge.ts` | Edgeランタイム(middleware)の初期化 |
| `src/lib/observability/sentry-server-options.ts` | server/edge共通のオプション組み立て |
| `src/lib/observability/sentry-config.ts` | 全ランタイム共通の純粋関数(スクラブ、サンプリング、フィルタ) |
| `next.config.ts` | `withSentryConfig` でsource mapアップロードを設定 |
| `src/app/error.tsx` / `src/app/global-error.tsx` | エラーバウンダリからの明示的な `captureException` |

ロジックの単体テストは `src/lib/observability/sentry-config.test.ts`
(`npm test` の対象。新規テストは `package.json` の `test:web` へ手動追加が必要)。

## 環境変数

| 変数 | 必須 | 説明 |
|---|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | 任意 | ブラウザ側DSN。未設定でクライアント計測オフ |
| `SENTRY_DSN` | 任意 | server/edge用DSN。未設定なら `NEXT_PUBLIC_SENTRY_DSN` にフォールバック |
| `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` | 任意 | source mapアップロード用。**3つ揃ったビルドでのみ**アップロードする |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | 任意 | Sentry上のenvironment名。未設定なら `APP_ENV` → `NODE_ENV` |
| `SENTRY_TRACES_SAMPLE_RATE` | 任意 | サーバー側トレース率(0〜1)。既定 `0` |
| `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE` | 任意 | クライアント側トレース率(0〜1)。既定 `0` |
| `SENTRY_RELEASE` | 任意 | リリース識別子。未設定なら `VERCEL_GIT_COMMIT_SHA` |

`SENTRY_AUTH_TOKEN` はビルド時のみ使うシークレット。Vercelでは
Environment Variables に **Production / Preview 限定** で登録し、
クライアントへ露出しないよう `NEXT_PUBLIC_` を絶対に付けない。

## セットアップ手順 (初回)

1. sentry.io でプロジェクトを作成する (platform: Next.js)。
2. Settings > Client Keys (DSN) の値を `NEXT_PUBLIC_SENTRY_DSN` と `SENTRY_DSN` に設定。
3. Settings > Auth Tokens で `project:releases` と `org:read` 権限のtokenを発行し、
   `SENTRY_AUTH_TOKEN` に設定。`SENTRY_ORG` / `SENTRY_PROJECT` はslugを入れる。
4. Vercelの環境変数に登録してデプロイする。
5. 動作確認は下記「疎通確認」。

## 疎通確認

一時的なテスト用ルートを作らず、既存の挙動で確認する。

- **サーバー側**: 存在しないIDなどで意図的に500を出し、Sentryの Issues に
  `onRequestError` 由来のイベントが出るか見る。
- **クライアント側**: ブラウザのconsoleで
  `Sentry.captureMessage('sentry smoke test')` 相当の操作をするか、
  DevToolsで `/_next/static/chunks/*.js` を1つブロックしてリロードし、
  ChunkLoadErrorの自動リロード → 再発時にIssueが立つことを見る。
- source mapが効いていれば、スタックトレースがminifyされた `chunk-xxxx.js` ではなく
  元の `src/...` のファイル名・行番号で表示される。

## 送信前フィルタリング (重要)

`src/lib/observability/sentry-config.ts` の `createBeforeSend()` が
全イベントに対して次を行う。**ここは秘匿情報の流出を防ぐ最後の砦なので、
緩める変更をするときは必ずテストも一緒に更新する。**

### 1. 秘匿情報のスクラブ

`sendDefaultPii: false` に加えて、多層防御として以下を `[Filtered]` に置換する。

- リクエストヘッダ / Cookie: `authorization`, `cookie`, `x-api-key`,
  `stripe-signature`, `x-internal-worker-token` など
- クエリ文字列とURLのクエリ部分: `token`, `otp`, `code`(OAuth), `email` など
- リクエストbodyと `extra`: ネストしたオブジェクトも再帰的に走査
- `contexts` と `breadcrumbs`: 同じく再帰的に走査
- **キーが無害でも値がクエリ付きURLならクエリ部分を伏せる**
  (`referer` ヘッダ、breadcrumbのfetch URLなど)

`contexts` の走査は必須。実機の疎通確認で、Sentryのnextjs integrationが付ける
`contexts.nextjs.request_path` に**生のクエリ文字列がそのまま載る**ことが分かっている
(`request.url` 側だけ伏せても `/auth/callback?code=xxx` が漏れる)。
`src/lib/observability/sentry-config.test.ts` に回帰テストがある。

判定は `isSensitiveKey()` が担当し、`-` `_` を除去して小文字化してから
部分一致を見るので `serviceRoleKey` と `SUPABASE_SERVICE_ROLE_KEY` を同じルールで拾える。
`code` と `email` だけは巻き込みを避けるため完全一致のみ (`statusCode` は残す)。

### 2. ChunkLoadErrorの扱い

デプロイ切替直後のバージョンスキューで出る `ChunkLoadError` は
`src/app/error.tsx` が自動リロードで自己回復させているため、**既定では送らない**
(対応アクションが無く件数だけ多いため)。

ただし自動リロード後も再発した場合は `chunk_load_persistent` タグ付きで送る。
このタグが付いたIssueは「リロードしても直らない = デプロイが本当に壊れている」
シグナルなので、最優先で調査する。

## コストに関する既定

トレース (`tracesSampleRate`) は既定 `0` で、エラー監視のみ有効。
本プロジェクトは外部サービスの従量課金を常にguardrailで抑える方針
(`ai-cost-spike-runbook.md`, `gcp-budget-guard-runbook.md` と同じ考え方) のため、
パフォーマンス計測は必要になったときに明示的に上げる。

上げる場合は `0.1` 程度から始め、Sentryの Stats でquota消費を見ながら調整する。
不正値や範囲外を設定してもコード側で既定値へ落ちるので、設定ミスで
いきなりquotaを焼くことはない。

Session Replayは**意図的に無効**。画面に単語帳の中身(ユーザーの学習データ)が
そのまま映るため、プライバシー面のリスクに見合わないと判断している。

## よくある調査

| 症状 | 見るところ |
|---|---|
| Issueが1件も来ない | DSNが本番環境変数に入っているか。`isSentryEnabled()` はtrimして空判定する |
| スタックトレースが読めない | `SENTRY_ORG`/`SENTRY_PROJECT`/`SENTRY_AUTH_TOKEN` が3つ揃ってビルドされたか |
| 特定のエラーだけ来ない | `IGNORED_ERROR_PATTERNS` と `shouldDropSentryEvent()` に該当していないか |
| 秘匿値がIssueに出ている | **即座にIssueを削除**し、`isSensitiveKey()` にキーを追加してテストを足す |

## 関連

- [`production-operations-handbook.md`](production-operations-handbook.md) — 日次/週次の運用
- [`production-env-checklist.md`](production-env-checklist.md) — 本番環境変数チェック
- [`../boundaries.md`](../boundaries.md) / [`../invariants.md`](../invariants.md) — 触ってよい範囲
