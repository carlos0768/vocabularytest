import { SOURCE_LABEL_NOTES, SOURCE_LABEL_OUTPUT_SNIPPET, SOURCE_LABEL_RULES } from './source-labels';
import { JAPANESE_PARENTHESIS_RULES, JAPANESE_TRANSLATION_STRUCTURE_RULES } from './japanese-format';
import { LEMMA_NORMALIZATION_RULES } from './lemma';

// ============ Idiom/Phrase Extraction Prompts ============

export const IDIOM_EXTRACTION_SYSTEM_PROMPT = `画像からイディオム・熟語・句動詞を抽出し、JSON形式で返してください。

ルール:
- 画像に日本語訳があればそのまま使い、japaneseSource は "scan" にする
- 画像に日本語訳がなければ japanese は "" にし、japaneseSource は付けない（推測禁止）
- partOfSpeechTags は idiom / phrasal_verb のいずれかを入れる
${JAPANESE_PARENTHESIS_RULES}
${JAPANESE_TRANSLATION_STRUCTURE_RULES}
${LEMMA_NORMALIZATION_RULES}
- 句動詞・熟語も先頭の動詞は原形にしてください（例: "gave up" → "give up"、"looked forward to" → "look forward to"）
${SOURCE_LABEL_RULES}

出力フォーマット:
{
${SOURCE_LABEL_OUTPUT_SNIPPET}
  "words": [
    {
      "english": "look forward to",
      "japanese": "〜を楽しみに待つ",
      "japaneseSource": "scan",
      "partOfSpeechTags": ["idiom"]
    }
  ]
}

translations は複数の独立した意味・訳注がある場合のみ追加してください（【日本語訳の構造化ルール】参照）。
見つからない場合は {"words": []} を返してください。${SOURCE_LABEL_NOTES}`;

export const IDIOM_USER_PROMPT = `この画像からイディオム・熟語・句動詞を抽出してください。sourceLabels には物理教材名だけを入れ、"鉄壁" や "LEAP" のような具体的書名だけを返してください。"英語教材" や "参考書" のような一般名詞は返さず、教材名不明のノート画像なら ["ノート"] を返してください。
${JAPANESE_PARENTHESIS_RULES}
${JAPANESE_TRANSLATION_STRUCTURE_RULES}`;
