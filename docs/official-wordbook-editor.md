# 公式単語帳エディター (/ops/official-wordbooks)

運営が「公式単語帳」を作成・編集し、ユーザーへの配布を切り替えるための管理画面。
`/ops` 管理ハブからアクセスし、`ADMIN_SECRET` を入力して操作する(ログイン不要・シークレット認可)。

公式単語帳は `official_wordbooks` / `official_wordbook_words` に保存され、
サインアップ時に `seedDefaultOfficialWordbooksForUser()` がユーザーの
`projects` / `words` へコピーする(`src/lib/official-wordbooks/import-default.ts`)。
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

## 保存時の注意

- **編集を保存すると収録単語は表の内容で総入れ替えされる**(全削除 → 再挿入)。
  PostgREST にトランザクションが無いため、挿入が失敗すると単語が空のまま残る。
  その場合はエラーメッセージを確認してもう一度保存すれば復旧する。
- 英単語は大文字小文字・前後空白を無視して単語帳内で一意
  (`UNIQUE (official_wordbook_id, lower(btrim(english)))`)。
  重複はサーバーに送る前に検出し、どの単語が重複しているかを表示する。
- 1単語帳あたり `MAX_OFFICIAL_WORDBOOK_WORDS` = 2000語まで。挿入は500行ずつに分割して送る。
- 単語帳を削除すると収録単語も `ON DELETE CASCADE` で消える。配布済みユーザーのコピーは残る。

## 実装構成(エンジニア向け)

| パス | 役割 |
|------|------|
| `src/app/ops/official-wordbooks/page.tsx` | エディターUI(クライアント) |
| `src/app/api/ops/official-wordbooks/route.ts` | 一覧(GET)・作成(POST) |
| `src/app/api/ops/official-wordbooks/[id]/route.ts` | 詳細(GET)・更新/公開切替(PATCH)・削除(DELETE) |
| `src/app/api/ops/official-wordbooks/shared.ts` | 単語の挿入・総入れ替えの共通処理 |
| `src/lib/official-wordbooks/editor.ts` | Zodスキーマ・行マッパー・TSVパーサー・AIプロンプト |
| `src/lib/official-wordbooks/import-default.ts` | サインアップ時の配布(既存・このエディターは書き込み側のみ) |
| `supabase/migrations/20260706082447_restore_dedicated_official_wordbooks.sql` | 対象テーブル(新規マイグレーション不要) |

- 認可は既存の `requireAdminSecret`(`x-admin-secret` ヘッダ)。テーブルの書き込みRLSは
  service_role のみなので、API は `getSupabaseAdmin()`(service role)で読み書きする。
- クライアントとサーバーは同じ Zod スキーマ(`officialWordbookCreateSchema` /
  `officialWordbookUpdateSchema`)で検証する。貼り付けたデータはサーバー側でも必ず再検証される。
- バルクinsertの行は `buildOfficialWordbookWordRows()` で全行同じキー集合に揃える
  (PostgREST の PGRST102 "All object keys must match" 対策。`import-default.ts` と同じ理由)。
- テスト: `src/lib/official-wordbooks/editor.test.ts`(スキーマ・パーサー・マッパー)、
  `src/app/api/ops/official-wordbooks/route.security.test.ts`(認可とペイロード検証)。
