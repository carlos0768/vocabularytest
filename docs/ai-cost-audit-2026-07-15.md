# AIコスト削減監査: スキャン・手動追加フローの無駄なAPIコール洗い出し (2026-07-15)

スキャンフロー（`/api/extract` 同期パス + `/api/scan-jobs/process` バックグラウンドパス）と手動追加フローの全AI呼び出しを追跡し、余計なコストが発生している箇所を洗い出した結果をまとめる。各項目にファイル:行番号、コスト倍率の目安、修正方針を記載する。

対象モデル: Gemini 2.5 Flash（`src/lib/ai/config.ts`。`AI_CONFIG.defaults.openai` という名前のバケットも実体は `provider: 'gemini'`）。

---

## 実装状況（2026-07-15 更新）

フェーズ1+2 を実装済み（本ブランチのコミット参照）:

- **S1/S2/S3/M2 対応済み**: `generateQuizContentForWords` にフィールド選択（`needs`）を導入。server_cloud・同期パスとも1語1コールの例文生成は語順クイズ対象語のみに縮小され、多肢選択語の例文は30語/バッチのクイズ生成に一本化。既存フィールド・masterヒット値は再生成も上書きもされない。
- **M1 対応済み**: `enrich-manual` はlexiconマスター優先参照+AI生成分のfill-if-empty書き戻しに変更。マスター完全ヒット時はAIコールなし。
- **L2 対応済み**: 訳生成プロンプトを多義語対応（senses形式・最大3件）に変更。resolverが全senseを `lexicon_senses` へinsert-onlyで保存。既存の `translateWithAI`/`translateWordsWithAI` はprimary返却の互換ラッパーとして維持。
- **L1 手順書作成済み**: `docs/runbook-lexicon-ai-purge.md`（手動実行SQL。**L2デプロイ確認後**に実行。夜間ジョブ3本の停止/再開手順込み — 夜間ジョブはVaultシークレット設定済みで現在稼働中であることを確認済み）。
- **フェーズ3（未着手）**: M3/M4（認証・コイン判定の前倒し）、M5（in-flight重複排除）、S4（語源解析バッチ化）、M6/S5（投機的prefill整理）、ヒント検証プロンプトの複数sense対応。

## 優先度サマリー

| # | 問題 | フロー | 影響 | 優先度 |
|---|------|--------|------|--------|
| S1 | 例文の二重生成（stale配列バグ） | スキャン server_cloud | 単語ごとに例文生成が2回 | ★★★ |
| S2 | 例文の二重生成（構造的） | スキャン 同期パス | 単語ごとに例文生成が2回 | ★★★ |
| S3 | クイズprefillの全フィールド再生成がlexiconヒットを破棄 | スキャン server_cloud | マスターヒット分のAIコールが無駄に | ★★★ |
| M1 | enrich-manual がlexiconマスターを見ずに毎回AIコール、書き戻しもなし | 手動追加 | 単語×ユーザー×重複追加ぶん永久に課金 | ★★★ |
| M2 | クイズ開始時に例文・発音・品詞を再生成して上書き | 手動追加 | 手動追加単語ごとに2回のフル生成 | ★★★ |
| S4 | 例文・語源解析が単語ごとに1コール（バッチ化なし） | 両方 | N語でNコール（~600トークンのシステムプロンプトをN回送信） | ★★ |
| M3 | 認証前・保存確定前にAIコール開始 | 手動追加 | 破棄されるコール+悪用可能な穴 | ★★ |
| M4 | コイン残高チェック前に語源解析を生成 | 手動追加 | 課金されない生成コスト | ★★ |
| M5 | クイズ取得のクライアントリトライがサーバー側生成を重複起動 | クイズ | 同一チャンク最大2〜3回生成 | ★★ |
| M6 | 単語作成時の語順クイズ投機的prefill | 手動追加/スキャン | 出題されない単語too含め全対象語で生成、ユーザー間共有なし | ★ |
| S5 | 発音バックフィルの冗長スケジュール | スキャン | AIコストほぼゼロ（DBクエリのみ無駄） | ★ |
| L1 | lexicon内のAI生成レコード（`translation_source='ai'`）の全削除 | lexiconマスター | データ品質対応（L2とセットで実施） | ★★★ |
| L2 | lexicon訳生成プロンプトの多義語対応 | lexiconマスター | 単一訳強制による品質劣化・再生成コストの解消 | ★★★ |

---

## スキャンフローの問題

### S1. server_cloud: 例文が2回生成される（stale配列バグ）★★★

**内容**: 単語INSERT後、ステップAで `generateExampleSentences` が単語ごとに1コールで例文を生成しDBを直接更新する（`src/app/api/scan-jobs/process/route.ts:1464-1488`）。しかしメモリ上の `insertedWordsArray` は更新されないため、直後のステップBで `buildQuizPrefillSeedWords(insertedWordsArray)`（`route.ts:1575`）に渡ると `hasExampleSentence` 判定（`src/lib/scan/quiz-prefill.ts:39-41,65`）が「例文なし」と誤判定。クイズコンテンツ生成プロンプトは例文生成を必須としており（`src/lib/ai/generate-quiz-content.ts:79-84,102`）、`buildQuizPrefillWordUpdatePayload`（`quiz-prefill.ts:126-131`）がステップAの例文を別の例文で上書きする。

**副作用**: lexiconマスター書き戻し（`route.ts:1492-1525`）にはステップAの例文が保存され、ユーザーの単語にはステップBの例文が残る → マスターとユーザーデータが不整合。

**倍率**: 例文生成 2x/語。高コスト側はステップA（1語1コール、システムプロンプト約600トークン × N回。`generate-example-sentences.ts:115,283`）。ステップBは30語/バッチ。

**修正**: ステップA完了後に `insertedWordsArray` へ `example_sentence` を書き戻す（最小修正）。より良いのは、語順クイズ対象外の単語はステップAを丸ごとスキップし、バッチ化されたクイズ生成に例文生成を一本化すること（ステップAは quiz prefill 対象外の `isWordOrderEligible` 単語のみに残す）。

### S2. 同期パス(/api/extract): 構造的に同じ二重生成 ★★★

**内容**: `/api/extract` は抽出時に `includeExamples: false` とし（`src/app/api/extract/route.ts:295-297`、コメントは「prefillで重複回避」と主張）、その後同期的に例文を単語ごとに生成する（`route.ts:373-444`）。ところが確認画面クライアント（`src/app/scan/confirm/page.tsx:173-177,193`）は誤答選択肢や発音が無い単語（=新規抽出語ほぼ全部）を `/api/generate-quiz-distractors` に送り、そこでバッチプロンプトが例文を再生成して上書きする（`src/app/api/generate-quiz-distractors/route.ts:262-286`）。

**倍率**: 同期スキャンの新規単語ごとに例文生成 2x。

**修正**: クイズprefillを通る単語はextractルートでの例文生成をスキップする、またはクイズ生成側で「例文が既にあれば生成・上書きしない」モードを追加。

### S3. クイズprefillの all-or-nothing 再生成がlexiconマスターヒットを破棄 ★★★

**内容**: `buildQuizPrefillSeedWords`（`quiz-prefill.ts:61-68`）は4フィールド（誤答・例文・発音・品詞）のどれか1つでも欠けていれば単語を対象に含め、`generateQuizContentForWords` は常に4フィールド全部を再生成する。誤答選択肢は無条件上書き（`quiz-prefill.ts:112-114`）。つまりマスターヒットで誤答+発音を持っていても例文が無いだけで全フィールド再生成され、マスター由来の誤答が捨てられる（マスター解決は `src/lib/lexicon/master-first-scan.ts:406-423`）。`/api/generate-quiz-distractors` にはフィールド単位のlexicon再利用がある（`route.ts:164-220`）が、scan-jobsパスには相当ロジックが無い。

**修正**: `/api/generate-quiz-distractors` のフィールド単位再利用・マージをscan-jobsのクイズprefillに移植し、有効な既存フィールドは絶対に上書きしない。

### S4. 例文・語源解析が単語ごとに1コール（バッチ化なし）★★

- 例文: `generateExampleSentences` は意図的に1語1コール（`generate-example-sentences.ts:258-296`、コメント「Geminiはバッチで単語をスキップする」）。N語でNコール、都度~600トークンのシステムプロンプト送信。クイズコンテンツ側は30語/バッチで問題なく動いており、同様にバッチ化可能（S1/S2の修正で一本化すればこの問題ごと消える）。
- 語源解析: `src/lib/morphology/generate.ts:153-182,200-222` も1語1コール・5並列。lexiconキャッシュ優先（`src/lib/morphology/resolve.ts:55-79`）で接辞候補ゼロの単語はAIをスキップするため許容範囲だが、バッチ化すればプロンプトオーバーヘッドは削減可能。

### S5. 発音バックフィルの冗長スケジュール ★

`route.ts:1550-1562` が `after()` で `backfillPronunciations` を全単語分スケジュールするが、直前の同期クイズprefillが既に発音を生成・保存済み。ガードは効いている（`pronunciation IS NULL` の行だけフェッチし、AI前にlexiconマスターを確認 — `src/lib/ai/pronunciation-lookup.ts:170-204`）のでAIコストはほぼゼロ。無駄はDBクエリのみ。クイズprefill失敗語・語順対象語がある場合のみ条件付きでスケジュールすれば整理できる。

### 問題なしと確認した点（スキャン）

- `generateQuizContentWithRetry`（`route.ts:748-775`）: リトライは成功済みIDを除外して再送しない。健全。（軽微: 誤答3個未満の結果はフォールバック前に捨てられ最大3回フル再試行 — `generate-quiz-content.ts:184`）
- 語順prefill vs クイズprefill: 対象が排他（`quiz-prefill.ts:62` / `word-order-prefill.ts:53-58`）で重複なし。
- 日本語バックフィル vs lexiconマスター: master-first有効時はスキャン日本語もマスター訳も無い単語のみAI翻訳（`master-first-scan.ts:321-337`）。冗長でない。（軽微: バッチ翻訳ミス時のみ1語ずつのフォールバックコールが発生 — `master-first-scan.ts:345-358`、`backfill-japanese.ts:86-103`）
- `/api/extract` と `/api/scan-jobs` は代替エントリポイントで、同一スキャンが両方の後処理を通ることはない。

---

## 手動追加フローの問題

フロー: `handleSaveManualWord`（`src/app/project/[id]/page.tsx:915`）→ `POST /api/words/enrich-manual` → `repository.createWords()` → `POST /api/words/create`。

### M1. enrich-manual がlexiconマスターを見ずに毎回AIコール、結果の書き戻しもなし ★★★（手動追加で最大の無駄）

**内容**: `src/app/api/words/enrich-manual/route.ts:149-154` は手動追加のたびに発音・品詞・例文のGeminiコールを実行する。lexiconマスター（発音・例文・例文和訳・品詞を保持。`master-first-scan.ts:198` 参照。直後の `/api/words/create` は `create/route.ts:187` でマスターを引いている）を一切参照しない。さらに生成結果をマスターへ書き戻さない（対照: `generate-quiz-distractors/route.ts:236-256` は書き戻す）。結果、全ユーザーが "beautiful" を追加するたびに同じGeminiコールを永久に支払う。

**修正**: enrich-manual 内で `lookupLexiconEntriesByKeys` によるマスター優先参照 → 欠けているフィールドだけAI生成 → 空欄埋めの書き戻し。

### M2. クイズ開始時のフル再生成が enrich-manual の成果物を上書き ★★★

**内容**: 手動追加単語はプレースホルダー誤答 `['選択肢1','選択肢2','選択肢3']` で保存される（`page.tsx:982,1012`）。クイズ開始時に `needsDistractors`（`src/app/quiz/[projectId]/page.tsx:590-596`）が検知して `/api/generate-quiz-distractors` を呼ぶが、バッチプロンプトは常に誤答+品詞+発音+例文の4点セットを生成し（`generate-quiz-content.ts:22-102`、「誤答のみ」モードは存在しない）、`route.ts:262-286` が enrich-manual で生成済みの `example_sentence`/`pronunciation` を上書きする。つまり手動追加語1つにつき例文・発音・品詞のフル生成を2回支払う。lexicon再利用条件（`route.ts:164-220`）は「`lexicon_sense_id` があり、かつ日本語訳がsense訳と完全一致」等が必要で、ユーザーが訳を手入力する手動語ではほぼ成立しない。

**修正**: 欠けているフィールドだけ生成するようプロンプト/処理を変更し、非空カラムを上書きしない。もしくは追加時のenrichコール1回に誤答生成まで含める（同一プロンプトで限界トークンコストはほぼゼロ）。

### M3. 認証前・保存確定前にAIコールが走る ★★

- `enrich-manual/route.ts:149-168`: enrichのGeminiコールと語源解析が `supabase.auth.getUser()`（line 174）より**前に**開始される。認証失敗時は「AI結果は破棄」（line 179）— 未認証のスクリプトPOSTでもフルAIコストが発生する、レート制限も見当たらない悪用可能な穴。
- クライアントは単語の永続化前にenrichを呼ぶ（`page.tsx:939` が `createWords`(line 1006) より先）。後続の `createWords` 失敗（line 1026）で支払い済みenrichが破棄される。

**修正**: 最低限、先に安価なbearerトークン検証を行う。IP単位のレート制限も検討。

### M4. コイン判定前に語源解析を生成 ★★

`enrich-manual/route.ts:164-168` は `resolveMorphologyForWords` を無条件実行し、コイン課金 `chargeManualMorphologyCoins` は生成**後**（line 250）。課金失敗時は結果破棄（line 253）。Freeユーザー・コイン切れProユーザーがlexiconミス語を追加するたび、誰にも課金されない生成コストが発生する。共有キャッシュ（`morphology/resolve.ts:56/98`、キャッシュ優先+空欄埋め書き戻し）が効くので2回目以降は無料だが、初回コストの垂れ流しは残る。

**修正**: キャッシュミス分の生成開始前にプラン/コイン残高を確認する（キャッシュヒットは無料提供のままでよい）。

### M5. クイズ取得のクライアントリトライがサーバー側生成を重複起動 ★★

`quiz/[projectId]/page.tsx:779-815`: クライアントは25秒でfetchをabort（`:783`）し、250ms待って最大3回リトライ（`:85-87`）。abortはサーバー側のGemini処理をキャンセルせず、リトライは初回リクエストの結果が永続化される前に単語行を再読取するため、同一チャンクが2〜3回生成されうる。（バッチ自体は健全: クライアント20語/チャンク、サーバー上限30語。）

**修正**: クライアントタイムアウト延長、またはサーバー側で単語ID単位のin-flight重複排除。

### M6. 単語作成時の語順クイズ投機的prefill ★

`words/create/route.ts:318`（`after()` 内）→ `prefillWordOrderQuizzesForWords`（`src/lib/scan/word-order-prefill.ts:82`）が、2トークン以上の全作成語（`isWordOrderEligible`、`word-order.ts:54`）に対し、出題されるか不明な段階で語順クイズを生成する。キャッシュは単語行ごと（`word_order_quiz`）でlexicon共有ではないため、同じフレーズがプロジェクト・ユーザーごとに再生成される。クイズページは遅延生成も持っている（`page.tsx:761-772`）ので、prefillは純粋に投機的。

**修正**: prefill廃止、またはキャッシュを (english, japanese) キーのlexicon側へ移す。

### 問題なしと確認した点（手動追加）

- 語源解析リゾルバはキャッシュ優先+重複排除で、接辞候補ゼロ語はAIスキップ（`resolve.ts:70-77`）。
- `words/create` の翻訳バックフィルは日本語が空の単語のみ対象（`create/route.ts:188-191`）。手動追加は常に日本語付きなので通らない。
- 埋め込み: `/api/embeddings/rebuild` は管理者ゲート+実質無効（`rebuild/route.ts:28-43`）。手動追加パスから埋め込みは発生しない。
- lexicon解決ジョブ（`word-resolution-jobs.ts`）のAI使用は品詞タグ欠落行の分類のみ。enrich-manualがタグを供給するため手動語はほぼスキップ。

---

## lexiconマスターの品質対応（追加項目）

コスト削減と同時に実施するlexiconデータ品質の是正。**L2（プロンプト多義語対応）を先に実施してからL1（削除）を実行する**こと。順序が逆だと、夜間成長ジョブや通常フローの書き戻しが単一訳プロンプトのまま低品質データを再蓄積してしまう。

### L1. AI生成フラグ付きlexiconレコードの全削除 ★★★

**対象**: `translation_source = 'ai'` のレコード。AIフラグは2箇所に存在する。

- `lexicon_senses.translation_source = 'ai'`（`supabase/migrations/20260624090000_add_lexicon_sense_distinct_key.sql:25`）
- `lexicon_entries.translation_source = 'ai'`（`supabase/migrations/20260312100000_create_lexicon_entries.sql:25`）

**削除手順（新規マイグレーションで実施。適用済みマイグレーションは変更しない）**:

1. `lexicon_senses` から `translation_source='ai'` の行を削除。
2. `lexicon_entries` は「エントリ自体の訳がAI由来（`translation_source='ai'`）かつ、手順1の後に非AIのsenseが1つも残らない」ものを削除。非AI senseが残るエントリは行ごと消さず、エントリ側の `translation_ja` / `translation_source` をNULL化して非AI senseから再解決させる。
3. 各エントリで `is_primary` のsenseが消えた場合、残存senseへprimaryを付け替える。

**安全性（スキーマ確認済み）**:
- `words.lexicon_entry_id` / `words.lexicon_sense_id` はいずれも `ON DELETE SET NULL`（`20260312100000:87`、`20260624090000:540-553`）。`official_wordbook_words` も同様（`20260628224834:70-96`）。削除してもユーザーの単語データ（`words.japanese`、例文、誤答など）は一切消えず、マスターへのリンクが外れるだけ。
- `lexicon_senses` は `lexicon_entries` から `ON DELETE CASCADE`（`20260624090000:16`）。
- `lexicon_entry_resolved_rows` は解決ビュー/RPCなので削除後は自動的に反映される。

**留意点**:
- リンクが外れた単語は次回のlexicon解決ジョブ（`src/lib/lexicon/word-resolution-jobs.ts`）で再リンク対象になる。L2適用後であれば多義語対応の高品質データで再構築される。
- 削除前に対象件数の確認と`lexicon_senses`/`lexicon_entries`のバックアップ（`CREATE TABLE ... AS SELECT`でのスナップショット）を取ること。
- M1（enrich-manualの書き戻し実装）より前に削除を済ませておくと、削除後に低品質データが混ざる経路を塞げる。

### L2. lexicon訳生成プロンプトの多義語対応 ★★★

**現状の問題**: 訳生成プロンプトが単一訳を強制している。

- 単発翻訳 `TRANSLATION_PROMPT`（`src/lib/lexicon/ai.ts:13-25`）:「複数の意味がある場合は最も一般的な訳を1つ返す」
- バッチ翻訳 `translateWordsWithAI` 内プロンプト（`ai.ts:268-286`）:「各項目について最も一般的な日本語訳を1つだけ返す」

スキーマ側は既に多義語対応済み（`lexicon_senses` が entry:senses = 1:N、`distinct_key`・`meaning_summary`・`is_primary` を保持 — `20260624090000:15-30`）なのに、AI生成側が1訳しか作らないため、多義語（例: "run" = 走る/経営する/立候補する）がマスター上1訳に潰れる。これが原因で、ユーザーのスキャン訳とマスター訳が一致せず lexicon再利用条件（`generate-quiz-distractors/route.ts:36-40` の完全一致判定など）が成立しにくくなり、**再生成コスト（S3/M2の無駄）を間接的に増やしている**。

**修正内容**:

1. `TRANSLATION_PROMPT` と `translateWordsWithAI` のプロンプトを、意味ごとに複数訳を返す形式へ変更する。出力例:
   ```json
   {
     "translations": [
       {
         "english": "run",
         "pos": "verb",
         "senses": [
           { "japanese": "走る", "meaningSummary": "移動する", "isPrimary": true },
           { "japanese": "経営する", "meaningSummary": "組織を運営する", "isPrimary": false }
         ]
       }
     ]
   }
   ```
   - 一般的な意味が1つの語は senses 1件でよい（無理に増やさない）ことをルールに明記。senses は主要な意味のみ最大3〜4件程度に制限しトークン増を抑える。
   - 動詞「〜する」形・括弧ルール（`JAPANESE_PARENTHESIS_RULES`）等の既存ルールは維持。
2. Zodスキーマ（`translationResponseSchema` / `batchTranslationResponseSchema`、`ai.ts:92-102`）とGemini Controlled Generation用スキーマを新形式に合わせて更新。
3. 呼び出し側の反映:
   - senses配列を `lexicon_senses` へ複数行upsertし、`is_primary`・`meaning_summary` を保存。エントリ側 `translation_ja` はprimary senseで埋める。
   - 単一訳を期待している既存呼び出し（`master-first-scan.ts:340-358` のバッチ翻訳フォールバック、`backfill-japanese.ts` など）はprimary senseを使う互換レイヤを挟み、既存動作を壊さない。
4. 夜間lexicon成長ジョブ（`20260320103000_master_first_scan_and_nightly_lexicon_growth.sql` 系）とヒント検証 `TRANSLATION_HINT_VALIDATION_PROMPT`（`ai.ts:27-52`）が新形式と整合するか確認。ヒント検証は「候補がいずれかのsenseに合致するか」で判定するよう拡張するとマスター採用率が上がる。

**コスト面の note**: senses複数化で1コールあたりの出力トークンは微増するが、バッチ50語/コール構造は不変。マスター再利用率の向上（S3/M2の再生成減）で相殺が見込める。

---

## 修正ロードマップ（推奨順）

### フェーズ1: 二重生成の解消（最大のROI、リスク低）
1. **S1**: ステップA後に `insertedWordsArray` の `example_sentence` を更新（1行規模の修正）。恒久対応としてserver_cloudの例文生成をバッチ化クイズ生成へ一本化。
2. **S2/M2**: `generateQuizContentForWords` に「欠けているフィールドのみ生成・非空カラムは上書きしない」を導入（scan-jobs / generate-quiz-distractors 共通）。
3. **S3**: フィールド単位のlexicon再利用をscan-jobsクイズprefillへ移植。

### フェーズ2: lexiconマスターの品質是正と活用の徹底
4. **L2**: 訳生成プロンプトの多義語対応（削除より先に実施）。
5. **L1**: AI生成フラグ付きlexiconレコードの全削除（バックアップ→sense削除→エントリ削除/NULL化→primary付け替え）。
6. **M1**: enrich-manual にマスター優先参照+書き戻しを実装。頻出語のAIコストがユーザー横断で1回きりになる。L1の後に実施すれば、書き戻されるデータは多義語対応後の高品質なものだけになる。

### フェーズ3: ガード・構造整理
7. **M3/M4**: 認証・コイン判定をAI呼び出しより前へ。
8. **M5**: クイズ生成のin-flight重複排除。
9. **S4**: 例文・語源解析のバッチ化（フェーズ1で例文が一本化されていれば語源解析のみ）。
10. **M6/S5**: 投機的prefillと冗長バックフィルの整理。

### 概算削減効果
- スキャン（server_cloud）: 例文生成コールが約半減（現状: N語ぶんの単発コール + 同じ例文を作り直す N/30 バッチコール）。加えてマスターヒット語の誤答再生成が消える。
- 手動追加: 1語あたりのAI支出が約半減（enrich + クイズ時フル再生成 → 実質1回に）。頻出語はマスター書き戻しにより2ユーザー目以降ほぼゼロに。
