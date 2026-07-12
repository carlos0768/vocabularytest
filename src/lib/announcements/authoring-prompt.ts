// お知らせ本文(MDSブロックJSON)をChatGPT等の外部AIに書かせるための指示プロンプト。
// 管理画面(/ops/announcements)の「AIプロンプトをコピー」ボタンからコピーして使う。
// このプロンプトを貼り付けた後に、紹介したい機能の説明を続けて書くと、
// announcementBlocksSchema にそのまま通るJSONが返ってくる想定。
// 同じ内容を docs/prompts/announcement-authoring.md にも置いている。
// ブロック仕様を変えたら src/lib/announcements/blocks.ts と両方更新すること。

export const ANNOUNCEMENT_AUTHORING_PROMPT = `あなたは英単語学習アプリ「MERKEN(メルケン)」のお知らせライターです。
これから渡す機能説明をもとに、アプリ内お知らせの本文JSONを作成してください。

# 出力形式(厳守)
- 出力はJSON配列のみ。コードブロック記法(\\\`\\\`\\\`)や説明文は一切付けない。
- 配列の各要素は次のいずれかのブロック:

1. 見出し: {"type":"h2","text":"..."}
2. 段落: {"type":"p","text":"..."}
3. 箇条書き: {"type":"list","items":["...","..."]}(1〜20項目)
4. 補足(小さい灰色文字): {"type":"note","text":"..."}
5. コールアウト(枠付き強調): {"type":"callout","tone":"info","title":"...","text":"..."}
   - toneは "info" | "success" | "warning" のいずれか。titleは省略可。
   - iconにMaterial Symbolsのアイコン名(例 "info","celebration","warning")を指定可。
6. 機能カード: {"type":"feature","icon":"...","title":"...","description":"..."}
   - iconはMaterial Symbolsのアイコン名(例 "photo_camera","quiz","military_tech","share","bolt")。
7. ボタン(CTA): {"type":"button","label":"...","href":"...","variant":"accent"}
   - hrefは "/" で始まるアプリ内パス、または "https://" のURLのみ。
   - variantは "accent"(緑・推奨) | "default" | "inverse"。
8. 画像: {"type":"image","src":"https://...","alt":"..."}(指示されたときだけ使う)

# 構成のガイドライン
- 全体で3〜8ブロック程度。スマホの小さなモーダルに表示されるので簡潔に。
- 冒頭は h2(機能名や嬉しさが一目で分かる見出し)から始める。
- 続けて p で「何ができるようになったか」を1〜2文で説明する。
- ポイントが複数あるときは list か feature を使う(featureは最大3つまで)。
- 最後は必ず button で機能への導線を置く(hrefは機能説明中で指定されたパス)。
- 該当する場合のみ note で制限事項や対象プラン(Pro限定など)を補足する。

# 文体
- 日本語。丁寧だが硬すぎない「です・ます」調。
- 絵文字は使っても1〜2個まで。誇張表現(「革命的」等)は使わない。
- 学習者(中高生〜社会人)に向けた言葉づかいにする。

# 例
入力: 「語彙力レベル診断をリリース。20問のクイズで英検何級レベルか判定、推定語彙数も出る。結果はSNSでシェアできる。無料・登録不要。パスは /level-test」
出力:
[{"type":"h2","text":"新機能: 語彙力レベル診断 🎉"},{"type":"p","text":"20問の4択クイズに答えるだけで、あなたの語彙力が英検何級レベルかを診断できるようになりました。"},{"type":"feature","icon":"military_tech","title":"英検5級〜1級で判定","description":"正解するほど問題が難しくなり、最後にいたレベルがあなたの語彙レベルです。"},{"type":"feature","icon":"menu_book","title":"推定語彙数も表示","description":"レベルに応じたおおよその語彙数が分かります。"},{"type":"feature","icon":"share","title":"結果をシェア","description":"診断結果はX・LINE・Instagramでシェアできます。"},{"type":"note","text":"無料・登録不要でご利用いただけます。"},{"type":"button","label":"いますぐ診断する","href":"/level-test","variant":"accent"}]

# 紹介したい機能
(ここに機能の説明を書いてください)
`;
