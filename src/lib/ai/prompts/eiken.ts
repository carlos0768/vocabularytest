import { SOURCE_LABEL_NOTES, SOURCE_LABEL_OUTPUT_SNIPPET, SOURCE_LABEL_RULES } from './source-labels';
import { JAPANESE_PARENTHESIS_RULES, JAPANESE_TRANSLATION_STRUCTURE_RULES } from './japanese-format';
import { LEMMA_NORMALIZATION_RULES } from './lemma';

// EIKEN level descriptions for AI prompts
export const EIKEN_LEVEL_DESCRIPTIONS: Record<string, string> = {
  '5': '英検5級（中学初級程度、基礎的な日常会話レベル）',
  '4': '英検4級（中学中級程度、簡単な日常会話レベル）',
  '3': '英検3級（中学卒業程度、日常生活に必要な英語レベル）',
  'pre2': '英検準2級（高校中級程度、日常生活に役立つ英語レベル）',
  '2': '英検2級（高校卒業程度、社会生活に必要な英語レベル）',
  'pre1': '英検準1級（大学中級程度、社会生活で求められる英語レベル）',
  '1': '英検1級（大学上級程度、広く社会生活で求められる英語レベル）',
};

// EIKEN level order for "this level and above" filtering
export const EIKEN_LEVEL_ORDER = ['5', '4', '3', 'pre2', '2', 'pre1', '1'];

// Get all levels at or above the specified level
export function getEikenLevelsAbove(eikenLevel: string): string[] {
  const startIndex = EIKEN_LEVEL_ORDER.indexOf(eikenLevel);
  if (startIndex === -1) return [];
  return EIKEN_LEVEL_ORDER.slice(startIndex);
}

// Generate EIKEN filter instruction
export function getEikenFilterInstruction(eikenLevel: string | null): string {
  if (!eikenLevel || !EIKEN_LEVEL_DESCRIPTIONS[eikenLevel]) {
    return '';
  }

  const levelsAbove = getEikenLevelsAbove(eikenLevel);
  const levelDescs = levelsAbove.map(level => EIKEN_LEVEL_DESCRIPTIONS[level]).join('、');
  const levelDesc = EIKEN_LEVEL_DESCRIPTIONS[eikenLevel];

  return `

【重要】英検レベルフィルター:
抽出した単語の中から、${levelDesc}「以上」に相当する単語を出力してください。
- 対象レベル: ${levelDescs}
- ${levelDesc}より明らかに簡単すぎる単語は除外してください
- ${levelDesc}以上であれば、より難しい単語も積極的に抽出してください
- このレベル以上の学習者が覚えるべき適切な難易度の単語を抽出してください`;
}

// ============ EIKEN Level Filter Mode Prompts ============
// Two-stage processing: Gemini OCR → GPT word analysis

// Gemini OCR: Extract every readable token for downstream GPT filtering
export const EIKEN_OCR_PROMPT = `この画像から英語テキストを**1語も漏らさず**抽出してください。

最重要方針:
- あなたの役割は「抽出のみ」です。難易度判定やフィルタリングは行わないでください。
- 画像内で読める英単語・英語フレーズ・英語例文をすべて出力してください。
- 要約・省略・代表語のみ抽出は厳禁です。

重要ルール:
1. 手書き/印刷を問わず、読める英語はすべて含める
2. 近くに日本語訳がある場合は対応関係がわかる形で併記する
3. 行順・段落順をできるだけ保持する
4. 同じ語が複数回出る場合はそのまま残す（重複を勝手に消さない）
5. 読み取れない部分は [?] でマークする
${SOURCE_LABEL_RULES}

出力フォーマット:
- 必ずJSONのみを返してください。
- text には抽出した全文をプレーンテキストとして入れてください。
{
${SOURCE_LABEL_OUTPUT_SNIPPET}
  "text": "抽出した全文"
}

注意:
- text は省略せず、画像から読める英語テキストをできるだけ完全に入れてください。${SOURCE_LABEL_NOTES}`;

// GPT: Word extraction and analysis at specified EIKEN level
export const EIKEN_WORD_ANALYSIS_SYSTEM_PROMPT = `あなたは英語学習教材の作成者です。与えられたテキストから英単語を抽出し、指定された英検レベル「以上」に該当する単語を出力してください。

【最重要ルール】単語抽出量について:
- **抽出する単語は多ければ多いほど良い**
- 指定レベル以上に該当する単語は**すべて漏れなく抽出する**
- 1つも見逃さない。該当レベル以上の単語は必ず含める
- 同じテキストに該当レベル以上の単語が50語あれば50語すべて抽出する
- 「代表的な単語だけ」「重要そうな単語だけ」という考えは絶対に禁止
- **単語数に上限はない。できるだけ多く抽出することが最優先**

【重要】英検レベルフィルター:
{LEVEL_DESC}「以上」に相当する単語を抽出してください。
- 対象レベル: {LEVEL_RANGE}
- このレベルより明らかに簡単すぎる単語は除外してください
- このレベル以上であれば、より難しい単語も積極的に抽出してください
- このレベル以上の学習者が覚えるべき適切な難易度の単語を抽出してください
- 指定レベル未満の単語は1語も出力しないでください
- レベル判定に迷う単語は安全側で除外してください
${LEMMA_NORMALIZATION_RULES}

重要ルール:
1. 日本語訳の決定:
   - テキスト内に日本語訳が含まれている場合: その日本語訳をそのまま使用し、japaneseSource は "scan" を返してください。
   - テキスト内に日本語訳がない場合: japanese は空文字 "" を返し、japaneseSource は付けないでください。
   - 推測生成・複数候補・説明文・言い換えは禁止です。
${JAPANESE_PARENTHESIS_RULES}
${JAPANESE_TRANSLATION_STRUCTURE_RULES}

2. 禁止事項:
   - 指定された英検レベルに合わない単語を出力しない

出力フォーマット:
{
${SOURCE_LABEL_OUTPUT_SNIPPET}
  "words": [
    {
      "english": "word",
      "japanese": "意味",
      "japaneseSource": "scan",
      "translations": [
        { "japanese": "意味", "source": "scan", "meaningRank": 1, "annotationRanges": [] }
      ],
      "partOfSpeechTags": ["noun"]
    }
  ]
}

注意:
- 必ず上記のJSON形式のみを出力してください。
- 指定レベルに該当する単語が見つからない場合は、空の配列 {"words": []} を返してください。${SOURCE_LABEL_NOTES}`;

export const EIKEN_WORD_ANALYSIS_USER_PROMPT = `以下のテキストから英単語を抽出し、指定された英検レベルに該当する単語のみを出力してください。

テキスト:
`;
