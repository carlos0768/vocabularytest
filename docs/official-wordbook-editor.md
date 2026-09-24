# 公式単語帳エディター (/ops/official-wordbooks)

運営が「公式単語帳」を作成・編集し、ユーザーへの配布を切り替えるための管理画面。
`/ops` 管理ハブからアクセスし、`ADMIN_SECRET` を入力して操作する(ログイン不要・シークレット認可)。

公式単語帳は `official_wordbooks` / `official_wordbook_words` に保存され、
サインアップ時に `seedDefaultOfficialWordbooksForUser()` がユーザーの
`projects` / `words` へコピーする(`src/lib/official-wordbooks/import-default.ts`)。
サインアップ以降は共有ページの「公式」タブ (`/shared?tab=official` → `/official/[slug]`)
から本人が任意のタイミングで取り込める(下記「ユーザー側の導線」)。
エディターはこのソース側だけを編集する。**配布済みのユーザーのコピーは変更されない。**

## 公開/既定の意味

| フラグ | 列 | 意味 |
|--------|-----|------|
| 公開 | `is_active` | 認証済みユーザーから参照可能になり、配布対象の候補に入る。非公開の間は下書き扱い |
| 既定 | `is_default` | そのレベルを選んだ新規ユーザーの初期単語帳として自動インポートされる。**英検レベルの指定が必須** |

- 同じレベルに既定単語帳を複数置ける(`20260706082447` で1レベル1冊のユニーク制約を撤廃済み)。
  複数あれば全部インポートされる。
- そのレベルに既定が1冊も無い場合は、公開中の単語帳の先頭1冊だけがインポートされる。
- 英検レベルが未設定の単語帳は、公開してもサインアップ時の配布対象にならない
  (インポートはレベル一致で検索するため)。エディターは警告を表示する。

## 画面の構成

| セクション | 内容 |
|-----------|------|
| 認証 | `ADMIN_SECRET` 入力、一覧読み込み、AIプロンプトのコピー |
| メタ情報 | タイトル / slug / 説明 / 英検レベル / ソースラベル / アイコン / 並び順 / 既定フラグ |
| カメラスキャン | 紙面を撮影/画像・PDFを選択してAI抽出。読み取った単語を表へ流し込む(置き換え / 末尾に追加) |
| 収録単語 | 表形式エディター(1行1語)。行の追加・削除・並べ替え、詳細列(発音・品詞)の表示切替 |
| 一括貼り付け | タブ区切りテキストを読み込み(置き換え / 末尾に追加)。行番号つきで検証エラーを表示 |
| 保存 | 「非公開で保存」= `is_active=false`、「保存して公開」= `is_active=true` |
| 一覧 | 公開状態・既定・レベル・語数の一覧と、編集 / 公開切替 / 既定切替 / 削除 |

## 単語の一括入力フォーマット

1行1単語のタブ区切り(スプレッドシートからそのまま貼り付けできる):

```
英単語	日本語訳	ダミー選択肢(| 区切り)	例文	例文和訳	発音	品詞(| 区切り)
```

- 空行と `#` で始まる行は無視される。
- タブを含む行はカンマで分割しない(例文中のカンマで壊れないため)。タブが1つも無い行だけカンマ区切りとして解釈する。
- 「AIプロンプトをコピー」ボタンで、この形式で出力させるプロンプト
  (`OFFICIAL_WORDBOOK_AUTHORING_PROMPT`)をコピーできる。
- 「TSVをコピー」で現在の表をこの形式に書き出せる(外部編集・バックアップ用)。

## カメラスキャンで単語を読み込む

紙の単語帳・プリント・PDFを撮影(または選択)すると、AIが英単語と日本語訳を読み取って
表エディターに流し込む。画像1枚につき1リクエストで、DBには何も書かない
(保存は従来どおり「非公開で保存」/「保存して公開」で行う)。

| 設定 | 内容 |
|------|------|
| 抽出モード | `all`(全単語) / `circled`(丸囲み) / `idiom`(熟語) / `eiken`(英検レベル。レベル指定が必須) |
| 英検レベル | メタ情報で選んだレベルが初期値。`all` / `circled` では絞り込みとして働く |
| 不足分をAIで補完 | ダミー選択肢・例文・発音・品詞のうち**空の項目だけ**を生成する。読み取れた値は上書きしない |

- 画像は最大 `MAX_OFFICIAL_WORDBOOK_SCAN_IMAGES` = 20枚。HEIC変換・圧縮・PDFのページ分割は
  ユーザー向けスキャンと同じ `src/lib/image-utils.ts` を使う(Vercelのボディサイズ制限対策)。
- 1枚が失敗しても残りの画像は解析を続け、最初の失敗理由を注意書きとして表示する。
- 画像をまたいだ重複、および「末尾に追加」時の既存行との重複は英単語キー
  (`lower(btrim(english))`)で潰す。ユニーク制約違反で保存が丸ごと失敗するのを防ぐため。
- 訳が取れなかった単語は `backfillMissingJapaneseTranslationsWithMetadata()` でAI翻訳を試みる。
- 熟語(複数語)は `generateQuizContentForWords()` の対象外なので、ダミー選択肢は空のまま残る。
  補完後も空の項目は「ダミー選択肢が空の単語がN語あります」のように件数で警告する。

**ユーザー向けスキャン(`/api/extract`)とは別ルートで、コイン消費もPro判定も無い。**
`ADMIN_SECRET` を持つオペレーター専用の経路であり、この2本を統合すると
コイン消費・課金判定をバイパスする経路を作ることになるので統合しないこと。

## 保存時の注意

- **編集を保存すると収録単語は表の内容で総入れ替えされる**(全削除 → 再挿入)。
  PostgREST にトランザクションが無いため、挿入が失敗すると単語が空のまま残る。
  その場合はエラーメッセージを確認してもう一度保存すれば復旧する。
- 英単語は大文字小文字・前後空白を無視して単語帳内で一意
  (`UNIQUE (official_wordbook_id, lower(btrim(english)))`)。
  重複はサーバーに送る前に検出し、どの単語が重複しているかを表示する。
- 1単語帳あたり `MAX_OFFICIAL_WORDBOOK_WORDS` = 2000語まで。挿入は500行ずつに分割して送る。
- 単語帳を削除すると収録単語も `ON DELETE CASCADE` で消える。配布済みユーザーのコピーは残る。

## ユーザー側の導線

公開中(`is_active`)の公式単語帳は、共有ページ (`/shared`) の「公式」タブに一覧される。
カードをタップすると `/official/[slug]` で中身を見て、自分の単語帳へ取り込める。

| 状態 | 見えるもの | 取り込み |
|------|-----------|---------|
| 未ログイン | 一覧は全件、単語は先頭5語のプレビュー | ログインへ誘導 |
| 無料プラン | 一覧・単語ともすべて | できる(単語帳50冊の上限内) |
| Pro | 一覧・単語ともすべて | できる |
| 解約後(読み取り専用) | 一覧・単語ともすべて | Pro再登録へ誘導 |

- 一覧 (`/api/official-wordbooks`) はタイトル・英検レベル・語数だけを返すのでログイン不要。
  単語の全文 (`/api/official-wordbooks/[slug]`) はログイン必須で、未ログインには
  先頭5語だけを返して `previewOnly: true` を立てる(共有単語帳のプレビューと同じ扱い)。
- `official_wordbooks` の SELECT ポリシーは `authenticated` 限定なので、どちらの API も
  service-role client で読む(共有単語帳 discover・語法問題集の公開一覧と同じ方針)。
- 取り込みは共有単語帳と同じくクライアント側のリポジトリ (`getRepository`) で行い、
  作成した `projects` 行に `imported_from_official_slug` を残す。サインアップ時の配布も
  同じ列で重複を判定するので、既に配られている単語帳は「追加済み」と表示される。

## 実装構成(エンジニア向け)

| パス | 役割 |
|------|------|
| `src/app/ops/official-wordbooks/page.tsx` | エディターUI(クライアント) |
| `src/app/api/ops/official-wordbooks/route.ts` | 一覧(GET)・作成(POST) |
| `src/app/api/ops/official-wordbooks/[id]/route.ts` | 詳細(GET)・更新/公開切替(PATCH)・削除(DELETE) |
| `src/app/api/ops/official-wordbooks/shared.ts` | 単語の挿入・総入れ替えの共通処理 |
| `src/app/ops/official-wordbooks/scan-panel.tsx` | カメラスキャンUI(撮影・プレビュー・進捗・流し込み) |
| `src/app/api/ops/official-wordbooks/scan/route.ts` | 画像1枚のAI抽出(POST)。DBには書き込まない |
| `src/lib/official-wordbooks/scan.ts` | スキャン結果の整形・重複排除・不足フィールドの生成指示 |
| `src/lib/official-wordbooks/editor.ts` | Zodスキーマ・行マッパー・TSVパーサー・AIプロンプト |
| `src/lib/official-wordbooks/import-default.ts` | サインアップ時の配布(既存・このエディターは書き込み側のみ) |
| `src/lib/official-wordbooks/catalog.ts` | ユーザー向けカタログ(公開一覧・1冊+単語の取得) |
| `src/app/api/official-wordbooks/route.ts` | 公開一覧(GET・ログイン不要) |
| `src/app/api/official-wordbooks/[slug]/route.ts` | 1冊+単語(GET・未ログインは先頭5語のみ) |
| `src/app/official/[slug]/page.tsx` | 閲覧・取り込みページ |
| `src/app/shared/SharedPageClient.tsx` / `src/components/desktop/DesktopShared.tsx` | 共有ページの「公式」タブ |
| `supabase/migrations/20260706082447_restore_dedicated_official_wordbooks.sql` | 対象テーブル(新規マイグレーション不要) |

- 認可は既存の `requireAdminSecret`(`x-admin-secret` ヘッダ)。テーブルの書き込みRLSは
  service_role のみなので、API は `getSupabaseAdmin()`(service role)で読み書きする。
- クライアントとサーバーは同じ Zod スキーマ(`officialWordbookCreateSchema` /
  `officialWordbookUpdateSchema`)で検証する。貼り付けたデータはサーバー側でも必ず再検証される。
- バルクinsertの行は `buildOfficialWordbookWordRows()` で全行同じキー集合に揃える
  (PostgREST の PGRST102 "All object keys must match" 対策。`import-default.ts` と同じ理由)。
- テスト: `src/lib/official-wordbooks/editor.test.ts`(スキーマ・パーサー・マッパー)、
  `src/lib/official-wordbooks/scan.test.ts`(スキャン結果の整形・重複排除・補完)、
  `src/app/api/ops/official-wordbooks/route.security.test.ts` および
  `src/app/api/ops/official-wordbooks/scan/route.security.test.ts`(認可とペイロード検証)、
  `src/lib/official-wordbooks/catalog.test.ts`(公開一覧の絞り込み・並び順・検索・プレビュー)、
  `src/app/api/official-wordbooks/route.test.ts`(一覧APIと、未ログイン時の語数制限)。
