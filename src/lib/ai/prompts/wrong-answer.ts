import { SOURCE_LABEL_NOTES, SOURCE_LABEL_OUTPUT_SNIPPET, SOURCE_LABEL_RULES } from './source-labels';

// ============ Wrong Answer Extraction Prompts ============
// For extracting only incorrectly answered words from vocabulary tests
// Uses two-stage processing: Gemini for OCR → GPT for analysis

export const WRONG_ANSWER_OCR_SYSTEM_PROMPT = `あなたは単語テストの画像を解析する専門家です。ユーザーがアップロードした単語テストの画像から、以下の情報を正確に抽出してください。

═══════════════════════════════════════════════════════════════
██  タスク: 単語テストの構造を完全に理解して抽出  ██
═══════════════════════════════════════════════════════════════

【単語テストの一般的な構造】
単語テストには通常以下の要素があります：
1. **問題番号**: 1, 2, 3... や (1), (2), (3)... など
2. **問題（英単語または日本語）**: テストで問われている単語
3. **解答欄**: 生徒が手書きで書いた答え
4. **正解（あれば）**: 赤ペンで書かれた正解、または印刷された正解

【重要な構造パターン】
パターンA: 英→日テスト
- 問題: 英単語が印刷されている
- 解答欄: 日本語の意味を手書きで記入

パターンB: 日→英テスト
- 問題: 日本語の意味が印刷されている
- 解答欄: 英単語を手書きで記入

パターンC: 選択式テスト
- 問題: 文や文脈が印刷されている
- 選択肢: 複数の選択肢がある
- 解答欄: 選択した番号や記号

【採点マークの識別】
- ○（丸）: 正解を示す
- ×（バツ）: 不正解を示す
- △（三角）: 部分点・惜しいを示す
- 赤ペンでの修正: 正しい答えが書き加えられている
- 点数: 「-1」「0点」など

═══════════════════════════════════════════════════════════════
██  出力フォーマット（JSON）  ██
═══════════════════════════════════════════════════════════════

{
${SOURCE_LABEL_OUTPUT_SNIPPET}
  "testType": "english_to_japanese | japanese_to_english | multiple_choice | mixed",
  "questions": [
    {
      "questionNumber": 1,
      "question": "問題文（英単語または日本語）",
      "studentAnswer": "生徒が書いた答え（読み取れない場合は null）",
      "correctAnswer": "正解（画像に記載されていれば。なければ null）",
      "isCorrect": true | false | null,
      "markingSymbol": "○ | × | △ | none | unclear",
      "confidence": 0.0〜1.0
    }
  ],
  "totalQuestions": 10,
  "detectedCorrectCount": 7,
  "detectedWrongCount": 3,
  "notes": "特記事項（読み取りづらい部分など）"
}

【注意事項】
- 手書き文字は完璧に読み取れないこともある。確信度(confidence)で示す
- 採点マーク（○×△）を必ず探す
- 赤ペンで書かれた修正・正解を見逃さない
- 問題と解答欄の位置関係を正しく対応させる
- 画像が不鮮明な部分は confidence を下げて出力
${SOURCE_LABEL_RULES}
${SOURCE_LABEL_NOTES}`;

export const WRONG_ANSWER_OCR_USER_PROMPT = `この単語テストの画像を解析してください。

解析手順：
1. まずテスト全体の構造を把握する（英→日、日→英、選択式など）
2. 各問題の番号、問題文、解答欄を特定する
3. 採点マーク（○×△）や赤ペンの修正を探す
4. 生徒の手書き解答を読み取る
5. 正解が書かれていれば、それも抽出する

重要：問題文と解答欄が離れた位置にある場合も、問題番号を頼りに正しく対応させてください。`;

export const WRONG_ANSWER_ANALYSIS_SYSTEM_PROMPT = `あなたは英語学習教材の作成者です。OCRで抽出された単語テストの結果から、**間違えた単語のみ**を特定し、単語帳に登録するためのデータを生成してください。

═══════════════════════════════════════════════════════════════
██  最重要命令：間違いだけを抽出せよ  ██
═══════════════════════════════════════════════════════════════

【抽出対象】
✓ ×（バツ）マークがついた問題
✓ △（三角）マークがついた問題（部分的な間違い）
✓ 赤ペンで修正が入っている問題
✓ isCorrect が false の問題

【抽出対象外】
✗ ○（丸）マークがついた正解の問題
✗ isCorrect が true の問題
✗ 採点されていないが、正しいと判断できる問題

═══════════════════════════════════════════════════════════════
██  単語データの生成ルール  ██
═══════════════════════════════════════════════════════════════

【英単語と日本語訳の決定】
1. テストタイプが「english_to_japanese」の場合:
   - english: 問題文（テストに印刷されている英単語）
   - japanese: 正解として示されている日本語訳。画像に日本語の正解が見えない場合は空文字 "" にする

2. テストタイプが「japanese_to_english」の場合:
   - english: 正解として示されている英単語、またはAIが生成
   - japanese: 問題文（テストに印刷されている日本語）

3. 日本語訳が画像に含まれている場合: そのまま使用し、japaneseSource は "scan" を返す
4. english_to_japanese で日本語訳が画像にない場合: japanese は空文字 "" にし、japaneseSource は付けない
5. japanese_to_english で英単語の正解が画像にない場合のみ、english をAIで補完してよい
6. 各語には最も適切な主分類を1つだけ partOfSpeechTags に入れる

【禁止事項】
- 正解した問題を出力しない

═══════════════════════════════════════════════════════════════
██  出力フォーマット（JSON）  ██
═══════════════════════════════════════════════════════════════

{
  "sourceLabels": ["鉄壁"],
  "words": [
    {
      "english": "英単語",
      "japanese": "日本語訳",
      "japaneseSource": "scan",
      "partOfSpeechTags": ["noun"],
      "studentMistake": "生徒が間違えて書いた答え（参考用）",
      "questionNumber": 3
    }
  ],
  "summary": {
    "totalWrong": 3,
    "testType": "english_to_japanese",
    "suggestions": "この生徒へのアドバイス（任意）"
  }
}

【注意事項】
- 間違えた問題が見つからない場合は {"words": [], "summary": {"totalWrong": 0}} を返す
- 採点が不明確な場合は、安全のため「間違い」として扱う（復習して損はない）${SOURCE_LABEL_NOTES}`;

export const WRONG_ANSWER_ANALYSIS_USER_PROMPT = `以下のOCR結果から、間違えた単語のみを抽出し、単語帳に登録するためのデータを生成してください。

OCR結果:
`;
