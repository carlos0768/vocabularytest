import { SOURCE_LABEL_NOTES, SOURCE_LABEL_OUTPUT_SNIPPET } from './source-labels';
import { JAPANESE_PARENTHESIS_RULES } from './japanese-format';

// ============ Highlighted/Marker Word Extraction Prompts ============
// Enhanced based on technical research for Gemini 2.5 Flash capabilities
// Key features: coordinate output, color detection, confidence scoring, few-shot examples

export const HIGHLIGHTED_WORD_EXTRACTION_SYSTEM_PROMPT = `画像から、手書きのマーカーやペンで印をつけた英単語だけを抽出してください。曖昧なら除外してください。

【対象】
- 蛍光マーカーで上から色を塗った単語
- ペンやマーカーでアンダーラインを引いた単語（その単語だけ。隣や下の行の単語は含めない）

【対象外】（必ず除外）
- 印をつけていない普通の単語
- 印刷済みの下線・太字・赤字（本の書式）
- 鉛筆の線
- 下線の下の行にある単語
- 隣接語・近傍語の誤拾い

【最重要判定ルール】
1. 手書きの印かどうかを必ず判定し、手書きでない場合は除外する
2. 下線は「線の真上にある語」だけを対象にする。下線と単語の間に別の行がある場合、その単語は対象外
3. 判定に迷ったら除外する（false positive よりも false negative を優先）
4. 候補語に対して、語のbboxと印のbboxを必ず返す
5. 推測で補完せず、見えない情報は unknown を返す

出力はJSON形式:
{
${SOURCE_LABEL_OUTPUT_SNIPPET}
  "words": [
    {
      "english": "単語",
      "japanese": "意味",
      "partOfSpeechTags": ["noun"],
      "markerColor": "yellow|pink|green|orange|blue|purple|red|black|pen|unknown",
      "markType": "underline|highlight|unknown",
      "isHandDrawn": true,
      "confidence": 0.0〜1.0,
      "wordBoundingBox": {"y_min": 0, "x_min": 0, "y_max": 1000, "x_max": 1000},
      "markBoundingBox": {"y_min": 0, "x_min": 0, "y_max": 1000, "x_max": 1000}
    }
  ],
  "detectedColors": ["green"],
  "totalHighlightedRegions": 5
}

日本語訳が画像にあればそれを使って japaneseSource は "scan" を返してください。無ければ japanese は空文字 "" を返し、japaneseSource は付けないでください。推測生成はしないでください。
${JAPANESE_PARENTHESIS_RULES}
partOfSpeechTags には noun / verb / adjective / adverb / idiom / phrasal_verb など、最も適切な分類を1つ以上入れてください。${SOURCE_LABEL_NOTES}`;

export const HIGHLIGHTED_WORD_USER_PROMPT = `この画像で、手書きのマーカーやペンで印をつけた単語だけを抽出してください。印のない単語は含めないでください。sourceLabels には物理教材名だけを入れ、"鉄壁" や "LEAP" のような具体的書名だけを返してください。"英語教材" や "参考書" のような一般名詞は返さず、教材名不明のノート画像なら ["ノート"] を返してください。
${JAPANESE_PARENTHESIS_RULES}`;

export const HIGHLIGHTED_WORD_VERIFICATION_SYSTEM_PROMPT = `あなたは抽出候補の再検証担当です。候補一覧にある単語だけを画像で再判定し、条件を満たすものだけ残してください。

【残す条件】
- 手書きマーカーまたは手書き下線が明確に確認できる
- 下線の場合、線の真上にある単語である
- 印刷赤字・印刷下線・書式装飾ではない

【除外条件】
- 下線の下の行の単語
- 候補にない新規単語
- 印が曖昧な候補
${JAPANESE_PARENTHESIS_RULES}

出力はJSONのみ:
{
  "words": [
    { "english": "word", "japanese": "意味", "japaneseSource": "scan" }
  ]
}`;
