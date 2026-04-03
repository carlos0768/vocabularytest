# Scan後例文生成 Runbook

## 0. Scope
- 対象: `/api/extract`, `/api/scan-jobs/process`, `src/lib/ai/generate-example-sentences.ts`
- 目的: 「スキャンは成功するが、一部の単語に例文が付かない」事象の確認と切り分け
- 非対象: historical missing examples の一括 backfill

## 1. 現在の仕様
- スキャン抽出時点では extractor に例文生成を要求しない
- 例文は抽出後の best-effort ステップで 1語ずつ生成する
- 例文生成が部分失敗しても scan は `completed` のまま進む
- `scan_jobs.result.exampleGeneration` に以下を残す
  - `requested`
  - `generated`
  - `failed`
  - `retried`
  - `retryRecovered`
  - `failureKinds`
- 失敗があれば `warnings` に次を追加する
  - `example_generation_partial_failure`
  - `example_generation_failed`

## 2. 既知の失敗シグネチャ
- `partOfSpeechTags` が配列ではなく文字列で返る
```json
{
  "partOfSpeechTags": "noun",
  "exampleSentence": "The new rule improved our workflow.",
  "exampleSentenceJa": "その新しいルールは作業の流れを改善した。"
}
```
- JSON がコードブロック付きで返る
```json
{
  "partOfSpeechTags": ["verb"],
  "exampleSentence": "We rely on clear examples in class.",
  "exampleSentenceJa": "授業では分かりやすい例文に頼る。"
}
```
- JSON の末尾 `}` が欠ける
```json
{"partOfSpeechTags":["verb"],"exampleSentence":"We rely on clear examples in class.","exampleSentenceJa":"授業では分かりやすい例文に頼る。"
```

## 3. 確認手順
### 3.1 scan_jobs の結果確認
```sql
select
  id,
  status,
  result->>'saveMode' as save_mode,
  result->'exampleGeneration' as example_generation,
  result->'warnings' as warnings,
  updated_at
from scan_jobs
where status = 'completed'
order by updated_at desc
limit 20;
```

期待:
- `exampleGeneration.requested > 0` のジョブでは summary が入っている
- `failed > 0` のとき `warnings` に partial または failed が入る

### 3.2 words の欠損確認
```sql
select
  count(*) as total_words,
  count(*) filter (where example_sentence is not null and btrim(example_sentence) <> '') as with_example,
  count(*) filter (where example_sentence is null or btrim(example_sentence) = '') as without_example
from words
where created_at >= now() - interval '7 days';
```

### 3.3 失敗種類の傾向確認
運用ログで以下の structured log を探す:
- `[scan-jobs/process] Example generation completed`
- `failureKinds.parse`
- `failureKinds.validation`
- `failureKinds.empty`
- `failureKinds.provider`

## 4. トラブルシュート
### 4.1 `parse` が増える
- AIが JSON を壊して返している
- `partOfSpeechTags` の型揺れ、コードブロック、末尾欠損をまず疑う
- 直近変更で `parseJsonResponse()` と salvage path が消えていないか確認する

### 4.2 `validation` が増える
- 必須フィールド不足や schema 変更が疑わしい
- `exampleSentence`, `exampleSentenceJa` の空欄や renamed field を確認する

### 4.3 `empty` が増える
- AIは成功扱いだが、実質空文字を返している
- prompt 変更か post-trim 判定の回避を疑う

### 4.4 `provider` が増える
- Gemini / Cloud Run / key / rate limit を疑う
- まず [`scan-gemini-cloudrun-runbook.md`](/Users/haradakarurosukei/.codex/worktrees/a8f6/englishvo-scan-example-hardening/docs/ops/scan-gemini-cloudrun-runbook.md) を確認する

## 5. Rollout / Verification
- `npm run test`
- `npm run build`
- 代表 scan を1件流し、`scan_jobs.result.exampleGeneration` を確認
- `failed > 0` の場合、warnings と structured log が両方残ることを確認

## 6. Explicit Non-Goals
- この変更は historical missing examples を埋め戻さない
- `lexicon_entries` の既存欠損を埋める backfill は別計画にする
- 例文生成失敗で scan 全体を `failed` にする仕様変更は行わない
