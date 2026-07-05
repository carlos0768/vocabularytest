export const JAPANESE_PARENTHESIS_RULES = `【日本語テキストの括弧ルール】
- japanese / normalizedJapanese / suggestedJapanese / exampleSentenceJa などの日本語テキストで括弧を使う場合は、対応する開き括弧と閉じ括弧を必ず両方含める。
- 「本質が)Aにある」のような片側だけの括弧は出力禁止。
- 画像・OCR由来で片側だけに見える場合は、画像と文脈を再確認し、両側の括弧がある形で読める場合だけ括弧付きで返す。
- JSONを返す直前に、日本語テキスト内の ( と )、（ と ）が片側だけになっていないか必ず自己チェックする。`;

export const JAPANESE_TRANSLATION_STRUCTURE_RULES = `【日本語訳の構造化ルール】
- japanese には最重要の訳を1つだけ入れる。複数語義を押し込まない。
- 意味が1つだけの単語は japanese のみを返し、translations は出力しない（出力トークン節約のためサーバー側で補完する）。
- 1つの英単語に複数の独立した意味がある場合のみ、translations に日本語訳を重要な順の文字列配列で入れる。
- "感覚;分別"、"感覚；分別"、"1. 感覚 2. 分別" のような並列語義は translations を2件に分ける。
- "感覚 [分別]"、"意味（平均）"、"見積もる/推定する" のように、括弧・角括弧・スラッシュ内の語が自然な日本語訳として単独で使える場合、それは訳注ではなく別の日本語訳として translations に分ける。
- 訳に文法情報・対象範囲・用法ラベル・メモ（「〜に」「〜を」「(~のことで)」「人を」「物が」「formal」「[U]」「反対語: ...」など）が付いている場合のみ、その訳をオブジェクト { "japanese": "純粋な日本語訳", "annotationRanges": ["取り除いた注記"] } にする。文字列とオブジェクトの混在は可。
- annotationRanges に日本語の別訳を入れてはいけない。単独で「〜する」「〜な」「名詞」として意味が成立する語、またはクイズの答えとして自然に使える語は必ず訳語（文字列またはオブジェクトの japanese）として入れる。
- annotationRanges に入れた文字列は japanese / translations の訳語には含めない。
- source と meaningRank は出力しない。訳の並び順がそのまま重要度になる。
- 例: "sense": "感覚;分別" → "japanese": "感覚", "translations": ["感覚", "分別"]
- 例: "sense": "感覚 [分別]" → "japanese": "感覚", "translations": ["感覚", "分別"]
- 例: "mean": "意味する（平均）" → "japanese": "意味する", "translations": ["意味する", "平均"]
- 例: "admire": "に(~のことで)敬服 [感心] する" → "japanese": "敬服する", "translations": [{"japanese": "敬服する", "annotationRanges": ["に(~のことで)"]}, "感心する"]
- annotationRanges はDB保存用の一時情報であり、保存時に custom section へ移すためだけに使われる。`;
