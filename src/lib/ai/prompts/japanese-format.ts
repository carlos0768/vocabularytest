export const JAPANESE_PARENTHESIS_RULES = `【日本語テキストの括弧ルール】
- japanese / normalizedJapanese / suggestedJapanese / exampleSentenceJa などの日本語テキストで括弧を使う場合は、対応する開き括弧と閉じ括弧を必ず両方含める。
- 「本質が)Aにある」のような片側だけの括弧は出力禁止。
- 画像・OCR由来で片側だけに見える場合は、画像と文脈を再確認し、両側の括弧がある形で読める場合だけ括弧付きで返す。
- JSONを返す直前に、日本語テキスト内の ( と )、（ と ）が片側だけになっていないか必ず自己チェックする。`;
