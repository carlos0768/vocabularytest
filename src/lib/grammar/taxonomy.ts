// 文法マップの分類体系: 26大単元 / 76小単元。
//
// この分類はユーザーが持っている問題から作ったものではなく、公開情報にもとづく
// 固定の体系である。骨格は次の公開ソースの突き合わせから決めている:
//   - 文部科学省 高等学校学習指導要領解説 外国語編 付録9 (高校段階で扱う言語材料)
//     https://www.mext.go.jp/a_menu/shotou/new-cs/1407074.htm
//   - 大学入試センター 共通テスト 問題作成方針・試作問題
//     https://www.dnc.ac.jp/kyotsu/
//   - 河合塾 Kei-Net 共通テスト分析・大学別出題分析
//     https://www.keinet.ne.jp/
// 各単元の学年配当・入試重要度・目標問数もこれらの公開分析に由来する設計値で、
// ユーザーの学習データからは一切算出していない。
//
// 重要: このファイルは分類の定義だけを持つ (問題そのものは public-bank/ 側)。
// 単元を足しても DB のマイグレーションは不要。

/** 主に扱う学年 */
export type GrammarGrade = 'h1' | 'h1-h2' | 'h2' | 'h2-h3' | 'h3';

/** 入試での重要度。high=◎ / mid=○ / low=△ (公開分析にもとづく設計値) */
export type ExamWeight = 'high' | 'mid' | 'low';

export type GrammarExamWeights = {
  /** 共通テスト: 独立小問頻度ではなく、読解・推敲・要約での必要度 */
  common: ExamWeight;
  /** 私大 */
  priv: ExamWeight;
  /** 国公立二次 */
  national: ExamWeight;
};

export type GrammarSubUnit = {
  /** URLに載るのでスラッグ (英小文字 + 数字 + ハイフン) に限定する */
  id: string;
  label: string;
  labelEn: string;
  /** 代表的な grammar point (表示用) */
  points: string;
  /** 体系上の目標問数 (公開分析にもとづく設計値) */
  targetQuestions: number;
};

export type GrammarUnit = {
  id: string;
  label: string;
  labelEn: string;
  grade: GrammarGrade;
  exam: GrammarExamWeights;
  children: GrammarSubUnit[];
};

export const GRAMMAR_GRADE_LABEL: Record<GrammarGrade, string> = {
  h1: '高1',
  'h1-h2': '高1〜高2',
  h2: '高2',
  'h2-h3': '高2〜高3',
  h3: '高3',
};

export const EXAM_WEIGHT_MARK: Record<ExamWeight, string> = {
  high: '◎',
  mid: '○',
  low: '△',
};

export const GRAMMAR_TAXONOMY: GrammarUnit[] = [
  {
    id: 'sentence',
    label: '文の種類と語順',
    labelEn: 'Sentence types & word order',
    grade: 'h1',
    exam: { common: 'mid', priv: 'high', national: 'mid' },
    children: [
      { id: 'sentence-kinds', label: '文の種類', labelEn: 'Sentence kinds', points: '平叙・疑問・命令・感嘆', targetQuestions: 24 },
      { id: 'sentence-order', label: '語順の原則', labelEn: 'Word order', points: '修飾語の位置、there is', targetQuestions: 18 },
      { id: 'sentence-patterns', label: '基本文型', labelEn: 'Sentence patterns', points: 'SV〜SVOC、it ~ to/that', targetQuestions: 20 },
    ],
  },
  {
    id: 'tense',
    label: '動詞と時制',
    labelEn: 'Verbs & tense',
    grade: 'h1',
    exam: { common: 'mid', priv: 'high', national: 'high' },
    children: [
      { id: 'tense-basic', label: '現在・過去・進行', labelEn: 'Present, past & progressive', points: '現在形と現在進行形、過去形', targetQuestions: 24 },
      { id: 'tense-future', label: '未来表現', labelEn: 'Future forms', points: 'will、be going to', targetQuestions: 18 },
      { id: 'tense-agreement', label: '時や条件の現在形・時制の一致', labelEn: 'Time clauses & sequence of tenses', points: '時・条件節、時制の一致', targetQuestions: 12 },
    ],
  },
  {
    id: 'perfect',
    label: '完了形',
    labelEn: 'Perfect tenses',
    grade: 'h1-h2',
    exam: { common: 'mid', priv: 'high', national: 'high' },
    children: [
      { id: 'perfect-present', label: '現在完了', labelEn: 'Present perfect', points: '継続・経験・完了・結果', targetQuestions: 24 },
      { id: 'perfect-past', label: '過去完了', labelEn: 'Past perfect', points: 'had p.p.、大過去', targetQuestions: 16 },
      { id: 'perfect-future', label: '未来完了・完了進行', labelEn: 'Future & progressive perfect', points: 'will have p.p.、have been doing', targetQuestions: 12 },
    ],
  },
  {
    id: 'modal',
    label: '助動詞',
    labelEn: 'Modals',
    grade: 'h1-h2',
    exam: { common: 'mid', priv: 'high', national: 'high' },
    children: [
      { id: 'modal-basic', label: '基本意味', labelEn: 'Core meanings', points: 'can, may, must, should', targetQuestions: 18 },
      { id: 'modal-will', label: 'will・would・shall・used to 等', labelEn: 'will / would / used to', points: 'would, used to, shall', targetQuestions: 18 },
      { id: 'modal-perfect', label: '助動詞 + have p.p.', labelEn: 'Modal + perfect', points: 'must have p.p., cannot have p.p.', targetQuestions: 16 },
      { id: 'modal-idiom', label: '慣用表現・that節 should', labelEn: 'Modal idioms', points: 'had better, may well, should 省略', targetQuestions: 10 },
    ],
  },
  {
    id: 'voice',
    label: '態',
    labelEn: 'Voice',
    grade: 'h1',
    exam: { common: 'mid', priv: 'high', national: 'mid' },
    children: [
      { id: 'voice-basic', label: '受動態の基本', labelEn: 'Basic passive', points: 'be + p.p.、by 句', targetQuestions: 18 },
      { id: 'voice-various', label: 'さまざまな受動態', labelEn: 'Passive variations', points: '完了・進行・助動詞の受動態', targetQuestions: 12 },
      { id: 'voice-order', label: '語順注意受動態', labelEn: 'Passive word order', points: 'SVOO・SVOC・群動詞の受動態', targetQuestions: 10 },
    ],
  },
  {
    id: 'infinitive',
    label: '不定詞',
    labelEn: 'Infinitives',
    grade: 'h1-h2',
    exam: { common: 'high', priv: 'high', national: 'high' },
    children: [
      { id: 'infinitive-three', label: '3用法', labelEn: 'Three uses', points: '名詞・形容詞・副詞用法', targetQuestions: 26 },
      { id: 'infinitive-subject', label: '意味上の主語・否定・完了', labelEn: 'Subject, negation & perfect', points: 'for/of 人 to do、not to do、to have p.p.', targetQuestions: 18 },
      { id: 'infinitive-bare', label: '原形不定詞', labelEn: 'Bare infinitive', points: '使役動詞、知覚動詞', targetQuestions: 12 },
      { id: 'infinitive-construction', label: '構文別不定詞', labelEn: 'Infinitive constructions', points: 'too...to, enough to, seem to', targetQuestions: 16 },
    ],
  },
  {
    id: 'gerund',
    label: '動名詞',
    labelEn: 'Gerunds',
    grade: 'h1-h2',
    exam: { common: 'mid', priv: 'high', national: 'high' },
    children: [
      { id: 'gerund-basic', label: '基本用法', labelEn: 'Basic use', points: '主語・目的語・補語の doing', targetQuestions: 18 },
      { id: 'gerund-subject', label: '意味上の主語・完了形', labelEn: 'Subject & perfect gerund', points: 'his doing、having p.p.', targetQuestions: 12 },
      { id: 'gerund-vs-infinitive', label: '動名詞と不定詞', labelEn: 'Gerund vs infinitive', points: 'stop doing / to do、remember', targetQuestions: 18 },
    ],
  },
  {
    id: 'participle',
    label: '分詞',
    labelEn: 'Participles',
    grade: 'h1-h2',
    exam: { common: 'mid', priv: 'high', national: 'high' },
    children: [
      { id: 'participle-use', label: '限定・叙述用法', labelEn: 'Attributive & predicative', points: 'interesting / interested', targetQuestions: 18 },
      { id: 'participle-construction', label: '分詞構文', labelEn: 'Participial construction', points: 'Having p.p.、独立分詞構文', targetQuestions: 18 },
      { id: 'participle-with', label: '付帯状況・with・O+分詞', labelEn: 'With + participle', points: 'with O doing、keep O doing', targetQuestions: 12 },
    ],
  },
  {
    id: 'comparison',
    label: '比較',
    labelEn: 'Comparison',
    grade: 'h1-h2',
    exam: { common: 'mid', priv: 'high', national: 'high' },
    children: [
      { id: 'comparison-positive', label: '原級', labelEn: 'Positive degree', points: 'as ~ as、not so ~ as', targetQuestions: 18 },
      { id: 'comparison-comparative', label: '比較級・最上級', labelEn: 'Comparative & superlative', points: 'the 比較級、by far', targetQuestions: 16 },
      { id: 'comparison-idiom', label: '倍数・慣用比較', labelEn: 'Multiples & idioms', points: 'twice as ~ as、no more than', targetQuestions: 12 },
    ],
  },
  {
    id: 'relative',
    label: '関係詞',
    labelEn: 'Relatives',
    grade: 'h1-h2',
    exam: { common: 'high', priv: 'high', national: 'high' },
    children: [
      { id: 'relative-pronoun', label: '関係代名詞の基本', labelEn: 'Relative pronouns', points: 'who / which / that / whose', targetQuestions: 24 },
      { id: 'relative-preposition', label: '継続・前置詞＋関係詞', labelEn: 'Non-restrictive & prepositional', points: ', which、in which', targetQuestions: 16 },
      { id: 'relative-adverb', label: '関係副詞', labelEn: 'Relative adverbs', points: 'where / when / why / how', targetQuestions: 14 },
      { id: 'relative-compound', label: '複合関係詞・what・as/than 等', labelEn: 'Compound relatives & what', points: 'whatever、what、擬似関係代名詞', targetQuestions: 16 },
    ],
  },
  {
    id: 'subjunctive',
    label: '仮定法',
    labelEn: 'Subjunctive',
    grade: 'h2',
    exam: { common: 'mid', priv: 'high', national: 'high' },
    children: [
      { id: 'subjunctive-if', label: 'if 仮定法', labelEn: 'If-clauses', points: 'if S were、if S had p.p.', targetQuestions: 24 },
      { id: 'subjunctive-wish', label: 'wish・as if', labelEn: 'wish & as if', points: 'I wish、as if S were', targetQuestions: 14 },
      { id: 'subjunctive-inversion', label: '倒置・but for 等', labelEn: 'Inversion & but for', points: 'Had I known、but for、without', targetQuestions: 12 },
    ],
  },
  {
    id: 'interrogative',
    label: '疑問詞・疑問文',
    labelEn: 'Questions',
    grade: 'h2',
    exam: { common: 'mid', priv: 'mid', national: 'mid' },
    children: [
      { id: 'interrogative-basic', label: '疑問詞基礎', labelEn: 'Question words', points: 'what / which / how、what to do', targetQuestions: 14 },
      { id: 'interrogative-indirect', label: '間接疑問・付加疑問等', labelEn: 'Indirect & tag questions', points: 'do you think、付加疑問', targetQuestions: 12 },
      { id: 'interrogative-idiom', label: '慣用疑問表現', labelEn: 'Idiomatic questions', points: 'How come、What if', targetQuestions: 10 },
    ],
  },
  {
    id: 'negation',
    label: '否定',
    labelEn: 'Negation',
    grade: 'h2',
    exam: { common: 'mid', priv: 'high', national: 'high' },
    children: [
      { id: 'negation-scope', label: '否定の範囲', labelEn: 'Scope of negation', points: '否定語の作用域、not ~ because', targetQuestions: 14 },
      { id: 'negation-partial', label: '部分否定・二重否定', labelEn: 'Partial & double negation', points: 'not always、never ~ without', targetQuestions: 12 },
      { id: 'negation-quasi', label: '準否定・慣用否定', labelEn: 'Quasi-negatives', points: 'hardly, seldom, far from', targetQuestions: 10 },
    ],
  },
  {
    id: 'reported',
    label: '話法',
    labelEn: 'Reported speech',
    grade: 'h2',
    exam: { common: 'low', priv: 'mid', national: 'mid' },
    children: [
      { id: 'reported-basic', label: '直接・間接話法', labelEn: 'Direct & indirect', points: 'say / tell、時制と代名詞の転換', targetQuestions: 12 },
      { id: 'reported-types', label: '命令・疑問・依頼の話法', labelEn: 'Commands & questions', points: 'ask O to do、if / whether', targetQuestions: 12 },
    ],
  },
  {
    id: 'nominal',
    label: '名詞構文と無生物主語',
    labelEn: 'Nominal & inanimate subjects',
    grade: 'h2-h3',
    exam: { common: 'low', priv: 'mid', national: 'high' },
    children: [
      { id: 'nominal-noun', label: '名詞構文', labelEn: 'Nominal constructions', points: 'take a walk → walk', targetQuestions: 10 },
      { id: 'nominal-inanimate', label: '無生物主語', labelEn: 'Inanimate subjects', points: 'The news surprised me、enable O to do', targetQuestions: 10 },
    ],
  },
  {
    id: 'emphasis',
    label: '強調・倒置・省略・同格',
    labelEn: 'Emphasis, inversion & ellipsis',
    grade: 'h2-h3',
    exam: { common: 'low', priv: 'mid', national: 'high' },
    children: [
      { id: 'emphasis-cleft', label: '強調構文', labelEn: 'Cleft sentences', points: 'It is ~ that...、強調の do', targetQuestions: 12 },
      { id: 'emphasis-inversion', label: '倒置・省略', labelEn: 'Inversion & ellipsis', points: '否定語句頭の倒置、so / neither', targetQuestions: 12 },
      { id: 'emphasis-apposition', label: '同格・挿入', labelEn: 'Apposition & parenthesis', points: '同格の that、挿入節', targetQuestions: 8 },
    ],
  },
  {
    id: 'noun',
    label: '名詞',
    labelEn: 'Nouns',
    grade: 'h1-h2',
    exam: { common: 'mid', priv: 'mid', national: 'mid' },
    children: [
      { id: 'noun-count', label: '可算・不可算', labelEn: 'Countability', points: 'advice, information, furniture', targetQuestions: 12 },
      { id: 'noun-plural', label: '複数形・所有格・名詞の語法', labelEn: 'Plurals & possessives', points: 'custom / customs、所有格', targetQuestions: 10 },
    ],
  },
  {
    id: 'article',
    label: '冠詞・限定詞',
    labelEn: 'Articles & determiners',
    grade: 'h1-h2',
    exam: { common: 'mid', priv: 'high', national: 'mid' },
    children: [
      { id: 'article-basic', label: '冠詞基礎', labelEn: 'Basic articles', points: 'a / the / 無冠詞', targetQuestions: 16 },
      { id: 'article-meaning', label: '冠詞の意味差', labelEn: 'Article nuances', points: 'go to school / the school', targetQuestions: 10 },
      { id: 'article-determiner', label: '限定詞群', labelEn: 'Determiners', points: 'all / both / each / every / either', targetQuestions: 12 },
    ],
  },
  {
    id: 'pronoun',
    label: '代名詞',
    labelEn: 'Pronouns',
    grade: 'h2-h3',
    exam: { common: 'mid', priv: 'high', national: 'mid' },
    children: [
      { id: 'pronoun-person', label: '人称・所有・再帰', labelEn: 'Personal & reflexive', points: 'oneself、所有代名詞', targetQuestions: 14 },
      { id: 'pronoun-it', label: 'it の用法', labelEn: 'Uses of it', points: 'it that ~、it to do、形式主語', targetQuestions: 12 },
      { id: 'pronoun-other', label: 'one・other 系', labelEn: 'one & other', points: 'another / the other / others', targetQuestions: 12 },
    ],
  },
  {
    id: 'adjective',
    label: '形容詞',
    labelEn: 'Adjectives',
    grade: 'h2-h3',
    exam: { common: 'mid', priv: 'mid', national: 'mid' },
    children: [
      { id: 'adjective-use', label: '限定・叙述', labelEn: 'Attributive & predicative', points: 'alive, asleep, afraid of', targetQuestions: 12 },
      { id: 'adjective-usage', label: '数量・-ed/-ing・語法', labelEn: 'Quantity & -ed/-ing', points: 'many / much / few / little', targetQuestions: 12 },
    ],
  },
  {
    id: 'adverb',
    label: '副詞',
    labelEn: 'Adverbs',
    grade: 'h2-h3',
    exam: { common: 'mid', priv: 'mid', national: 'mid' },
    children: [
      { id: 'adverb-position', label: '位置と修飾範囲', labelEn: 'Position & scope', points: 'only, even, almost', targetQuestions: 12 },
      { id: 'adverb-connective', label: '接続副詞・文修飾副詞', labelEn: 'Connective & sentence adverbs', points: 'however, therefore, fortunately', targetQuestions: 10 },
    ],
  },
  {
    id: 'preposition',
    label: '前置詞',
    labelEn: 'Prepositions',
    grade: 'h2-h3',
    exam: { common: 'mid', priv: 'high', national: 'high' },
    children: [
      { id: 'preposition-basic', label: '基本前置詞', labelEn: 'Basic prepositions', points: 'in / on / at、by / with', targetQuestions: 16 },
      { id: 'preposition-phrase', label: '結合前置詞・群前置詞', labelEn: 'Phrasal prepositions', points: 'in terms of、according to', targetQuestions: 12 },
    ],
  },
  {
    id: 'conjunction',
    label: '接続詞',
    labelEn: 'Conjunctions',
    grade: 'h2-h3',
    exam: { common: 'high', priv: 'high', national: 'high' },
    children: [
      { id: 'conjunction-coordinate', label: '等位接続詞・相関構文', labelEn: 'Coordinating & correlative', points: 'and / but / or、not only ~ but also', targetQuestions: 12 },
      { id: 'conjunction-clause', label: '名詞節・副詞節', labelEn: 'Noun & adverb clauses', points: 'that / whether、although / unless', targetQuestions: 16 },
    ],
  },
  {
    id: 'usage',
    label: '語法',
    labelEn: 'Usage',
    grade: 'h2-h3',
    exam: { common: 'high', priv: 'high', national: 'high' },
    children: [
      { id: 'usage-verb', label: '動詞語法', labelEn: 'Verb usage', points: 'SVO / SVOC、自動詞と他動詞', targetQuestions: 18 },
      { id: 'usage-verbal', label: '準動詞語法', labelEn: 'Verbal usage', points: 'enable O to do、be worth doing', targetQuestions: 18 },
      { id: 'usage-adjective', label: '形容詞・名詞語法', labelEn: 'Adjective & noun usage', points: 'be capable of、混同しやすい名詞', targetQuestions: 14 },
      { id: 'usage-agreement', label: '主述一致・呼応・代用', labelEn: 'Agreement', points: '主語と動詞の一致、代動詞 do', targetQuestions: 10 },
    ],
  },
  {
    id: 'idiom',
    label: 'イディオムと会話表現',
    labelEn: 'Idioms & expressions',
    grade: 'h2-h3',
    exam: { common: 'low', priv: 'high', national: 'mid' },
    children: [
      { id: 'idiom-verb', label: '動詞句イディオム', labelEn: 'Phrasal verbs', points: 'take care of、put up with', targetQuestions: 16 },
      { id: 'idiom-conversation', label: '会話表現', labelEn: 'Conversational', points: "Why don't you...?、How about", targetQuestions: 16 },
      { id: 'idiom-construction', label: '構文熟語', labelEn: 'Set constructions', points: 'be likely to、had better', targetQuestions: 12 },
    ],
  },
  {
    id: 'reading',
    label: '読解・英作文直結文法',
    labelEn: 'Grammar for reading & writing',
    grade: 'h3',
    exam: { common: 'high', priv: 'high', national: 'high' },
    children: [
      { id: 'reading-structure', label: '句と節・文構造把握', labelEn: 'Phrases, clauses & structure', points: '節の圧縮、修飾関係の把握', targetQuestions: 18 },
      { id: 'reading-paraphrase', label: '書き換え・パラフレーズ', labelEn: 'Rewriting & paraphrase', points: '同義書き換え、節⇔句', targetQuestions: 18 },
      { id: 'reading-translation', label: '和文英訳頻出変換', labelEn: 'JP→EN conversion', points: '名詞→動詞転換、無生物主語化', targetQuestions: 14 },
      { id: 'reading-mixed', label: '融合型', labelEn: 'Mixed format', points: '整序、誤文訂正、推敲', targetQuestions: 14 },
    ],
  },
];

// ---- 参照ヘルパー ----

const unitById = new Map<string, GrammarUnit>();
const subUnitById = new Map<string, { sub: GrammarSubUnit; unit: GrammarUnit }>();

for (const unit of GRAMMAR_TAXONOMY) {
  if (unitById.has(unit.id)) throw new Error(`duplicate grammar unit id: ${unit.id}`);
  unitById.set(unit.id, unit);
  for (const sub of unit.children) {
    if (subUnitById.has(sub.id) || unitById.has(sub.id)) {
      throw new Error(`duplicate grammar sub-unit id: ${sub.id}`);
    }
    subUnitById.set(sub.id, { sub, unit });
  }
}

export function findGrammarUnit(id: string): GrammarUnit | null {
  return unitById.get(id) ?? null;
}

export function findGrammarSubUnit(id: string): { sub: GrammarSubUnit; unit: GrammarUnit } | null {
  return subUnitById.get(id) ?? null;
}

/** 全76小単元をツリー順に返す */
export function allGrammarSubUnits(): { sub: GrammarSubUnit; unit: GrammarUnit }[] {
  return GRAMMAR_TAXONOMY.flatMap((unit) => unit.children.map((sub) => ({ sub, unit })));
}

/**
 * 指定ノード (大単元なら配下の小単元すべて) に対応する小単元IDを返す。
 * 存在しないIDには空配列を返す。
 */
export function grammarNodeSubUnitIds(id: string): string[] {
  const unit = unitById.get(id);
  if (unit) return unit.children.map((child) => child.id);
  const found = subUnitById.get(id);
  return found ? [found.sub.id] : [];
}

/** 大単元・小単元をまたいだ表示名の解決 */
export function grammarNodeLabel(id: string): string | null {
  return unitById.get(id)?.label ?? subUnitById.get(id)?.sub.label ?? null;
}

export const GRAMMAR_TAXONOMY_TOTAL_TARGET = GRAMMAR_TAXONOMY.reduce(
  (total, unit) => total + unit.children.reduce((sum, sub) => sum + sub.targetQuestions, 0),
  0,
);
