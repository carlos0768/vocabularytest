export const JAPANESE_PARENTHESIS_RULES = `【日本語テキストの括弧ルール】
- japanese / normalizedJapanese / suggestedJapanese / exampleSentenceJa などの日本語テキストで括弧を使う場合は、対応する開き括弧と閉じ括弧を必ず両方含める。
- 「本質が)Aにある」のような片側だけの括弧は出力禁止。
- 画像・OCR由来で片側だけに見える場合は、画像と文脈を再確認し、両側の括弧がある形で読める場合だけ括弧付きで返す。
- JSONを返す直前に、日本語テキスト内の ( と )、（ と ）が片側だけになっていないか必ず自己チェックする。`;

export const JAPANESE_TRANSLATION_STRUCTURE_RULES = `【日本語訳の構造化ルール】
- japanese には最重要の訳を1つだけ入れる。後方互換の表示用なので、複数語義を押し込まない。
- translations には日本語訳を配列で入れる。1つの英単語に複数の独立した意味がある場合は必ず分割する。
- "感覚;分別"、"感覚；分別"、"1. 感覚 2. 分別" のような並列語義は translations を2件に分ける。
- "感覚 [分別]"、"意味（平均）"、"見積もる/推定する" のように、括弧・角括弧・スラッシュ内の語が自然な日本語訳として単独で使える場合、それは訳注ではなく別の日本語訳として translations に分ける。
- translations の各要素は { "japanese": "純粋な日本語訳", "source": "scan", "meaningRank": 1, "annotationRanges": [] } の形にする。
- meaningRank は意味の重要度。主要な意味は 1、次に来る意味は 2、それ以降は 3, 4... とする。
- annotationRanges は、訳から取り除くべき注・用法・補足の原文範囲を文字列で指定する。複数指定可。ここに入れるのは訳語ではなく、「〜に」「〜を」「(~のことで)」「人を」「物が」「formal」「[U]」「反対語: ...」のような文法情報・対象範囲・用法ラベル・メモだけ。
- annotationRanges に日本語の別訳を入れてはいけない。単独で「〜する」「〜な」「名詞」として意味が成立する語、またはクイズの答えとして自然に使える語は必ず translations[].japanese に入れる。
- annotationRanges に入れた文字列は japanese / translations[].japanese には含めない。
- 例: "sense": "感覚;分別" → japanese: "感覚", translations: [{"japanese":"感覚","source":"scan","meaningRank":1,"annotationRanges":[]},{"japanese":"分別","source":"scan","meaningRank":2,"annotationRanges":[]}]
- 例: "sense": "感覚 [分別]" → japanese: "感覚", translations: [{"japanese":"感覚","source":"scan","meaningRank":1,"annotationRanges":[]},{"japanese":"分別","source":"scan","meaningRank":2,"annotationRanges":[]}]
- 例: "mean": "意味する（平均）" → japanese: "意味する", translations: [{"japanese":"意味する","source":"scan","meaningRank":1,"annotationRanges":[]},{"japanese":"平均","source":"scan","meaningRank":2,"annotationRanges":[]}]
- 例: "admire": "に(~のことで)敬服 [感心] する" → japanese: "敬服する", translations: [{"japanese":"敬服する","source":"scan","meaningRank":1,"annotationRanges":["に(~のことで)"]},{"japanese":"感心する","source":"scan","meaningRank":2,"annotationRanges":["に(~のことで)"]}]
- annotationRanges はDB保存用の一時情報であり、保存時に custom section へ移すためだけに使われる。`;
