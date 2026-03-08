const PART_OF_SPEECH_ALIASES: Record<string, string> = {
  noun: 'noun',
  名詞: 'noun',
  n: 'noun',
  verb: 'verb',
  動詞: 'verb',
  v: 'verb',
  adjective: 'adjective',
  形容詞: 'adjective',
  adj: 'adjective',
  adverb: 'adverb',
  副詞: 'adverb',
  adv: 'adverb',
  idiom: 'idiom',
  熟語: 'idiom',
  イディオム: 'idiom',
  phrase: 'idiom',
  phrase_expression: 'idiom',
  フレーズ: 'idiom',
  idiomatic_expression: 'idiom',
  phrasal_verb: 'phrasal_verb',
  "phrasal verb": 'phrasal_verb',
  句動詞: 'phrasal_verb',
  preposition: 'preposition',
  前置詞: 'preposition',
  conjunction: 'conjunction',
  接続詞: 'conjunction',
  pronoun: 'pronoun',
  代名詞: 'pronoun',
  determiner: 'determiner',
  限定詞: 'determiner',
  article: 'determiner',
  冠詞: 'determiner',
  interjection: 'interjection',
  感動詞: 'interjection',
  auxiliary: 'auxiliary',
  助動詞: 'auxiliary',
  other: 'other',
  その他: 'other',
};

function normalizeTagKey(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';

  const exact = PART_OF_SPEECH_ALIASES[trimmed];
  if (exact) return exact;

  const normalized = trimmed
    .toLowerCase()
    .replace(/[()-]/g, ' ')
    .replace(/\s+/g, '_');

  return PART_OF_SPEECH_ALIASES[normalized] ?? 'other';
}

export function normalizePartOfSpeechTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  const deduped: string[] = [];
  const seen = new Set<string>();

  for (const item of value) {
    if (typeof item !== 'string') continue;
    const normalized = normalizeTagKey(item);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push(normalized);
  }

  return deduped;
}
