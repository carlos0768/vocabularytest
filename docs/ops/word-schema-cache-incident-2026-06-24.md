# Word schema / PostgREST schema cache incident report (2026-06-24)

## Summary

2026-06-24 に、単語帳の単語取得、共有単語帳プレビュー、スキャン後の単語生成で連続してデータ欠落または失敗が起きた。

根本原因は単一の表示バグではなく、次の複合事故だった。

1. Web/API が `word_translations`, `lexicon_senses`, `words.lexicon_sense_id`, `words.source_modes` などの新しい DB schema をすぐに前提化した。
2. 本番 remote migration history には未適用の古い migration が残っており、特に `20260530120000_add_scan_modes_and_word_source_modes` が remote 未適用だった。
3. `word_translations` と `lexicon_senses` の FK は本番 DB に存在していたが、PostgREST の schema cache / relation embed 解決に依存した select が critical path に残っていた。
4. compatibility fallback がホーム/プロジェクト単語取得の一部にしかなく、共有プレビューと server_cloud スキャン生成には同等の防御がなかった。

## Impact

- ホーム / プロジェクトで単語帳は取得できても、単語が空になった。
- fallback select が狭すぎたため、品詞、例文、発音記号が欠落した。
- 共有リンクで「共有単語帳が見つかりません」と表示される経路があった。
- server_cloud スキャンで `words.source_modes` や `words.lexicon_sense_id` の schema/cache error、または `word_translations` の relation/schema error が fatal になり、スキャン生成が失敗した。

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
  - `word_translations.upsert` が schema/cache error でも fatal になり、単語作成後の scan 全体を失敗扱いにしていた。

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
- Release safety gap:
  - 新列・新 relation を追加する migration に対し、schema cache reload と remote migration drift の確認が release gate として固定されていなかった。

## Fix

### Code fix

PR #241:

- 共有プレビューの word select に relation-free fallback を追加。
- server_cloud scan の words insert を `source_modes` / `lexicon_sense_id` 欠落時に再試行。
- `word_translations` schema/cache error は scan 全体を落とさず、単語作成を優先して継続。
- それぞれ contract test を追加。

### DB repair migration

`supabase/migrations/20260624130000_repair_word_scan_schema_and_reload_postgrest.sql` を追加した。

この migration は:

- `scan_jobs.scan_modes` を再作成/補正する。
- `words.source_modes` を再作成/補正する。
- `words.lexicon_sense_id` と関連 FK を再保証する。
- `word_translations.word_id` / `word_translations.lexicon_sense_id` の FK を再保証する。
- 最後に `NOTIFY pgrst, 'reload schema';` で PostgREST schema cache reload を要求する。

既存 migration は編集していない。すべて `IF EXISTS` / `IF NOT EXISTS` / constraint existence check 付きで、手動修復済み環境にも再適用できる。

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
- `supabase db push --linked --dry-run` は `SUPABASE_DB_PASSWORD` 未設定のため remote 接続で失敗した。migration SQL は idempotent DDL として静的レビュー済みだが、本番適用時は通常の migration apply 経路で実行する。

Post-deploy verification required:

1. PR #241 を merge/deploy する。
2. 新 migration `20260624130000_repair_word_scan_schema_and_reload_postgrest` を本番に適用する。
3. `supabase migration list --linked` で `20260624130000` が remote に表示されることを確認する。
4. SQL Editor で以下を確認する。

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'words' and column_name in ('source_modes', 'lexicon_sense_id'))
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
   - ホームで単語帳と単語が表示される。
   - 品詞、例文、発音記号が残る。
   - 共有リンクでプレビュー単語が表示される。
   - server_cloud scan が `completed` になり、作成/追加先プロジェクトに単語が入る。

## Prevention

- DB schema を増やす migration では、最後に PostgREST schema cache reload を明示する。
- relation embed は表示品質向上の optional path として扱い、critical path は relation-free fallback を持つ。
- `supabase migration list --linked` の remote blank 行を release 前に確認する。
- schema migration と app deploy の順序を分ける。新 schema を読む/書く app deploy 前に migration 適用と API schema reload を確認する。
- scan / home / project / shared / import など、同じ `words` を読む経路の fallback select 列を共通化し、表示必須列を落とさない。
