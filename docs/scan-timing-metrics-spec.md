# スキャン処理時間計測 — 実装仕様

## 目的
スキャン処理の各工程にかかる時間を毎回計測し、`scan_jobs` テーブルに保存する。
高速化施策の効果測定に使う。

## DB変更

### `scan_jobs` テーブルに `timing_metrics` カラム追加

```sql
ALTER TABLE public.scan_jobs
ADD COLUMN IF NOT EXISTS timing_metrics JSONB;
```

マイグレーションファイル: `supabase/migrations/20260320130000_add_scan_timing_metrics.sql`

### `timing_metrics` の構造

```jsonc
{
  "totalMs": 12345,               // 全体の処理時間
  "imageDownloadMs": 800,         // 画像ダウンロード合計
  "aiExtractionMs": 5200,         // AI抽出合計 (最大のボトルネック)
  "parseValidationMs": 20,        // パース・バリデーション
  "lexiconResolutionMs": 150,     // Master Lexicon解決
  "exampleGenerationMs": 3000,    // 例文生成
  "dbInsertMs": 200,              // DB保存 (words insert)
  "imageCount": 3,                // 処理した画像数
  "wordCount": 25,                // 抽出した単語数
  "scanMode": "all",              // スキャンモード
  "model": "gemini-2.5-flash",    // 使用AIモデル
  // 画像ごとの詳細 (オプション)
  "perImage": [
    { "downloadMs": 300, "extractionMs": 4200 },
    { "downloadMs": 250, "extractionMs": 3800 }
  ]
}
```

## コード変更

### `src/app/api/scan-jobs/process/route.ts`

既存のコードには `const startedAt = Date.now();` が既にある。
以下のタイミングポイントにマーカーを追加:

1. **画像ダウンロード**: `processOneImage()` 内の `getSupabaseAdmin().storage.from('scan-images').download()` の前後
2. **AI抽出**: `extractFromImage()` の前後 (processOneImage内)
3. **パース・バリデーション**: `dedupeExtractedWords()` の前後
4. **Lexicon解決**: `resolveImmediateWordsWithMasterFirst()` の前後
5. **例文生成**: `generateExampleSentences()` の前後
6. **DB保存**: `getSupabaseAdmin().from('words').insert()` の前後

各マーカーを集計して `timing_metrics` オブジェクトを組み立て、
scan_jobs の status 更新時 (completed/failed) に一緒に保存する。

### 実装パターン

```typescript
// タイミング収集用
const timing = {
  totalMs: 0,
  imageDownloadMs: 0,
  aiExtractionMs: 0,
  parseValidationMs: 0,
  lexiconResolutionMs: 0,
  exampleGenerationMs: 0,
  dbInsertMs: 0,
  imageCount: 0,
  wordCount: 0,
  scanMode: mode,
  model: AI_CONFIG.extraction.words.model,
  perImage: [] as Array<{ downloadMs: number; extractionMs: number }>,
};

// processOneImage内で画像ごとの計測
const dlStart = Date.now();
const { data: imageData } = await getSupabaseAdmin().storage...
const dlMs = Date.now() - dlStart;

const exStart = Date.now();
const extractionResult = await withTimeout(extractFromImage(...), ...);
const exMs = Date.now() - exStart;

timing.perImage.push({ downloadMs: dlMs, extractionMs: exMs });
timing.imageDownloadMs += dlMs;
timing.aiExtractionMs += exMs;

// 最終的にDB保存
timing.totalMs = Date.now() - startedAt;
timing.imageCount = imagePaths.length;
timing.wordCount = resolvedWords.length;

await getSupabaseAdmin()
  .from('scan_jobs')
  .update({
    status: 'completed',
    timing_metrics: timing,  // ← 追加
    ...
  })
  .eq('id', jobId);
```

### `/api/extract/route.ts` (同期エンドポイント)

同様に計測を追加。ただしこちらはscan_jobsを使わないので、
レスポンスの `_debug` フィールドにタイミング情報を追加する:

```typescript
return NextResponse.json({
  success: true,
  words: extractedWords,
  _debug: {
    exampleGeneration: exampleGenDiag,
    timing: {  // ← 追加
      totalMs: Date.now() - startedAt,
      aiExtractionMs: ...,
      lexiconResolutionMs: ...,
      exampleGenerationMs: ...,
    }
  },
});
```

## 注意事項
- `timing_metrics` は JSONB なのでクエリ可能 (`timing_metrics->>'totalMs'` 等)
- failed 時も計測データは保存する (どの工程で失敗したか分かる)
- パフォーマンスへの影響: `Date.now()` の呼び出しはナノ秒レベルなので無視可能
- 新しい npm パッケージは追加しない
