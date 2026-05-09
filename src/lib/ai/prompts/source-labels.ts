// System prompts for OpenAI API
// Centralized prompt management for consistency and easy updates

export const SOURCE_LABEL_RULES = `
2. 物理ソース名の判定:
   - この画像やテキストが由来する物理的な教材名だけを sourceLabels に入れてください。
   - アプリ内でユーザーが付ける単語帳名は推測してはいけません。
   - 特定の書籍名・教材名が読み取れる場合はその名前をそのまま入れてください（例: "鉄壁", "LEAP", "システム英単語", "速読英単語"）。
   - "英語教材" "教材" "参考書" "単語帳" "問題集" のような一般名詞は sourceLabels に入れてはいけません。必ず固有の書名だけを返してください。
   - 特定の書籍名が読み取れず、ノートや自作メモ由来と判断できる場合は "ノート" を入れてください。
   - 書籍名とノート要素の両方が確認できる場合は両方入れてください。
   - sourceLabels は重複なく返してください。`;

export const SOURCE_LABEL_OUTPUT_SNIPPET = `
  "sourceLabels": ["鉄壁"],
`;

export const SOURCE_LABEL_NOTES = `
- sourceLabels は物理教材名の配列です。アプリ内単語帳名は入れないでください。
- "英語教材" や "参考書" のような曖昧な一般名詞は禁止です。固有の書名が分かるなら必ず固有名で返してください。
- 画像やテキストから教材名を特定できずノート由来と判断できる場合は sourceLabels に ["ノート"] を入れてください。`;
