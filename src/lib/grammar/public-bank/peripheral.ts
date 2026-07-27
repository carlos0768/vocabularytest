// 周辺・統合分野 (大単元15〜26) の公開問題バンク。
// 収録方針とライセンスは ../sources.ts を参照。

import type { PublicGrammarQuestion } from './types';

const WB = 'cc-by-digital-workbook-esol';
const AA = 'cc-by-advanced-academic-grammar';
const PD = 'pd-1001-questions';

export const PERIPHERAL_QUESTIONS: PublicGrammarQuestion[] = [
  // ---- 名詞構文と無生物主語 ----
  {
    id: 'pg-nominal-noun-1', nodeId: 'nominal-noun',
    sentence: 'On his ___ home, he found a letter on the desk.',
    choices: ['return', 'returning to', 'returned', 'come back'], correctIndex: 0,
    explanation: '「帰宅したとき」を名詞構文 on his return で表す。動詞を名詞化する典型例。',
    sentenceJa: '帰宅したとき、彼は机の上に手紙を見つけた。', sourceId: AA,
  },
  {
    id: 'pg-nominal-noun-2', nodeId: 'nominal-noun',
    sentence: 'He has a good ___ of Japanese history.',
    choices: ['knowledge', 'know', 'knowing', 'known'], correctIndex: 0,
    explanation: 'know を名詞化した knowledge を使う名詞構文。「よく知っている」の意味。',
    sentenceJa: '彼は日本史をよく知っている。', sourceId: PD,
  },
  {
    id: 'pg-nominal-inanimate-1', nodeId: 'nominal-inanimate',
    sentence: 'This medicine will ___ you feel much better.',
    choices: ['make', 'take', 'give', 'let'], correctIndex: 0,
    explanation: '無生物主語 + make + O + 原形で「〜のおかげでOは…する」。',
    sentenceJa: 'この薬を飲めば、ずっと気分が良くなるでしょう。', sourceId: AA,
  },
  {
    id: 'pg-nominal-inanimate-2', nodeId: 'nominal-inanimate',
    sentence: 'The scholarship ___ her to study abroad.',
    choices: ['enabled', 'became', 'made', 'let'], correctIndex: 0,
    explanation: 'enable O to do は無生物主語構文の定番。「〜のおかげでOは…できた」。',
    sentenceJa: '奨学金のおかげで彼女は留学できた。', sourceId: AA,
  },

  // ---- 強調・倒置・省略・同格 ----
  {
    id: 'pg-emphasis-cleft-1', nodeId: 'emphasis-cleft',
    sentence: 'It was in this park ___ I first met her.',
    choices: ['that', 'which', 'when', 'what'], correctIndex: 0,
    explanation: '強調構文 It is ~ that ...。副詞句を強調する場合も that を使う。',
    sentenceJa: '私が初めて彼女に会ったのはこの公園でだった。', sourceId: AA,
  },
  {
    id: 'pg-emphasis-cleft-2', nodeId: 'emphasis-cleft',
    sentence: 'It was not until yesterday ___ I heard the news.',
    choices: ['that', 'when', 'which', 'than'], correctIndex: 0,
    explanation: 'It is not until ~ that ... で「〜して初めて…する」。',
    sentenceJa: '昨日になって初めてその知らせを聞いた。', sourceId: AA,
  },
  {
    id: 'pg-emphasis-inversion-1', nodeId: 'emphasis-inversion',
    sentence: 'Never ___ such a beautiful sunset.',
    choices: ['have I seen', 'I have seen', 'I saw', 'did I saw'], correctIndex: 0,
    explanation: '否定語を文頭に置くと主語と助動詞が倒置する。',
    sentenceJa: 'あれほど美しい夕日は見たことがない。', sourceId: AA,
  },
  {
    id: 'pg-emphasis-inversion-2', nodeId: 'emphasis-inversion',
    sentence: '"I am tired." "___ am I."',
    choices: ['So', 'Neither', 'Either', 'As'], correctIndex: 0,
    explanation: '肯定に同意するときは So + 助動詞 + 主語。否定なら Neither。',
    sentenceJa: '「疲れたよ」「私もだ」', sourceId: WB,
  },
  {
    id: 'pg-emphasis-apposition-1', nodeId: 'emphasis-apposition',
    sentence: 'The fact ___ he lied shocked everyone.',
    choices: ['that', 'which', 'what', 'of which'], correctIndex: 0,
    explanation: '前の名詞の内容を説明する同格の that。節が完全な文である点が関係代名詞と異なる。',
    sentenceJa: '彼が嘘をついたという事実は皆を驚かせた。', sourceId: AA,
  },
  {
    id: 'pg-emphasis-apposition-2', nodeId: 'emphasis-apposition',
    sentence: 'He is, ___ I know, an honest man.',
    choices: ['as far as', 'as long as', 'so that', 'even if'], correctIndex: 0,
    explanation: '挿入的に使う as far as I know は「私の知る限り」。',
    sentenceJa: '私の知る限り、彼は正直な人だ。', sourceId: PD,
  },

  // ---- 名詞 ----
  {
    id: 'pg-noun-count-1', nodeId: 'noun-count',
    sentence: 'He gave me some useful ___ about the exam.',
    choices: ['advice', 'advices', 'an advice', 'advice s'], correctIndex: 0,
    explanation: 'advice は不可算名詞なので複数形にせず、a も付けない。',
    sentenceJa: '彼は試験について有益な助言をくれた。', sourceId: WB,
  },
  {
    id: 'pg-noun-count-2', nodeId: 'noun-count',
    sentence: 'We need to buy a new piece of ___ for the office.',
    choices: ['furniture', 'furnitures', 'a furniture', 'the furnitures'], correctIndex: 0,
    explanation: 'furniture は不可算。数えるときは a piece of furniture のように単位表現を使う。',
    sentenceJa: 'オフィス用に家具を1つ買う必要がある。', sourceId: WB,
  },
  {
    id: 'pg-noun-plural-1', nodeId: 'noun-plural',
    sentence: 'It is about ten ___ walk from the station.',
    choices: ["minutes'", 'minutes', 'minute', "minute's"], correctIndex: 0,
    explanation: '複数形の所有格はアポストロフィだけを付ける。ten minutes\' walk で「徒歩10分」。',
    sentenceJa: '駅から歩いて10分ほどです。', sourceId: PD,
  },
  {
    id: 'pg-noun-plural-2', nodeId: 'noun-plural',
    sentence: 'The ___ of this country are very polite.',
    choices: ['people', 'peoples', 'person', 'peoples all'], correctIndex: 0,
    explanation: 'people は「人々」の意味では複数扱いの集合名詞。peoples は「諸民族」の意味。',
    sentenceJa: 'この国の人々はとても礼儀正しい。', sourceId: PD,
  },

  // ---- 冠詞・限定詞 ----
  {
    id: 'pg-article-basic-1', nodeId: 'article-basic',
    sentence: 'I saw a dog. ___ dog was running fast.',
    choices: ['The', 'A', 'An', 'One'], correctIndex: 0,
    explanation: '一度話に出たものを再び指すときは定冠詞 the。',
    sentenceJa: '犬を見た。その犬は速く走っていた。', sourceId: WB,
  },
  {
    id: 'pg-article-basic-2', nodeId: 'article-basic',
    sentence: 'She plays ___ violin very well.',
    choices: ['the', 'a', 'an', 'one'], correctIndex: 0,
    explanation: '楽器を演奏するという意味では原則 the を付ける。',
    sentenceJa: '彼女はバイオリンをとても上手に弾く。', sourceId: WB,
  },
  {
    id: 'pg-article-meaning-1', nodeId: 'article-meaning',
    sentence: 'My son goes to ___ school by bus every day.',
    choices: ['(無冠詞)', 'the', 'a', 'an'], correctIndex: 0,
    explanation: '本来の目的（授業を受ける）で通う場合は無冠詞。建物を指すなら the school。',
    sentenceJa: '息子は毎日バスで学校に通っている。', sourceId: AA,
  },
  {
    id: 'pg-article-meaning-2', nodeId: 'article-meaning',
    sentence: 'He was taken to ___ hospital after the accident.',
    choices: ['(無冠詞)', 'a the', 'an', 'those'], correctIndex: 0,
    explanation: '治療を受ける目的で入院する場合は無冠詞（英）。建物としてなら the hospital。',
    sentenceJa: '事故の後、彼は病院に運ばれた。', sourceId: AA,
  },
  {
    id: 'pg-article-determiner-1', nodeId: 'article-determiner',
    sentence: '___ of the two brothers is a doctor.',
    choices: ['Each', 'Every', 'All', 'Both is'], correctIndex: 0,
    explanation: 'each of + 複数名詞は単数扱い。every は of を伴えない。',
    sentenceJa: 'その2人の兄弟はそれぞれ医者だ。', sourceId: AA,
  },
  {
    id: 'pg-article-determiner-2', nodeId: 'article-determiner',
    sentence: 'I have two pens, but ___ of them works.',
    choices: ['neither', 'either', 'none', 'both'], correctIndex: 0,
    explanation: '2つのうち「どちらも〜ない」は neither。3つ以上なら none。',
    sentenceJa: 'ペンを2本持っているが、どちらも書けない。', sourceId: AA,
  },

  // ---- 代名詞 ----
  {
    id: 'pg-pronoun-person-1', nodeId: 'pronoun-person',
    sentence: 'She finished the report all by ___.',
    choices: ['herself', 'her', 'hers', 'she'], correctIndex: 0,
    explanation: 'by oneself は「独力で」。主語と同一人物を指すので再帰代名詞。',
    sentenceJa: '彼女は独力でその報告書を仕上げた。', sourceId: WB,
  },
  {
    id: 'pg-pronoun-person-2', nodeId: 'pronoun-person',
    sentence: 'This umbrella is not mine. It must be ___.',
    choices: ['his', 'him', 'he', "he's"], correctIndex: 0,
    explanation: '「彼のもの」は所有代名詞 his。目的格 him とは働きが違う。',
    sentenceJa: 'この傘は私のではない。彼のにちがいない。', sourceId: WB,
  },
  {
    id: 'pg-pronoun-it-1', nodeId: 'pronoun-it',
    sentence: 'I found ___ difficult to finish the work in a day.',
    choices: ['it', 'that', 'this', 'them'], correctIndex: 0,
    explanation: '〈find + it + 形容詞 + to do〉の形式目的語 it。',
    sentenceJa: '私はその仕事を1日で終えるのは難しいと分かった。', sourceId: AA,
  },
  {
    id: 'pg-pronoun-it-2', nodeId: 'pronoun-it',
    sentence: '___ takes about an hour to get there by car.',
    choices: ['It', 'That', 'There', 'This'], correctIndex: 0,
    explanation: '所要時間を表す It takes ~ to do の it。天候・時間・距離の it の一種。',
    sentenceJa: '車でそこまで1時間ほどかかる。', sourceId: WB,
  },
  {
    id: 'pg-pronoun-other-1', nodeId: 'pronoun-other',
    sentence: 'I have two cats. One is white and ___ is black.',
    choices: ['the other', 'another', 'other', 'others'], correctIndex: 0,
    explanation: '2つのうち残り1つは the other。不特定の「もう1つ」は another。',
    sentenceJa: '猫を2匹飼っている。1匹は白で、もう1匹は黒だ。', sourceId: AA,
  },
  {
    id: 'pg-pronoun-other-2', nodeId: 'pronoun-other',
    sentence: 'This cup is dirty. Could you bring me ___ ?',
    choices: ['another', 'the other', 'other', 'others'], correctIndex: 0,
    explanation: '不特定の「別のもう1つ」は another（an + other）。',
    sentenceJa: 'このカップは汚れています。別のを持ってきてもらえますか。', sourceId: WB,
  },

  // ---- 形容詞 ----
  {
    id: 'pg-adjective-use-1', nodeId: 'adjective-use',
    sentence: 'The baby is ___ in the next room.',
    choices: ['asleep', 'sleeping child', 'assleep', 'the asleep'], correctIndex: 0,
    explanation: 'asleep, alive, awake などの a- で始まる形容詞は叙述用法のみで、名詞の前に置けない。',
    sentenceJa: '赤ちゃんは隣の部屋で眠っている。', sourceId: PD,
  },
  {
    id: 'pg-adjective-use-2', nodeId: 'adjective-use',
    sentence: 'She is ___ of making mistakes in public.',
    choices: ['afraid', 'afraid to be', 'fear', 'scare'], correctIndex: 0,
    explanation: 'be afraid of doing で「〜するのを恐れる」。afraid も叙述用法の形容詞。',
    sentenceJa: '彼女は人前で間違えるのを恐れている。', sourceId: AA,
  },
  {
    id: 'pg-adjective-usage-1', nodeId: 'adjective-usage',
    sentence: 'There is ___ water left in the bottle.',
    choices: ['little', 'few', 'a few', 'many'], correctIndex: 0,
    explanation: '不可算名詞には little / a little、可算名詞には few / a few。little は「ほとんどない」。',
    sentenceJa: 'ボトルにはほとんど水が残っていない。', sourceId: WB,
  },
  {
    id: 'pg-adjective-usage-2', nodeId: 'adjective-usage',
    sentence: 'The lecture was ___; everyone looked sleepy.',
    choices: ['boring', 'bored', 'bore', 'to bore'], correctIndex: 0,
    explanation: '物事が「退屈させる」側なら現在分詞由来の boring、人が「退屈する」側なら bored。',
    sentenceJa: 'その講義は退屈で、皆眠そうだった。', sourceId: WB,
  },

  // ---- 副詞 ----
  {
    id: 'pg-adverb-position-1', nodeId: 'adverb-position',
    sentence: 'He has ___ finished his lunch.',
    choices: ['already', 'yet', 'still not', 'ago'], correctIndex: 0,
    explanation: 'already は肯定文で「すでに」。頻度・完了の副詞は助動詞と本動詞の間に置く。',
    sentenceJa: '彼はもう昼食を終えた。', sourceId: WB,
  },
  {
    id: 'pg-adverb-position-2', nodeId: 'adverb-position',
    sentence: 'I ___ missed the last train.',
    choices: ['almost', 'mostly', 'most', 'hardly'], correctIndex: 0,
    explanation: 'almost は「もう少しで〜するところだった」。most は「最も」で意味が違う。',
    sentenceJa: '私はもう少しで終電を逃すところだった。', sourceId: AA,
  },
  {
    id: 'pg-adverb-connective-1', nodeId: 'adverb-connective',
    sentence: 'It was raining hard. ___, the game was not canceled.',
    choices: ['However', 'Therefore', 'Moreover', 'Thus'], correctIndex: 0,
    explanation: 'however は逆接の接続副詞。文と文をつなぐが接続詞ではないので句読点に注意。',
    sentenceJa: '激しく雨が降っていた。しかし試合は中止されなかった。', sourceId: AA,
  },
  {
    id: 'pg-adverb-connective-2', nodeId: 'adverb-connective',
    sentence: '___, he passed the entrance examination.',
    choices: ['Fortunately', 'Fortunate', 'Fortune', 'To fortune'], correctIndex: 0,
    explanation: '文全体を修飾する文修飾副詞。話し手の判断を表す。',
    sentenceJa: '幸運にも、彼は入学試験に合格した。', sourceId: AA,
  },

  // ---- 前置詞 ----
  {
    id: 'pg-preposition-basic-1', nodeId: 'preposition-basic',
    sentence: 'The meeting will be held ___ Monday morning.',
    choices: ['on', 'in', 'at', 'to'], correctIndex: 0,
    explanation: '特定の日・曜日には on。月・年には in、時刻には at。',
    sentenceJa: '会議は月曜の朝に開かれる。', sourceId: WB,
  },
  {
    id: 'pg-preposition-basic-2', nodeId: 'preposition-basic',
    sentence: 'I will finish the report ___ Friday at the latest.',
    choices: ['by', 'until', 'till', 'in'], correctIndex: 0,
    explanation: 'by は「〜までに」という期限、until は「〜までずっと」という継続。',
    sentenceJa: '遅くとも金曜までに報告書を仕上げます。', sourceId: AA,
  },
  {
    id: 'pg-preposition-phrase-1', nodeId: 'preposition-phrase',
    sentence: '___ to the report, sales increased by ten percent.',
    choices: ['According', 'Depending', 'Owing', 'Regarding'], correctIndex: 0,
    explanation: 'according to は「〜によれば」という群前置詞。',
    sentenceJa: 'その報告によれば、売上は10パーセント伸びた。', sourceId: AA,
  },
  {
    id: 'pg-preposition-phrase-2', nodeId: 'preposition-phrase',
    sentence: 'The project was canceled ___ to a lack of funds.',
    choices: ['due', 'because', 'thanks', 'according'], correctIndex: 0,
    explanation: 'due to は「〜が原因で」。because は接続詞なので後ろに節が必要。',
    sentenceJa: '資金不足のためそのプロジェクトは中止された。', sourceId: AA,
  },

  // ---- 接続詞 ----
  {
    id: 'pg-conjunction-coordinate-1', nodeId: 'conjunction-coordinate',
    sentence: 'Not only he but also his sisters ___ invited to the party.',
    choices: ['were', 'was', 'is', 'has been'], correctIndex: 0,
    explanation: 'not only A but also B が主語のとき、動詞は B に一致する。',
    sentenceJa: '彼だけでなく姉妹たちもパーティーに招待された。', sourceId: AA,
  },
  {
    id: 'pg-conjunction-coordinate-2', nodeId: 'conjunction-coordinate',
    sentence: 'Hurry up, ___ you will miss the bus.',
    choices: ['or', 'and', 'but', 'so'], correctIndex: 0,
    explanation: '〈命令文 + or〉で「さもないと」。and なら「そうすれば」。',
    sentenceJa: '急ぎなさい、さもないとバスに乗り遅れるよ。', sourceId: WB,
  },
  {
    id: 'pg-conjunction-clause-1', nodeId: 'conjunction-clause',
    sentence: '___ he was tired, he kept working until midnight.',
    choices: ['Although', 'Despite', 'In spite of', 'However'], correctIndex: 0,
    explanation: 'although は接続詞で後ろに節をとる。despite / in spite of は前置詞句で名詞をとる。',
    sentenceJa: '疲れていたが、彼は真夜中まで働き続けた。', sourceId: AA,
  },
  {
    id: 'pg-conjunction-clause-2', nodeId: 'conjunction-clause',
    sentence: 'I am not sure ___ he will accept our offer.',
    choices: ['whether', 'that', 'which', 'what'], correctIndex: 0,
    explanation: '「〜かどうか」という名詞節は whether / if。ここは be sure に続く形。',
    sentenceJa: '彼が私たちの申し出を受けるかどうか分からない。', sourceId: AA,
  },

  // ---- 語法 ----
  {
    id: 'pg-usage-verb-1', nodeId: 'usage-verb',
    sentence: 'A serious problem ___ during the discussion.',
    choices: ['arose', 'raised', 'rose up', 'aroused'], correctIndex: 0,
    explanation: 'arise は「（問題などが）生じる」の自動詞。raise は「〜を上げる」の他動詞。',
    sentenceJa: '議論の途中で深刻な問題が生じた。', sourceId: AA,
  },
  {
    id: 'pg-usage-verb-2', nodeId: 'usage-verb',
    sentence: 'Please ___ me know when you arrive.',
    choices: ['let', 'make', 'have to', 'allow'], correctIndex: 0,
    explanation: 'let + O + 原形で「Oに〜させてやる」。allow なら to do が必要。',
    sentenceJa: '着いたら知らせてください。', sourceId: PD,
  },
  {
    id: 'pg-usage-verbal-1', nodeId: 'usage-verbal',
    sentence: 'This museum is well worth ___.',
    choices: ['visiting', 'to visit', 'visited', 'to visiting'], correctIndex: 0,
    explanation: 'be worth doing で「〜する価値がある」。to 不定詞は使えない。',
    sentenceJa: 'この博物館は訪れる価値が十分にある。', sourceId: AA,
  },
  {
    id: 'pg-usage-verbal-2', nodeId: 'usage-verbal',
    sentence: 'They persuaded him ___ his mind.',
    choices: ['to change', 'change', 'changing', 'changed'], correctIndex: 0,
    explanation: 'persuade O to do で「Oを説得して〜させる」。',
    sentenceJa: '彼らは彼を説得して考えを変えさせた。', sourceId: AA,
  },
  {
    id: 'pg-usage-adjective-1', nodeId: 'usage-adjective',
    sentence: 'He is quite ___ of doing the job by himself.',
    choices: ['capable', 'able', 'possible', 'available'], correctIndex: 0,
    explanation: 'be capable of doing。be able to do とは続く形が異なる。',
    sentenceJa: '彼はその仕事を一人でこなす能力が十分にある。', sourceId: AA,
  },
  {
    id: 'pg-usage-adjective-2', nodeId: 'usage-adjective',
    sentence: 'The number of applicants ___ increasing every year.',
    choices: ['is', 'are', 'have been', 'were'], correctIndex: 0,
    explanation: 'the number of ~ は「〜の数」で単数扱い。a number of ~ なら複数扱い。',
    sentenceJa: '応募者の数は毎年増えている。', sourceId: AA,
  },
  {
    id: 'pg-usage-agreement-1', nodeId: 'usage-agreement',
    sentence: 'Each of the students ___ a different opinion.',
    choices: ['has', 'have', 'are having', 'were having'], correctIndex: 0,
    explanation: 'each of + 複数名詞は単数扱いなので動詞も単数形。',
    sentenceJa: '生徒たちはそれぞれ違う意見を持っている。', sourceId: AA,
  },
  {
    id: 'pg-usage-agreement-2', nodeId: 'usage-agreement',
    sentence: 'She speaks English better than I ___.',
    choices: ['do', 'am', 'does', 'have'], correctIndex: 0,
    explanation: '一般動詞の繰り返しを避ける代動詞 do。主語 I に合わせる。',
    sentenceJa: '彼女は私より英語を上手に話す。', sourceId: PD,
  },

  // ---- イディオムと会話表現 ----
  {
    id: 'pg-idiom-verb-1', nodeId: 'idiom-verb',
    sentence: 'I cannot put up ___ his rude behavior any longer.',
    choices: ['with', 'to', 'for', 'on'], correctIndex: 0,
    explanation: 'put up with で「〜を我慢する」。3語でひとかたまりの群動詞。',
    sentenceJa: 'これ以上彼の無礼な態度には我慢できない。', sourceId: AA,
  },
  {
    id: 'pg-idiom-verb-2', nodeId: 'idiom-verb',
    sentence: 'Please take care ___ my dog while I am away.',
    choices: ['of', 'for', 'to', 'about'], correctIndex: 0,
    explanation: 'take care of で「〜の世話をする」。',
    sentenceJa: '留守の間、犬の世話をお願いします。', sourceId: WB,
  },
  {
    id: 'pg-idiom-conversation-1', nodeId: 'idiom-conversation',
    sentence: '"___ we go out for dinner tonight?" "Sounds great."',
    choices: ['Shall', 'Do', 'Are', 'Will be'], correctIndex: 0,
    explanation: 'Shall we ~? は「〜しませんか」という勧誘。',
    sentenceJa: '「今夜夕食に出かけませんか」「いいですね」', sourceId: WB,
  },
  {
    id: 'pg-idiom-conversation-2', nodeId: 'idiom-conversation',
    sentence: '"Thank you for your help." "___."',
    choices: ['My pleasure', 'You are welcomed', 'Never mind you', 'Not at all thanks'], correctIndex: 0,
    explanation: 'My pleasure. は感謝への定型応答。',
    sentenceJa: '「手伝ってくれてありがとう」「どういたしまして」', sourceId: WB,
  },
  {
    id: 'pg-idiom-construction-1', nodeId: 'idiom-construction',
    sentence: 'The weather is ___ to get worse tomorrow.',
    choices: ['likely', 'possible', 'probable', 'maybe'], correctIndex: 0,
    explanation: 'be likely to do で「〜しそうだ」。possible / probable は人を主語にとらない構文。',
    sentenceJa: '明日は天気が悪化しそうだ。', sourceId: AA,
  },
  {
    id: 'pg-idiom-construction-2', nodeId: 'idiom-construction',
    sentence: 'I would ___ stay home than go out in this rain.',
    choices: ['rather', 'better', 'prefer', 'sooner to'], correctIndex: 0,
    explanation: 'would rather A than B で「BよりむしろAしたい」。動詞は原形。',
    sentenceJa: 'この雨の中出かけるより家にいたい。', sourceId: AA,
  },

  // ---- 読解・英作文直結文法 ----
  {
    id: 'pg-reading-structure-1', nodeId: 'reading-structure',
    sentence: 'The man ___ standing by the door is my uncle.',
    choices: ['who is', 'who he is', 'whom is', 'which is'], correctIndex: 0,
    explanation: '主格の関係代名詞 + be動詞。この who is は省略でき、分詞の後置修飾になる。',
    sentenceJa: 'ドアのそばに立っている男性は私の叔父だ。', sourceId: AA,
  },
  {
    id: 'pg-reading-structure-2', nodeId: 'reading-structure',
    sentence: 'What he said at the meeting ___ everyone.',
    choices: ['surprised', 'surprise', 'were surprised', 'surprising'], correctIndex: 0,
    explanation: 'What 節が主語のかたまり。名詞節の主語は単数扱いなので動詞も単数。',
    sentenceJa: '会議で彼が言ったことは皆を驚かせた。', sourceId: AA,
  },
  {
    id: 'pg-reading-paraphrase-1', nodeId: 'reading-paraphrase',
    sentence: 'He is so kind that he helps anyone. = He is kind ___ to help anyone.',
    choices: ['enough', 'too', 'so', 'as'], correctIndex: 0,
    explanation: 'so ~ that S can ... は〈形容詞 + enough to do〉に書き換えられる。',
    sentenceJa: '彼は誰でも助けるほど親切だ。', sourceId: AA,
  },
  {
    id: 'pg-reading-paraphrase-2', nodeId: 'reading-paraphrase',
    sentence: 'Because he was ill, he stayed home. = ___ ill, he stayed home.',
    choices: ['Being', 'Been', 'To be', 'He being'], correctIndex: 0,
    explanation: '理由を表す副詞節は分詞構文に圧縮できる。主語が同じなので Being。',
    sentenceJa: '病気だったので、彼は家にいた。', sourceId: AA,
  },
  {
    id: 'pg-reading-translation-1', nodeId: 'reading-translation',
    sentence: 'この道を行けば駅に着きます。= This road will ___ you to the station.',
    choices: ['take', 'go', 'arrive', 'reach for'], correctIndex: 0,
    explanation: '日本語の「〜すれば」を無生物主語 + take O to ... に変換する定番パターン。',
    sentenceJa: 'この道を行けば駅に着きます。', sourceId: AA,
  },
  {
    id: 'pg-reading-translation-2', nodeId: 'reading-translation',
    sentence: '彼は忙しくて来られなかった。= He was ___ busy to come.',
    choices: ['too', 'so', 'very', 'enough'], correctIndex: 0,
    explanation: '「〜すぎて…できない」は too ~ to do に変換すると簡潔になる。',
    sentenceJa: '彼は忙しくて来られなかった。', sourceId: AA,
  },
  {
    id: 'pg-reading-mixed-1', nodeId: 'reading-mixed',
    sentence: 'It is no use ___ over spilt milk.',
    choices: ['crying', 'to cry', 'cry', 'cried'], correctIndex: 0,
    explanation: 'It is no use doing で「〜しても無駄だ」。動名詞のみをとる。',
    sentenceJa: '覆水盆に返らず。', sourceId: PD,
  },
  {
    id: 'pg-reading-mixed-2', nodeId: 'reading-mixed',
    sentence: 'Hardly ___ the station when the train left.',
    choices: ['had I reached', 'I had reached', 'did I reached', 'I reached'], correctIndex: 0,
    explanation: 'Hardly が文頭に出ると倒置。hardly ~ when ... で「〜するとすぐに…」。',
    sentenceJa: '駅に着くとすぐに電車が出てしまった。', sourceId: AA,
  },
];
