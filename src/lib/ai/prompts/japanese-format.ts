export const JAPANESE_PARENTHESIS_RULES = `【日本語テキストの括弧ルール】
- japanese / normalizedJapanese / suggestedJapanese / exampleSentenceJa などの日本語テキストで括弧を使う場合は、対応する開き括弧と閉じ括弧を必ず両方含める。
- 「本質が)Aにある」のような片側だけの括弧は出力禁止。
- 画像・OCR由来で片側だけに見える場合は、画像と文脈を再確認し、両側の括弧がある形で読める場合だけ括弧付きで返す。
- JSONを返す直前に、日本語テキスト内の ( と )、（ と ）が片側だけになっていないか必ず自己チェックする。`;

export const JAPANESE_TRANSLATION_STRUCTURE_RULES = `【日本語訳の構造化ルール】
- japanese には最重要の訳を1つだけ入れる。後方互換の表示用なので、複数語義を押し込まない。
- translations には日本語訳を配列で入れる。1つの英単語に複数の独立した意味がある場合は必ず分割する。
- "感覚;分別"、"感覚；分別"、"1. 感覚 2. 分別" のような並列語義は translations を2件に分ける。
- translations の各要素は { "japanese": "純粋な日本語訳", "source": "scan", "meaningRank": 1, "annotationRanges": [] } の形にする。
- meaningRank は意味の重要度。主要な意味は 1、次に来る意味は 2、それ以降は 3, 4... とする。
- annotationRanges は、訳から取り除くべき注・用法・補足の原文範囲を文字列で指定する。複数指定可。
- annotationRanges に入れた文字列は japanese / translations[].japanese には含めない。
- 例: "sense": "感覚;分別" → japanese: "感覚", translations: [{"japanese":"感覚","source":"scan","meaningRank":1,"annotationRanges":[]},{"japanese":"分別","source":"scan","meaningRank":2,"annotationRanges":[]}]
- 例: "admire": "に(~のことで)敬服 [感心] する" → japanese: "敬服する", translations: [{"japanese":"敬服する","source":"scan","meaningRank":1,"annotationRanges":["に(~のことで)","[感心]"]}]
- annotationRanges はDB保存用の一時情報であり、保存時に custom section へ移すためだけに使われる。`;
