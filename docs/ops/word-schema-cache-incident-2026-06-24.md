# Word schema / PostgREST schema cache incident report (2026-06-24)

## Summary

2026-06-24 に、単語帳の単語取得、共有単語帳プレビュー、スキャン後の単語生成で連続してデータ欠落または失敗が起きた。

根本原因は単一の表示バグではなく、次の複合事故だった。

1. Web/API が `word_translations`, `lexicon_senses`, `words.lexicon_sense_id`, `words.source_modes` などの新しい DB schema をすぐに前提化した。
2. 本番 remote migration history には未適用の古い migration が残っており、特に `20260530120000_add_scan_modes_and_word_source_modes` が remote 未適用だった。
3. `word_translations` と `lexicon_senses` の FK は本番 DB に存在していたが、PostgREST の schema cache / relation embed 解決に依存した select が critical path に残っていた。
4. compatibility fallback がホーム/プロジェクト単語取得の一部にしかなく、共有プレビューと server_cloud スキャン生成には同等の防御がなかった。
5. 追加調査で、server_cloud scan の words insert payload が使う `words.japanese_source` も本番 DB に存在しないことが判明した。
6. `englishvo` Vercel project の production env に、改行ではなくリテラル文字列 `\n` が混入していた。これにより Supabase anon/service role key と Cloud Run config が runtime で壊れ、`/api/health` は `Database unreachable` を返した。

## Impact

- ホーム / プロジェクトで単語帳は取得できても、単語が空になった。
- fallback select が狭すぎたため、品詞、例文、発音記号が欠落した。
- 共有リンクで「共有単語帳が見つかりません」と表示される経路があった。
- server_cloud スキャンで `words.source_modes`, `words.lexicon_sense_id`, `words.japanese_source` の schema/cache error、または `word_translations` の relation/schema error が fatal になり、スキャン生成が失敗した。
- Vercel runtime env の `\n` 混入により `/api/health` が 503 になり、Supabase 接続不良のように見える別系統の障害も重なった。

## Evidence

### Remote migration state

`supabase migration list --linked` の確認結果では、以下が remote 未適用だった。

- `20260530120000_add_scan_modes_and_word_source_modes`
- `20260601090000_add_study_reminder_preferences`
- `20260601103000_add_vercel_bypass_to_study_reminder_cron`
- `20260610100000_add_example_genre_preferences`
- `20260614090000_create_study_groups`

今回のスキャン失敗に直接関係するのは `20260530120000_add_scan_modes_and_word_source_modes`。この migration は `scan_jobs.scan_modes` と `words.source_modes` を追加するが、remote では未適用だった。

一方、以下は remote 適用済みだった。

- `20260622090000_create_word_translations`
- `20260623090000_add_words_lexicon_sense_id_compat`
- `20260624090000_add_lexicon_sense_distinct_key`

ユーザー確認の FK 一覧でも、次の関係は本番 DB に存在していた。

- `word_translations.lexicon_sense_id -> lexicon_senses.id`
- `word_translations.word_id -> words.id`
- `words.lexicon_sense_id -> lexicon_senses.id`
- `words.lexicon_entry_id -> lexicon_entries.id`

したがって `word_translations` / `lexicon_senses` 側の問題は「migration が完全に未適用」だけでは説明できない。DB FK はあるが、PostgREST schema cache / relation embed 解決とアプリの select 前提が噛み合っていなかった。

### Application paths

- ホーム / プロジェクト単語取得:
  - relation embed 失敗時の fallback はあったが、fallback select が表示に必要な列を落としていた。
  - main では #238, #239, #240 で relation-free fallback、例文、発音が補正された。
- 共有プレビュー:
  - `getSharedProjectPreviewByShareCode` が `SHARE_VIEW_WORD_SELECT_COLUMNS` を直接使い、`word_translations(...)` / `lexicon_senses(...)` の relation embed 失敗に fallback していなかった。
- server_cloud スキャン:
  - words insert payload が `source_modes` を含んでいたが、本番 remote では `words.source_modes` migration が未適用だった。
  - insert 後 select に `lexicon_sense_id` を含み、schema cache が古い場合に fatal になった。
  - words insert payload が `japanese_source` を含んでいたが、本番 DB には `words.japanese_source` が存在しなかった。
  - `word_translations.upsert` が schema/cache error でも fatal になり、単語作成後の scan 全体を失敗扱いにしていた。

### Follow-up evidence: `words.japanese_source`

PR #241 merge 後、migration `20260624130000` 適用後も新規 scan は `Failed to insert words` のままだった。

直近の `scan_jobs` は以下のように失敗していた。

```sql
select id, status, error_message, created_at, updated_at
from public.scan_jobs
order by created_at desc
limit 10;
```

結果では 2026-06-24 の直近4件が `failed / Failed to insert words` だった。

ROLLBACK 付きの scan payload 相当 insert で、直接原因を確認した。

```sql
begin;
insert into public.words (
  project_id,
  english,
  japanese,
  japanese_source,
  lexicon_entry_id,
  lexicon_sense_id,
  distractors,
  example_sentence,
  example_sentence_ja,
  pronunciation,
  part_of_speech_tags,
  source_modes,
  custom_sections
) values (
  (select id from public.projects order by created_at desc limit 1),
  '__codex_probe_full__',
  '検証',
  'scan',
  null,
  null,
  '["a","b","c"]'::jsonb,
  'example',
  '例文',
  '/test/',
  '["noun"]'::jsonb,
  array['all']::text[],
  '[]'::jsonb
);
rollback;
```

本番 DB は次を返した。

```text
column "japanese_source" of relation "words" does not exist
```

### Follow-up evidence: Vercel env contamination

`englishvo.vercel.app/api/health` は 503 を返した。

```text
{"status":"degraded","error":"Database unreachable"}
```

`englishvo` project の production env を値非表示で確認したところ、以下にリテラル `\n` が混入していた。

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CLOUD_RUN_URL`
- `CLOUD_RUN_AUTH_TOKEN`

同じ env 値をそのまま `@supabase/supabase-js` に渡すと `Invalid API key` になり、リテラル `\n` を除去した値では `subscriptions` への `limit(0)` query が 200 になった。

## Root Cause

直接原因は、2026-06-22 以降の word translation / distinct sense rollout が「DB schema と PostgREST API schema が即時かつ全経路で揃う」前提で進んだこと。

より深い原因は以下。

- Migration history drift:
  - remote には 2026-05-30 の scan/source mode migration が未適用だった。
  - そのため、アプリが `words.source_modes` を書くと本番で失敗する状態だった。
- PostgREST schema cache dependency:
  - FK が DB に存在しても、PostgREST の schema cache が古い間は relation embed が `PGRST200` / `PGRST204` / schema cache error になり得る。
  - critical path が relation embed を必須扱いしていた。
- Compatibility coverage gap:
  - ホーム/プロジェクトの fallback 修正は段階的に入ったが、共有プレビューと scan process には同等の compatibility path がなかった。
- Schema audit gap:
  - `20260405100000_lexicon_senses_normalization` と `20260624090000_add_lexicon_sense_distinct_key` は `words.japanese_source` の存在を条件分岐で参照していたが、同列を作る migration が存在しなかった。
  - scan insert payload と DB schema の照合が `source_modes` / `lexicon_sense_id` に偏り、`japanese_source` が漏れた。
- Runtime env hygiene gap:
  - Vercel env 値にリテラル `\n` が混入しても、runtime client 初期化側で単一行 token として正規化していなかった。
  - GitHub/Vercel checks が `vocabularytest` project を見ている一方、production alias `englishvo.vercel.app` は `englishvo` project を指しており、確認対象 project を取り違えやすかった。
- Release safety gap:
  - 新列・新 relation を追加する migration に対し、schema cache reload と remote migration drift の確認が release gate として固定されていなかった。

## Fix

### Code fix

PR #241:

- 共有プレビューの word select に relation-free fallback を追加。
- server_cloud scan の words insert を `source_modes` / `lexicon_sense_id` 欠落時に再試行。
- `word_translations` schema/cache error は scan 全体を落とさず、単語作成を優先して継続。
- それぞれ contract test を追加。

PR #243:

- `supabase/migrations/20260624153000_add_words_japanese_source.sql` を追加。
- server_cloud scan の words insert fallback を `japanese_source` 欠落にも対応。
- `japanese_source` 欠落時の retry contract test を追加。

Follow-up hardening:

- Supabase URL/key と Cloud Run URL/token の runtime env 読み取りを正規化し、リテラル `\n` / 実改行混入で token が壊れないようにした。
- `englishvo` Vercel project の production env から、対象5変数のリテラル `\n` を除去した。

### DB repair migration

`supabase/migrations/20260624130000_repair_word_scan_schema_and_reload_postgrest.sql` を追加した。

この migration は:

- `scan_jobs.scan_modes` を再作成/補正する。
- `words.source_modes` を再作成/補正する。
- `words.lexicon_sense_id` と関連 FK を再保証する。
- `word_translations.word_id` / `word_translations.lexicon_sense_id` の FK を再保証する。
- 最後に `NOTIFY pgrst, 'reload schema';` で PostgREST schema cache reload を要求する。

既存 migration は編集していない。すべて `IF EXISTS` / `IF NOT EXISTS` / constraint existence check 付きで、手動修復済み環境にも再適用できる。

追加で `supabase/migrations/20260624153000_add_words_japanese_source.sql` を追加した。

この migration は:

- `words.japanese_source` を追加する。
- 許可値を `scan` / `ai` / `null` に制限する。
- 最後に `NOTIFY pgrst, 'reload schema';` で PostgREST schema cache reload を要求する。

## Verification

Local verification:

- `npm run build`
- `npm test`
- `npm run lint:web`
- `git diff --check origin/main...HEAD`
- `supabase db lint --linked --schema public --fail-on error`

Migration evidence:

- `supabase migration list --linked` で `20260530120000_add_scan_modes_and_word_source_modes` が remote 未適用であることを確認。
- ユーザー提供の FK 確認結果で `word_translations` / `words` / `lexicon_senses` の FK は存在することを確認。
- `20260624130000` までの未適用 migration は `supabase db push --linked --include-all` で本番 remote に適用済み。
- `20260624153000_add_words_japanese_source` は `supabase db push --linked` で本番 remote に適用済み。
- `supabase migration list --linked` で `20260624153000` まで Local / Remote が一致することを確認済み。
- `words.japanese_source` と `words_japanese_source_check` の存在を確認済み。
- ROLLBACK 付きの scan payload 相当 insert で、`japanese_source = 'scan'` を含む insert が通ることを確認済み。
- `englishvo` Vercel production env の対象5変数にリテラル `\n` が残っていないことを確認済み。

Post-deploy verification required:

1. PR #241 / #243 と env hardening PR を merge/deployする。
2. migration `20260624130000_repair_word_scan_schema_and_reload_postgrest` と `20260624153000_add_words_japanese_source` が本番に適用済みであることを確認する。
3. `supabase migration list --linked` で `20260624153000` が remote に表示されることを確認する。
4. SQL Editor で以下を確認する。

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'words' and column_name in ('source_modes', 'lexicon_sense_id', 'japanese_source'))
    or (table_name = 'scan_jobs' and column_name = 'scan_modes')
  )
order by table_name, column_name;
```

```sql
select
  conname,
  conrelid::regclass as table_name,
  confrelid::regclass as ref_table,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conname in (
  'word_translations_lexicon_sense_id_fkey',
  'word_translations_word_id_fkey',
  'words_lexicon_sense_id_fkey'
)
order by conname;
```

5. Web で以下を確認する。
   - `/api/health` が `{"status":"ok"}` を返す。
   - ホームで単語帳と単語が表示される。
   - 品詞、例文、発音記号が残る。
   - 共有リンクでプレビュー単語が表示される。
   - server_cloud scan が `completed` になり、作成/追加先プロジェクトに単語が入る。

## Prevention

- DB schema を増やす migration では、最後に PostgREST schema cache reload を明示する。
- app code が insert/select する列は、migration の作成有無を grep で照合する。条件分岐で参照しているだけの列も漏れとして扱う。
- relation embed は表示品質向上の optional path として扱い、critical path は relation-free fallback を持つ。
- `supabase migration list --linked` の remote blank 行を release 前に確認する。
- production URL がどの Vercel project を指しているかを `vercel inspect https://<production-host>` で確認し、GitHub check 対象 project と混同しない。
- Vercel env は値を出さずに `literal_backslash_n` / `actual_newline` の有無を確認し、単一行 token では混入を禁止する。
- schema migration と app deploy の順序を分ける。新 schema を読む/書く app deploy 前に migration 適用と API schema reload を確認する。
- scan / home / project / shared / import など、同じ `words` を読む経路の fallback select 列を共通化し、表示必須列を落とさない。
