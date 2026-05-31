const PART_OF_SPEECH_LABELS: Record<string, string> = {
  noun: '名詞',
  verb: '動詞',
  adjective: '形容詞',
  adverb: '副詞',
  phrase: '句',
  idiom: 'イディオム',
  phrasal_verb: '句動詞',
  preposition: '前置詞',
  conjunction: '接続詞',
  pronoun: '代名詞',
  determiner: '限定詞',
  article: '冠詞',
  interjection: '感嘆詞',
  auxiliary: '助動詞',
  other: 'その他',
  名詞: '名詞',
  動詞: '動詞',
  形容詞: '形容詞',
  副詞: '副詞',
  前置詞: '前置詞',
  接続詞: '接続詞',
  代名詞: '代名詞',
  熟語: '熟語',
  句動詞: '句動詞',
};

export function getPartOfSpeechLabel(tag: string): string {
  const value = tag.trim();
  return PART_OF_SPEECH_LABELS[value] ?? value;
}

export function formatPartOfSpeechLabels(tags?: string[] | null, limit = 2): string {
  return (tags ?? [])
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, limit)
    .map(getPartOfSpeechLabel)
    .join('・');
}
