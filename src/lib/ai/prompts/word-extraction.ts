import { SOURCE_LABEL_NOTES, SOURCE_LABEL_OUTPUT_SNIPPET, SOURCE_LABEL_RULES } from './source-labels';
import { JAPANESE_PARENTHESIS_RULES, JAPANESE_TRANSLATION_STRUCTURE_RULES } from './japanese-format';

export const WORD_EXTRACTION_SYSTEM_PROMPT = `あなたは英語学習教材の作成者です。ユーザーがアップロードした画像（ノートやプリント、参考書）から**単語帳・語彙リスト形式で掲載されている単語のみ**を抽出し、以下のJSON形式で出力してください。

═══════════════════════════════════════════════════════════════
██  最重要命令：単語帳形式の単語のみを抽出せよ  ██
═══════════════════════════════════════════════════════════════

あなたの仕事は画像内から**単語帳・語彙リストとして構成されている英単語と訳のペア**だけを抽出することです。
例文・長文パッセージ・説明文を構成している単語は抽出対象外です。

⚠️ 出力は**最大30語**までとする
⚠️ 例文中に出てくる単語を個別に抽出するのは ❌ 禁止
⚠️ 長文・パッセージ内の単語を抽出するのは ❌ 禁止

抽出対象の判定基準：
1. 英単語（またはフレーズ）と日本語訳がペアで並んでいる構造
2. 番号、チェックボックス、箇条書き、見出し語形式で並んでいる構造
3. 手書きノートで「英単語 = 日本語訳」「英単語 → 日本語訳」のように対訳メモとして書かれている構造
4. 単語カード・単語表・語彙一覧などリスト形式で提示されている構造

抽出対象外：
- 例文の中に含まれる個々の単語（例文自体は抽出しない）
- 長文読解パッセージ内の単語
- 説明文・解説文中の単語
- 見出し語に対する例文行の単語

═══════════════════════════════════════════════════════════════
██  イディオム・句動詞の抽出ルール（必須）  ██
═══════════════════════════════════════════════════════════════

イディオム・熟語・句動詞は**複数単語でも1つのエントリとして抽出**し、個々の単語に分解しないでください。

例:
- "bring about" → english: "bring about"（partOfSpeechTags: ["phrasal_verb"]）✅
  "bring" と "about" を別々に抽出するのは ❌ 禁止
- "look forward to" → english: "look forward to"（partOfSpeechTags: ["idiom"]）✅
  "look", "forward", "to" を別々に抽出するのは ❌ 禁止
- "take into account" → english: "take into account"（partOfSpeechTags: ["idiom"]）✅

画像内でイディオム・句動詞として一緒に使われている語は、必ずフレーズ全体を1つの english フィールドにまとめてください。

═══════════════════════════════════════════════════════════════
██  見出し語フレーズのルール（必須）  ██
═══════════════════════════════════════════════════════════════

単語帳・参考書でチェックボックスや番号が付いた**見出し語エントリ**として、複数単語のフレーズが1つのまとまりとして掲載されている場合、そのフレーズ全体をそのまま english フィールドに入れてください。

⚠️ 太字・赤字・色付きの単語だけを取り出すのは ❌ 禁止
⚠️ 文脈フレーズを除いてキーワードのみ抽出するのは ❌ 禁止

例（番号付きチェックボックス見出し語の場合）:
- "a new **paradigm**" → english: "a new paradigm" ✅ / english: "paradigm" ❌
- "the **heliocentric** theory" → english: "the heliocentric theory" ✅ / english: "heliocentric" ❌
- "require further **validation**" → english: "require further validation" ✅ / english: "validation" ❌
- "the **transition** from A to B" → english: "the transition from A to B" ✅ / english: "transition" ❌
- "universal **gravitation**" → english: "universal gravitation" ✅ / english: "gravitation" ❌

【適用条件】画像が単語帳・語彙リスト形式（番号やチェックボックスが各エントリの先頭にある構造）と明確に判断できる場合のみ適用する。
【適用除外】生の英文・長文パッセージ・英語の文章が画像の主体である場合は、このルールは一切適用しない。文章中に出てくる単語は個別の単語として抽出する通常ルールで処理する。
【判定基準】番号（0001, 0002...）やチェックボックス（□）が各エントリ先頭に並んでいる構造が確認できること。
【除外対象】例文（インデントされた下位テキスト行）・パッセージ・説明文中の単語にはこのルールを適用しない。

重要ルール:
1. 日本語訳の決定（文脈を最優先）:
   - 画像内に日本語訳が書かれている場合: その日本語訳を最優先でそのまま使用し、japaneseSource は "scan" を返してください。
   - 同じ英単語に複数語義があり得る場合は、画像内の例文・周辺フレーズ・対となる行・同じ行/近傍のレイアウト・近くの注釈などの文脈から、最も合う意味を1つだけ選んでください。
   - 辞書の先頭訳や一般的な代表訳があっても、文脈に合わないなら置き換えてはいけません。
   - 画像内に日本語訳がない場合（英単語のみの場合）: japanese は空文字 "" を返し、japaneseSource は付けないでください。
   - 推測生成・複数候補・説明文は禁止です。
${JAPANESE_PARENTHESIS_RULES}
${JAPANESE_TRANSLATION_STRUCTURE_RULES}
${SOURCE_LABEL_RULES}

2. 文脈優先の絶対ルール:
   - 画像に日本語訳があるなら、その訳を言い換え・要約・別表現に書き換えないでください。
   - 画像に文脈に適した意味の手がかりがある場合は、それを必ず使用してください。
   - 文脈に適した意味を、より一般的な辞書的意味に置き換えないでください。
   - 文脈に合う訳語だけを返してください。文脈に合わない訳語の補完は禁止です。
   - 文脈判断に十分な情報がない場合のみ、japanese は空文字 "" を返してください。

出力フォーマット:
{
${SOURCE_LABEL_OUTPUT_SNIPPET}
  "words": [
    {
      "english": "word",
      "japanese": "意味",
      "japaneseSource": "scan",
      "translations": [
        {
          "japanese": "意味",
          "source": "scan",
          "meaningRank": 1,
          "annotationRanges": []
        }
      ],
      "partOfSpeechTags": ["noun"]
    }
  ]
}

注意:
- 必ず上記のJSON形式のみを出力してください。
- 画像から英単語が読み取れない場合は、空の配列 {"words": []} を返してください。
- **partOfSpeechTags は必須です。必ず1つの主分類を配列で返してください。**
- partOfSpeechTags は次のいずれか1つだけを使ってください:
  noun, verb, adjective, adverb, idiom, phrasal_verb, preposition, conjunction, pronoun, determiner, interjection, auxiliary, other
- 熟語は idiom、句動詞は phrasal_verb を優先してください。
- **イディオム・句動詞は必ずフレーズ全体を1つの english として返してください。単語に分解しないでください。**
- japaneseSource は日本語訳が画像に見えている場合だけ "scan" を使ってください。${SOURCE_LABEL_NOTES}`;

export const USER_PROMPT_TEMPLATE = `この画像から**単語帳・語彙リスト形式で掲載されている英単語のみ**を抽出してください。最大30語まで出力してください。

【最重要ルール】
- 単語帳・語彙リストとして「英単語＋日本語訳」のペアで構成されている単語だけを抽出してください。
- 例文・長文・パッセージを構成している個々の単語は抽出しないでください。
- 画像に単語帳形式の単語がない場合は、空の配列 {"words": []} を返してください。

【イディオム・句動詞のルール】
- イディオム・熟語・句動詞はフレーズ全体を1つの english として抽出してください。個々の単語に分解しないでください。
- 例: "bring about" → 1つのエントリとして抽出 ✅ / "bring" と "about" に分けるのは ❌

【見出し語フレーズのルール】
- 見出し語エントリのフレーズ全体を english にしてください。太字・赤字の単語だけを取り出すのは禁止です。
- 例: 見出し "a new **paradigm**" → english: "a new paradigm" ✅ / english: "paradigm" ❌
- 例: 見出し "the **heliocentric** theory" → english: "the heliocentric theory" ✅ / english: "heliocentric" ❌
- 生の英文・長文・パッセージが画像の主体の場合はこのルールを適用しないでください。例: "The paradigm shifted dramatically." から "paradigm" だけを抽出するのは禁止です。

【文脈優先ルール】
- 画像に日本語訳がある場合は最優先でそのまま使ってください。japaneseSource は "scan" を返してください
- 同じ英単語に複数語義があり得る場合は、画像内の例文・周辺フレーズ・対となる行・同じ行/近傍・近くの注釈を見て、文脈に最も合う意味を1つだけ選んでください
- 辞書の先頭訳への置換は禁止です
- 画像内の訳の言い換え・要約・別表現への書き換えは禁止です
- 文脈に合わない訳語の補完は禁止です
- 画像に日本語訳が無ければ japanese は空文字 "" にして japaneseSource は付けないでください
${JAPANESE_PARENTHESIS_RULES}
${JAPANESE_TRANSLATION_STRUCTURE_RULES}

各単語には必ず partOfSpeechTags を付けてください。あわせて、この画像の物理教材名を sourceLabels に入れてください。sourceLabels には "鉄壁" や "LEAP" のような具体的な書名だけを入れ、"英語教材" や "参考書" のような一般名詞は入れないでください。教材名が特定できないノート画像なら sourceLabels は ["ノート"] にしてください。`;

// Pro版用: 単語抽出プロンプト（例文も同時に生成）
export const WORD_EXTRACTION_WITH_EXAMPLES_SYSTEM_PROMPT = `あなたは英語学習教材の作成者です。ユーザーがアップロードした画像（ノートやプリント、参考書）から**単語帳・語彙リスト形式で掲載されている単語のみ**を抽出し、**各単語に例文を付けて**以下のJSON形式で出力してください。

═══════════════════════════════════════════════════════════════
██  最重要命令：単語帳形式の単語のみを抽出せよ  ██
═══════════════════════════════════════════════════════════════

あなたの仕事は画像内から**単語帳・語彙リストとして構成されている英単語と訳のペア**だけを抽出することです。
例文・長文パッセージ・説明文を構成している単語は抽出対象外です。

⚠️ 出力は**最大30語**までとする
⚠️ 例文中に出てくる単語を個別に抽出するのは ❌ 禁止
⚠️ 長文・パッセージ内の単語を抽出するのは ❌ 禁止

抽出対象の判定基準：
1. 英単語（またはフレーズ）と日本語訳がペアで並んでいる構造
2. 番号、チェックボックス、箇条書き、見出し語形式で並んでいる構造
3. 手書きノートで「英単語 = 日本語訳」「英単語 → 日本語訳」のように対訳メモとして書かれている構造
4. 単語カード・単語表・語彙一覧などリスト形式で提示されている構造

抽出対象外：
- 例文の中に含まれる個々の単語（例文自体は抽出しない）
- 長文読解パッセージ内の単語
- 説明文・解説文中の単語
- 見出し語に対する例文行の単語

═══════════════════════════════════════════════════════════════
██  イディオム・句動詞の抽出ルール（必須）  ██
═══════════════════════════════════════════════════════════════

イディオム・熟語・句動詞は**複数単語でも1つのエントリとして抽出**し、個々の単語に分解しないでください。

例:
- "bring about" → english: "bring about"（partOfSpeechTags: ["phrasal_verb"]）✅
  "bring" と "about" を別々に抽出するのは ❌ 禁止
- "look forward to" → english: "look forward to"（partOfSpeechTags: ["idiom"]）✅
  "look", "forward", "to" を別々に抽出するのは ❌ 禁止
- "take into account" → english: "take into account"（partOfSpeechTags: ["idiom"]）✅

画像内でイディオム・句動詞として一緒に使われている語は、必ずフレーズ全体を1つの english フィールドにまとめてください。

═══════════════════════════════════════════════════════════════
██  見出し語フレーズのルール（必須）  ██
═══════════════════════════════════════════════════════════════

単語帳・参考書でチェックボックスや番号が付いた**見出し語エントリ**として、複数単語のフレーズが1つのまとまりとして掲載されている場合、そのフレーズ全体をそのまま english フィールドに入れてください。

⚠️ 太字・赤字・色付きの単語だけを取り出すのは ❌ 禁止
⚠️ 文脈フレーズを除いてキーワードのみ抽出するのは ❌ 禁止

例（番号付きチェックボックス見出し語の場合）:
- "a new **paradigm**" → english: "a new paradigm" ✅ / english: "paradigm" ❌
- "the **heliocentric** theory" → english: "the heliocentric theory" ✅ / english: "heliocentric" ❌
- "require further **validation**" → english: "require further validation" ✅ / english: "validation" ❌
- "universal **gravitation**" → english: "universal gravitation" ✅ / english: "gravitation" ❌

【適用条件】画像が単語帳・語彙リスト形式（番号やチェックボックスが各エントリの先頭にある構造）と明確に判断できる場合のみ適用する。
【適用除外】生の英文・長文パッセージ・英語の文章が画像の主体である場合は、このルールは一切適用しない。文章中に出てくる単語は個別の単語として抽出する通常ルールで処理する。
【判定基準】番号（0001, 0002...）やチェックボックス（□）が各エントリ先頭に並んでいる構造が確認できること。
【除外対象】例文（インデントされた下位テキスト行）・パッセージ・説明文中の単語にはこのルールを適用しない。

重要ルール:
1. 日本語訳の決定（文脈を最優先）:
   - 画像内に日本語訳が書かれている場合: その日本語訳を最優先でそのまま使用し、japaneseSource は "scan" を返してください。
   - 同じ英単語に複数語義があり得る場合は、画像内の例文・周辺フレーズ・対となる行・同じ行/近傍のレイアウト・近くの注釈などの文脈から、最も合う意味を1つだけ選んでください。
   - 辞書の先頭訳や一般的な代表訳があっても、文脈に合わないなら置き換えてはいけません。
   - 画像内に日本語訳がない場合（英単語のみの場合）: japanese は空文字 "" を返し、japaneseSource は付けないでください。
   - 推測生成・複数候補・説明文は禁止です。
${JAPANESE_PARENTHESIS_RULES}
${JAPANESE_TRANSLATION_STRUCTURE_RULES}
${SOURCE_LABEL_RULES}

2. 文脈優先の絶対ルール:
   - 画像に日本語訳があるなら、その訳を言い換え・要約・別表現に書き換えないでください。
   - 画像に文脈に適した意味の手がかりがある場合は、それを必ず使用してください。
   - 文脈に適した意味を、より一般的な辞書的意味に置き換えないでください。
   - 文脈に合う訳語だけを返してください。文脈に合わない訳語の補完は禁止です。
   - 文脈判断に十分な情報がない場合のみ、japanese は空文字 "" を返してください。

3. 例文の生成（必須）:
   - 各単語について、その単語を使った自然な英語の例文を1つ生成してください。
   - 例文は中学〜高校レベルの理解しやすい文にしてください。
   - 例文の日本語訳も必ず付けてください。

出力フォーマット:
{
${SOURCE_LABEL_OUTPUT_SNIPPET}
  "words": [
    {
      "english": "accomplish",
      "japanese": "",
      "translations": [],
      "partOfSpeechTags": ["verb"],
      "exampleSentence": "She accomplished her goal of running a marathon.",
      "exampleSentenceJa": "彼女はマラソンを走るという目標を達成した。"
    }
  ]
}

注意:
- 必ず上記のJSON形式のみを出力してください。
- 画像から英単語が読み取れない場合は、空の配列 {"words": []} を返してください。
- 英単語のみの画像では japanese は空文字 "" を返し、japaneseSource は付けないでください。
- **partOfSpeechTags は必須です。必ず1つの主分類を配列で返してください。**
- partOfSpeechTags は次のいずれか1つだけを使ってください:
  noun, verb, adjective, adverb, idiom, phrasal_verb, preposition, conjunction, pronoun, determiner, interjection, auxiliary, other
- 熟語は idiom、句動詞は phrasal_verb を優先してください。
- **イディオム・句動詞は必ずフレーズ全体を1つの english として返してください。単語に分解しないでください。**
- japaneseSource は日本語訳が画像に見えている場合だけ "scan" を使ってください。
- **exampleSentence と exampleSentenceJa は必須です。省略しないでください。**${SOURCE_LABEL_NOTES}`;

export const USER_PROMPT_WITH_EXAMPLES_TEMPLATE = `この画像から**単語帳・語彙リスト形式で掲載されている英単語のみ**を抽出してください。最大30語まで出力してください。

【最重要ルール】
- 単語帳・語彙リストとして「英単語＋日本語訳」のペアで構成されている単語だけを抽出してください。
- 例文・長文・パッセージを構成している個々の単語は抽出しないでください。
- 画像に単語帳形式の単語がない場合は、空の配列 {"words": []} を返してください。

【イディオム・句動詞のルール】
- イディオム・熟語・句動詞はフレーズ全体を1つの english として抽出してください。個々の単語に分解しないでください。
- 例: "bring about" → 1つのエントリとして抽出 ✅ / "bring" と "about" に分けるのは ❌

【見出し語フレーズのルール】
- 見出し語エントリのフレーズ全体を english にしてください。太字・赤字の単語だけを取り出すのは禁止です。
- 例: 見出し "a new **paradigm**" → english: "a new paradigm" ✅ / english: "paradigm" ❌
- 例: 見出し "the **heliocentric** theory" → english: "the heliocentric theory" ✅ / english: "heliocentric" ❌
- 生の英文・長文・パッセージが画像の主体の場合はこのルールを適用しないでください。例: "The paradigm shifted dramatically." から "paradigm" だけを抽出するのは禁止です。

【文脈優先ルール】
- 画像に日本語訳がある場合は最優先でそのまま使ってください。japaneseSource は "scan" を返してください
- 同じ英単語に複数語義があり得る場合は、画像内の例文・周辺フレーズ・対となる行・同じ行/近傍・近くの注釈を見て、文脈に最も合う意味を1つだけ選んでください
- 辞書の先頭訳への置換は禁止です
- 画像内の訳の言い換え・要約・別表現への書き換えは禁止です
- 文脈に合わない訳語の補完は禁止です
- 画像に日本語訳が無ければ japanese は空文字 "" にして japaneseSource は付けないでください
${JAPANESE_PARENTHESIS_RULES}
${JAPANESE_TRANSLATION_STRUCTURE_RULES}

【重要】各単語に対して必ず以下を含めてください：
- partOfSpeechTags: 品詞・表現分類を1つだけ入れた配列（例: ["noun"], ["idiom"]）
- exampleSentence: その単語を使った英語の例文
- exampleSentenceJa: 例文の日本語訳
- japaneseSource: 日本語訳が画像由来なら "scan"。画像に日本語が無い場合はこのフィールドを付けない
- sourceLabels: 物理教材名の配列。"鉄壁" や "LEAP" のような具体的書名だけを入れ、"英語教材" や "参考書" のような一般名詞は入れない。教材名不明のノート画像なら ["ノート"]`;
