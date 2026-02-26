# Quiz2 Priority Policy

## 目的
- Quiz2 の Again / Hard / Good / Easy フィードバックを、単語の復習タイミングと全学習モードの出題優先度に反映する。
- Web / iOS で優先度ルールを可能な限り揃え、将来の高度化（Anki 準拠度向上）を段階的に進める。

## 第1回取り決め（2026-02-26）
- 実装対象: Web + iOS 両方。
- 優先度初版: シンプルな SRS 優先（`nextReviewAt` 優先）で統一。
- Easy の扱い: 明示的な専用列は作らず、`status` / `nextReviewAt` / `repetition` 等の保存値で後方化する。
- 適用モード: Quiz2 / 4択クイズ / フラッシュカード。

## 現行ルール（v1）
1. `nextReviewAt` に基づく優先バケット
   - `nextReviewAt <= now`: 最優先（復習期限到来）
   - `nextReviewAt` 未設定: 中優先
   - `nextReviewAt > now`: 低優先（後ろ）
2. 同バケット内は `status` 優先
   - `new` -> `review` -> `mastered`
3. 同順位は `createdAt` 昇順（安定化のため）
4. 最後は `id` で安定ソート

## 実装マップ
### Web
- 優先度ユーティリティ
  - `src/lib/spaced-repetition.ts`
  - `compareWordsByPriority()`, `sortWordsByPriority()`
- 反映箇所
  - `src/app/quiz2/[projectId]/page.tsx`
  - `src/app/quiz/[projectId]/page.tsx`
  - `src/app/flashcard/[projectId]/page.tsx`

### iOS
- 優先度ユーティリティ
  - `ios-native/MerkenIOS/Features/Quiz/QuizEngine.swift`
  - `compareByStudyPriority()`, `sortByStudyPriority()`
- 反映箇所
  - `ios-native/MerkenIOS/Features/Quiz2/Quiz2ViewModel.swift`
  - `ios-native/MerkenIOS/Features/Quiz/QuizViewModel.swift`
  - `ios-native/MerkenIOS/Features/Flashcard/FlashcardViewModel.swift`

## 変更履歴
- 2026-02-26 (v1)
  - 優先度共通ルール（nextReviewAt/status/createdAt）を導入。
  - Quiz2 評価保存後の値を、他モードの出題順にも反映開始。
  - Web / iOS で同等の並び替えロジックを実装。

## テスト観点チェックリスト
- Quiz2 で `Again/Hard/Good/Easy` 入力後、`status/nextReviewAt/easeFactor/intervalDays/repetition` が更新される。
- 同じ単語帳で 4択クイズ / フラッシュカードの順序が優先度に従う。
- `nextReviewAt` 未設定の既存単語でクラッシュしない。
- Local / Cloud の両データソースで順序が破綻しない。

## 次の検討項目（v2 以降）
- `status` だけでなく、`easeFactor` / `repetition` を重みに組み込んだ細粒度ランキング。
- 「直近 Easy」を明示追跡する専用フィールドの導入可否。
- モード別に必要な探索性（ランダム性）をどこまで許容するか。
- コレクション横断学習時の重複語・優先度競合の解決方針。
