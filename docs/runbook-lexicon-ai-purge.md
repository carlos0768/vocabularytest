# Runbook: AI生成lexiconレコードの全削除（L1）

`docs/ai-cost-audit-2026-07-15.md` の L1 対応。旧・単一訳プロンプトで生成された低品質なAI訳
（`translation_source = 'ai'`）を lexicon マスターから一掃する。

**実行はSupabase SQL Editorで手動実行**（マイグレーションにはしない）。

## 前提条件（必ず確認）

1. **L2（多義語対応プロンプト）がデプロイ済みであること。** 未デプロイのまま削除すると、
   夜間ジョブ・通常フローが旧品質のAI訳を再蓄積する。
   デプロイ確認: `src/lib/lexicon/ai.ts` の `TRANSLATION_PROMPT` に「意味（語義）ごとに返してください」が含まれるリビジョンが本番に出ていること。
2. 実行者がSupabaseダッシュボードの本番プロジェクトにアクセスできること。

## 安全性（スキーマ確認済み）

- `words.lexicon_entry_id` / `words.lexicon_sense_id` / `word_translations.lexicon_sense_id` /
  `official_wordbook_words.*` はいずれも `ON DELETE SET NULL`。削除してもユーザーの単語データ
  （訳・例文・誤答など）は消えず、マスターへのリンクが外れるだけ。
- `lexicon_senses` は `lexicon_entries` から `ON DELETE CASCADE`。
- リンクが外れた単語は次回の lexicon 解決ジョブで（L2対応後の高品質データに）再リンクされる。

---

## 手順

### Step 1: 事前確認（対象件数）

```sql
SELECT
  (SELECT count(*) FROM lexicon_senses  WHERE translation_source = 'ai') AS ai_senses,
  (SELECT count(*) FROM lexicon_entries WHERE translation_source = 'ai') AS ai_entries,
  (SELECT count(*) FROM lexicon_entries) AS total_entries,
  (SELECT count(*) FROM lexicon_senses)  AS total_senses;
```

件数を記録しておく（Step 5 の検証と突き合わせる）。

### Step 2: 夜間ジョブの一時停止

```sql
UPDATE cron.job SET active = false
WHERE jobname IN (
  'nightly-word-lexicon-resolution',
  'nightly-lexicon-example-backfill',
  'nightly-lexicon-quiz-content-backfill'
);

-- 確認（3行とも active = false であること）
SELECT jobname, active FROM cron.job WHERE jobname LIKE 'nightly%';
```

### Step 3: バックアップ（スナップショット）

```sql
CREATE TABLE IF NOT EXISTS backup_lexicon_senses_ai_20260715 AS
  SELECT * FROM lexicon_senses WHERE translation_source = 'ai';

CREATE TABLE IF NOT EXISTS backup_lexicon_entries_ai_20260715 AS
  SELECT * FROM lexicon_entries WHERE translation_source = 'ai';

-- 件数がStep 1と一致することを確認
SELECT
  (SELECT count(*) FROM backup_lexicon_senses_ai_20260715)  AS backed_up_senses,
  (SELECT count(*) FROM backup_lexicon_entries_ai_20260715) AS backed_up_entries;
```

### Step 4: 削除本体（1トランザクションで実行）

```sql
BEGIN;

-- 4-1. AI生成のsenseを削除
DELETE FROM lexicon_senses WHERE translation_source = 'ai';

-- 4-2. エントリ: AI訳かつ非AI senseが1つも残らない行は削除
--      （words等からの参照は ON DELETE SET NULL で安全に切れる）
DELETE FROM lexicon_entries le
WHERE le.translation_source = 'ai'
  AND NOT EXISTS (
    SELECT 1 FROM lexicon_senses ls WHERE ls.lexicon_entry_id = le.id
  );

-- 4-3. エントリ: AI訳だが非AI senseが残る行は、エントリ側の訳だけNULL化
--      （senseから再解決させる）
UPDATE lexicon_entries le
SET translation_ja = NULL,
    translation_source = NULL,
    updated_at = now()
WHERE le.translation_source = 'ai';

-- 4-4. primary senseを失ったエントリに、残存senseから1件primaryを昇格
--      （updated_at が古い = 先に登録されたsenseを優先）
WITH candidates AS (
  SELECT DISTINCT ON (ls.lexicon_entry_id) ls.id
  FROM lexicon_senses ls
  WHERE NOT EXISTS (
    SELECT 1 FROM lexicon_senses p
    WHERE p.lexicon_entry_id = ls.lexicon_entry_id AND p.is_primary
  )
  ORDER BY ls.lexicon_entry_id, ls.created_at ASC
)
UPDATE lexicon_senses
SET is_primary = true, updated_at = now()
WHERE id IN (SELECT id FROM candidates);

COMMIT;
```

### Step 5: 検証

```sql
-- AI行が残っていないこと（両方 0）
SELECT
  (SELECT count(*) FROM lexicon_senses  WHERE translation_source = 'ai') AS remaining_ai_senses,
  (SELECT count(*) FROM lexicon_entries WHERE translation_source = 'ai') AS remaining_ai_entries;

-- primary重複・primary欠落がないこと（両方 0 が理想。primary欠落は
-- sense自体が無いentryでは正常なので、senseがあるentryのみ数える）
SELECT
  (SELECT count(*) FROM (
    SELECT lexicon_entry_id FROM lexicon_senses
    GROUP BY lexicon_entry_id HAVING count(*) FILTER (WHERE is_primary) > 1
  ) t) AS entries_with_multiple_primaries,
  (SELECT count(*) FROM (
    SELECT lexicon_entry_id FROM lexicon_senses
    GROUP BY lexicon_entry_id HAVING count(*) FILTER (WHERE is_primary) = 0
  ) t) AS entries_missing_primary;

-- リンクが外れた単語数（参考値。異常に多くなければOK）
SELECT count(*) AS words_unlinked
FROM words
WHERE lexicon_entry_id IS NULL AND lexicon_sense_id IS NULL;

-- resolved rows のサンプル確認（エラーなく引けること）
SELECT * FROM lexicon_entry_resolved_rows LIMIT 5;
```

### Step 6: 夜間ジョブの再開

```sql
UPDATE cron.job SET active = true
WHERE jobname IN (
  'nightly-word-lexicon-resolution',
  'nightly-lexicon-example-backfill',
  'nightly-lexicon-quiz-content-backfill'
);

SELECT jobname, active FROM cron.job WHERE jobname LIKE 'nightly%';
```

再開後、翌日の `nightly-word-lexicon-resolution`（03:30 JST）がリンク切れ単語を
L2対応プロンプトで再解決し始める。`cron.job_run_details` で成功を確認する。

---

## ロールバック

Step 4 のトランザクション内で問題に気づいた場合は `ROLLBACK;`。

COMMIT後に戻す場合はバックアップから復元:

```sql
BEGIN;

-- エントリを先に戻す（senseのFK先）。既に存在するidはスキップ。
INSERT INTO lexicon_entries
SELECT * FROM backup_lexicon_entries_ai_20260715
ON CONFLICT (id) DO NOTHING;

-- NULL化したエントリ訳を戻す
UPDATE lexicon_entries le
SET translation_ja = b.translation_ja,
    translation_source = b.translation_source
FROM backup_lexicon_entries_ai_20260715 b
WHERE le.id = b.id AND le.translation_ja IS NULL;

-- senseを戻す
INSERT INTO lexicon_senses
SELECT * FROM backup_lexicon_senses_ai_20260715
ON CONFLICT (id) DO NOTHING;

COMMIT;
```

（Step 4-4 でprimary昇格したsenseと復元senseのprimaryが重複した場合は、
Step 5 のprimary重複クエリで検出し、復元側を優先して手動調整する。）

## 後片付け

運用が安定したら（目安: 1〜2週間後）バックアップテーブルを削除:

```sql
DROP TABLE IF EXISTS backup_lexicon_senses_ai_20260715;
DROP TABLE IF EXISTS backup_lexicon_entries_ai_20260715;
```
