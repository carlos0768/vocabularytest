// 文法マップの土台になる文法事項のツリー (大分類 → 文法項目)。
//
// grammar_questions.grammar_point は ChatGPT が付ける自由入力のタグ (最大40字)
// なので、そのまま集計すると表記ゆれで無数のバラバラな項目になってしまう。
// ここで学習者向けの固定ツリーを定義し、自由入力タグを classify.ts で
// このツリーのノードに寄せることで「どこまで習得できているか」を俯瞰できる形にする。
//
// ツリー自体はユーザーデータではなく定数なので、DBには持たせない
// (項目を足しても既存の問題は再分類されるだけで、マイグレーション不要)。

export type GrammarTaxonomyNode = {
  /** URLに載るのでスラッグ (英小文字 + ハイフン) に限定する */
  id: string;
  /** 画面に出す日本語ラベル */
  label: string;
  /** 一覧の補助表示に使う英語ラベル */
  labelEn: string;
  /** 完全一致で寄せたい別名 (正規化して比較する) */
  aliases?: string[];
  /** 部分一致で寄せたいキーワード。長いものが優先される */
  keywords?: string[];
  children?: GrammarTaxonomyNode[];
};

/**
 * 分類できなかった問題 (タグなし・ツリー外のタグ) を入れる擬似ノードのID。
 * ツリー定数には含めず、集計時に末尾へ足す。
 */
export const GRAMMAR_UNCATEGORIZED_ID = 'uncategorized';
export const GRAMMAR_UNCATEGORIZED_LABEL = '未分類';

export const GRAMMAR_TAXONOMY: GrammarTaxonomyNode[] = [
  {
    id: 'tense',
    label: '時制',
    labelEn: 'Tense',
    keywords: ['時制'],
    children: [
      {
        id: 'tense-basic',
        label: '基本時制（現在・過去・未来）',
        labelEn: 'Basic tenses',
        aliases: ['現在形', '過去形', '未来形', '未来表現', '基本時制'],
        keywords: ['現在形', '過去形', '未来形', '未来表現', 'be going to'],
      },
      {
        id: 'tense-progressive',
        label: '進行形',
        labelEn: 'Progressive',
        aliases: ['進行形', '現在進行形', '過去進行形', '未来進行形'],
        keywords: ['進行形'],
      },
      {
        id: 'tense-perfect',
        label: '完了形',
        labelEn: 'Perfect',
        aliases: ['完了形', '現在完了', '過去完了', '未来完了', '完了進行形'],
        keywords: ['完了形', '現在完了', '過去完了', '未来完了'],
      },
      {
        id: 'tense-special',
        label: '時制の一致・特殊用法',
        labelEn: 'Sequence of tenses',
        aliases: ['時制の一致', '歴史的現在'],
        keywords: ['時制の一致', '歴史的現在', '時・条件の副詞節', '時と条件の副詞節'],
      },
    ],
  },
  {
    id: 'modal',
    label: '助動詞',
    labelEn: 'Modals',
    keywords: ['助動詞'],
    children: [
      {
        id: 'modal-basic',
        label: '助動詞の基本',
        labelEn: 'Basic modals',
        aliases: ['助動詞', '助動詞の基本', 'can', 'may', 'must', 'should', 'will', 'would', 'used to'],
        keywords: ['助動詞の基本', 'used to'],
      },
      {
        id: 'modal-perfect',
        label: '助動詞 + have done',
        labelEn: 'Modal + perfect',
        aliases: ['助動詞+have done', '助動詞の完了形'],
        keywords: ['助動詞+have', '助動詞 + have', '助動詞の完了', 'must have', 'should have', 'cannot have', 'need not have', 'might have'],
      },
      {
        id: 'modal-idiom',
        label: '助動詞の慣用表現',
        labelEn: 'Modal idioms',
        aliases: ['助動詞の慣用表現', 'had better', 'would rather', 'may well', 'may as well'],
        keywords: ['助動詞の慣用', 'had better', 'would rather', 'may well', 'may as well', 'need not', 'dare'],
      },
    ],
  },
  {
    id: 'voice',
    label: '受動態',
    labelEn: 'Passive voice',
    keywords: ['受動態', '受け身', '態'],
    children: [
      {
        id: 'voice-basic',
        label: '受動態の基本',
        labelEn: 'Basic passive',
        aliases: ['受動態', '受け身', '受動態の基本'],
        keywords: ['受動態の基本', '受け身の基本'],
      },
      {
        id: 'voice-advanced',
        label: '受動態の応用（群動詞・by以外）',
        labelEn: 'Advanced passive',
        aliases: ['群動詞の受動態', '句動詞の受動態'],
        keywords: ['群動詞の受動態', '句動詞の受動態', 'by以外', '受動態の応用', '知覚動詞の受動態', '使役動詞の受動態'],
      },
    ],
  },
  {
    id: 'infinitive',
    label: '不定詞',
    labelEn: 'Infinitives',
    keywords: ['不定詞'],
    children: [
      {
        id: 'infinitive-usage',
        label: '名詞・形容詞・副詞用法',
        labelEn: 'Infinitive usage',
        aliases: ['不定詞', '不定詞の基本', '名詞的用法', '形容詞的用法', '副詞的用法'],
        keywords: ['不定詞の名詞', '不定詞の形容詞', '不定詞の副詞', '名詞的用法', '形容詞的用法', '副詞的用法'],
      },
      {
        id: 'infinitive-bare',
        label: '原形不定詞（使役・知覚動詞）',
        labelEn: 'Bare infinitive',
        aliases: ['原形不定詞', '使役動詞', '知覚動詞'],
        keywords: ['原形不定詞', '使役動詞', '知覚動詞'],
      },
      {
        id: 'infinitive-form',
        label: '完了不定詞・意味上の主語',
        labelEn: 'Infinitive forms',
        aliases: ['完了不定詞', '不定詞の意味上の主語', '不定詞の否定'],
        keywords: ['完了不定詞', '不定詞の意味上の主語', '不定詞の否定', '代不定詞'],
      },
      {
        id: 'infinitive-idiom',
        label: '不定詞の慣用表現',
        labelEn: 'Infinitive idioms',
        aliases: ['独立不定詞', '不定詞の慣用表現', 'too to', 'enough to'],
        keywords: ['独立不定詞', '不定詞の慣用', 'too ~ to', 'enough to', 'so as to', 'in order to'],
      },
    ],
  },
  {
    id: 'gerund',
    label: '動名詞',
    labelEn: 'Gerunds',
    keywords: ['動名詞'],
    children: [
      {
        id: 'gerund-basic',
        label: '動名詞の基本',
        labelEn: 'Basic gerund',
        aliases: ['動名詞', '動名詞の基本', '動名詞の意味上の主語'],
        keywords: ['動名詞の基本', '動名詞の意味上の主語', '完了動名詞'],
      },
      {
        id: 'gerund-vs-infinitive',
        label: '動名詞と不定詞の使い分け',
        labelEn: 'Gerund vs infinitive',
        aliases: ['動名詞と不定詞', '動名詞と不定詞の使い分け'],
        keywords: ['動名詞と不定詞', '不定詞と動名詞', 'remember to', 'stop doing'],
      },
      {
        id: 'gerund-idiom',
        label: '動名詞の慣用表現',
        labelEn: 'Gerund idioms',
        aliases: ['動名詞の慣用表現'],
        keywords: ['動名詞の慣用', 'there is no', 'it is no use', 'cannot help', 'worth', 'look forward to', 'be used to'],
      },
    ],
  },
  {
    id: 'participle',
    label: '分詞',
    labelEn: 'Participles',
    keywords: ['分詞'],
    children: [
      {
        id: 'participle-adjective',
        label: '分詞の形容詞用法',
        labelEn: 'Participial adjectives',
        aliases: ['分詞', '分詞の形容詞用法', '現在分詞', '過去分詞'],
        keywords: ['分詞の形容詞', '現在分詞', '過去分詞', '感情を表す分詞'],
      },
      {
        id: 'participle-construction',
        label: '分詞構文',
        labelEn: 'Participial construction',
        aliases: ['分詞構文', '独立分詞構文', '完了分詞構文'],
        keywords: ['分詞構文'],
      },
      {
        id: 'participle-with',
        label: '付帯状況のwith',
        labelEn: 'With + participle',
        aliases: ['付帯状況', '付帯状況のwith'],
        keywords: ['付帯状況'],
      },
    ],
  },
  {
    id: 'relative',
    label: '関係詞',
    labelEn: 'Relatives',
    keywords: ['関係詞'],
    children: [
      {
        id: 'relative-pronoun',
        label: '関係代名詞',
        labelEn: 'Relative pronouns',
        aliases: ['関係代名詞', '関係代名詞what', '関係代名詞whose'],
        keywords: ['関係代名詞'],
      },
      {
        id: 'relative-adverb',
        label: '関係副詞',
        labelEn: 'Relative adverbs',
        aliases: ['関係副詞'],
        keywords: ['関係副詞'],
      },
      {
        id: 'relative-preposition',
        label: '前置詞＋関係代名詞・非制限用法',
        labelEn: 'Prepositional / non-restrictive',
        aliases: ['前置詞+関係代名詞', '非制限用法', '継続用法'],
        keywords: ['前置詞+関係', '前置詞＋関係', '非制限用法', '継続用法', 'in which', 'to whom'],
      },
      {
        id: 'relative-compound',
        label: '複合関係詞',
        labelEn: 'Compound relatives',
        aliases: ['複合関係詞', '複合関係代名詞', '複合関係副詞'],
        keywords: ['複合関係', 'whatever', 'whoever', 'however', 'whichever', 'wherever'],
      },
      {
        id: 'relative-pseudo',
        label: '擬似関係代名詞',
        labelEn: 'Pseudo-relatives',
        aliases: ['擬似関係代名詞', '疑似関係代名詞'],
        keywords: ['擬似関係', '疑似関係'],
      },
    ],
  },
  {
    id: 'subjunctive',
    label: '仮定法',
    labelEn: 'Subjunctive',
    keywords: ['仮定法'],
    children: [
      {
        id: 'subjunctive-past',
        label: '仮定法過去',
        labelEn: 'Past subjunctive',
        aliases: ['仮定法過去', '仮定法', '仮定法の基本'],
        keywords: ['仮定法過去'],
      },
      {
        id: 'subjunctive-past-perfect',
        label: '仮定法過去完了・混合仮定法',
        labelEn: 'Past perfect / mixed',
        aliases: ['仮定法過去完了', '混合仮定法'],
        keywords: ['仮定法過去完了', '混合仮定法'],
      },
      {
        id: 'subjunctive-inversion',
        label: 'ifの省略と倒置',
        labelEn: 'If-omission inversion',
        aliases: ['ifの省略', 'ifの省略と倒置', '仮定法の倒置'],
        keywords: ['ifの省略', '仮定法の倒置', 'had i known', 'were i to', 'should you'],
      },
      {
        id: 'subjunctive-present',
        label: '仮定法現在（要求・提案のthat節）',
        labelEn: 'Present subjunctive',
        aliases: ['仮定法現在', '要求提案の仮定法'],
        keywords: ['仮定法現在', '要求・提案', 'suggest that', 'demand that', 'insist that'],
      },
      {
        id: 'subjunctive-future',
        label: '仮定法未来',
        labelEn: 'Future subjunctive',
        aliases: ['仮定法未来'],
        keywords: ['仮定法未来', 'if s should', 'were to'],
      },
      {
        id: 'subjunctive-idiom',
        label: '仮定法の慣用表現',
        labelEn: 'Subjunctive idioms',
        aliases: ['仮定法の慣用表現', 'i wish', 'as if', 'but for', 'if it were not for'],
        keywords: ['仮定法の慣用', 'i wish', 'as if', 'as though', 'but for', 'if it were not for', 'it is time'],
      },
    ],
  },
  {
    id: 'comparison',
    label: '比較',
    labelEn: 'Comparison',
    keywords: ['比較'],
    children: [
      {
        id: 'comparison-equal',
        label: '原級比較',
        labelEn: 'Positive degree',
        aliases: ['原級', '原級比較', 'as as'],
        keywords: ['原級', 'as ~ as', '倍数表現'],
      },
      {
        id: 'comparison-comparative',
        label: '比較級',
        labelEn: 'Comparative',
        aliases: ['比較級', '比較級の強調'],
        keywords: ['比較級', 'the 比較級'],
      },
      {
        id: 'comparison-superlative',
        label: '最上級',
        labelEn: 'Superlative',
        aliases: ['最上級', '最上級相当表現'],
        keywords: ['最上級'],
      },
      {
        id: 'comparison-idiom',
        label: '比較の慣用表現',
        labelEn: 'Comparison idioms',
        aliases: ['比較の慣用表現', 'no more than', 'not less than'],
        keywords: ['比較の慣用', 'no more than', 'no less than', 'not more than', 'know better than', 'much less'],
      },
    ],
  },
  {
    id: 'conjunction',
    label: '接続詞・節',
    labelEn: 'Conjunctions & clauses',
    keywords: ['接続詞'],
    children: [
      {
        id: 'conjunction-coordinate',
        label: '等位接続詞・相関接続詞',
        labelEn: 'Coordinating conjunctions',
        aliases: ['等位接続詞', '相関接続詞'],
        keywords: ['等位接続詞', '相関接続詞', 'not only but also', 'either or', 'neither nor', 'both and'],
      },
      {
        id: 'conjunction-subordinate',
        label: '従位接続詞（時・条件・譲歩・理由）',
        labelEn: 'Subordinating conjunctions',
        aliases: ['従位接続詞', '従属接続詞', '譲歩', '譲歩構文'],
        keywords: ['従位接続詞', '従属接続詞', '譲歩', '条件節', 'as soon as', 'unless', 'although', 'lest', 'in case'],
      },
      {
        id: 'noun-clause',
        label: '名詞節（that / whether / 同格）',
        labelEn: 'Noun clauses',
        aliases: ['名詞節', '同格のthat', '同格', '間接疑問'],
        keywords: ['名詞節', '同格', '間接疑問', 'that節', 'whether節'],
      },
    ],
  },
  {
    id: 'preposition',
    label: '前置詞',
    labelEn: 'Prepositions',
    keywords: ['前置詞'],
    children: [
      {
        id: 'preposition-basic',
        label: '前置詞の基本用法',
        labelEn: 'Basic prepositions',
        aliases: ['前置詞', '前置詞の基本'],
        keywords: ['前置詞の基本', '前置詞の用法'],
      },
      {
        id: 'preposition-idiom',
        label: '群前置詞・前置詞を含む熟語',
        labelEn: 'Prepositional phrases',
        aliases: ['群前置詞', '前置詞を含む熟語', '前置詞の慣用表現'],
        keywords: ['群前置詞', '前置詞の慣用', '前置詞を含む'],
      },
    ],
  },
  {
    id: 'noun',
    label: '名詞・冠詞・代名詞',
    labelEn: 'Nouns, articles & pronouns',
    keywords: ['名詞', '代名詞', '冠詞'],
    children: [
      {
        id: 'noun-countability',
        label: '名詞と可算・不可算',
        labelEn: 'Countability',
        aliases: ['名詞', '可算名詞', '不可算名詞', '名詞の数'],
        keywords: ['可算', '不可算', '名詞の数', '集合名詞'],
      },
      {
        id: 'article',
        label: '冠詞',
        labelEn: 'Articles',
        aliases: ['冠詞', '定冠詞', '不定冠詞', '無冠詞'],
        keywords: ['冠詞'],
      },
      {
        id: 'pronoun',
        label: '代名詞',
        labelEn: 'Pronouns',
        aliases: ['代名詞', '不定代名詞', '再帰代名詞', '人称代名詞'],
        keywords: ['代名詞', 'it の用法', 'one another', 'each other'],
      },
      {
        id: 'agreement',
        label: '主語と動詞の一致',
        labelEn: 'Subject-verb agreement',
        aliases: ['主語と動詞の一致', '数の一致', '一致'],
        keywords: ['主語と動詞の一致', '数の一致', '主述の一致'],
      },
    ],
  },
  {
    id: 'modifier',
    label: '形容詞・副詞',
    labelEn: 'Adjectives & adverbs',
    keywords: ['形容詞', '副詞'],
    children: [
      {
        id: 'adjective',
        label: '形容詞',
        labelEn: 'Adjectives',
        aliases: ['形容詞', '数量形容詞', '限定用法', '叙述用法'],
        keywords: ['形容詞', '数量形容詞'],
      },
      {
        id: 'adverb',
        label: '副詞',
        labelEn: 'Adverbs',
        aliases: ['副詞', '頻度の副詞', '副詞の位置'],
        keywords: ['副詞', 'already yet still'],
      },
    ],
  },
  {
    id: 'emphasis',
    label: '否定・倒置・強調・省略',
    labelEn: 'Negation, inversion & emphasis',
    children: [
      {
        id: 'negation',
        label: '否定（部分否定・二重否定）',
        labelEn: 'Negation',
        aliases: ['否定', '部分否定', '二重否定', '準否定'],
        keywords: ['部分否定', '二重否定', '準否定', '否定の慣用', '否定表現', 'not all', 'hardly', 'seldom'],
      },
      {
        id: 'inversion',
        label: '倒置',
        labelEn: 'Inversion',
        aliases: ['倒置', '倒置構文', '否定語句頭の倒置'],
        keywords: ['倒置'],
      },
      {
        id: 'cleft',
        label: '強調構文・強調',
        labelEn: 'Cleft sentences & emphasis',
        aliases: ['強調構文', '強調', '強調のdo'],
        keywords: ['強調構文', '強調', 'it is that', 'not until'],
      },
      {
        id: 'ellipsis',
        label: '省略・挿入',
        labelEn: 'Ellipsis & parenthesis',
        aliases: ['省略', '挿入', '省略構文', '挿入構文'],
        keywords: ['省略構文', '挿入構文', '省略', '挿入', 'so to speak', 'what is called', 'if any'],
      },
    ],
  },
  {
    id: 'syntax',
    label: '文型・語法',
    labelEn: 'Sentence patterns & usage',
    keywords: ['語法', '文型'],
    children: [
      {
        id: 'sentence-pattern',
        label: '文型（SV〜SVOC）',
        labelEn: 'Sentence patterns',
        aliases: ['文型', '5文型', '五文型', 'svoc', 'svoo'],
        keywords: ['文型'],
      },
      {
        id: 'verb-usage',
        label: '動詞の語法',
        labelEn: 'Verb usage',
        aliases: ['動詞の語法', '自動詞と他動詞', '自動詞', '他動詞'],
        keywords: ['動詞の語法', '自動詞', '他動詞', 'rise raise', 'lie lay'],
      },
      {
        id: 'inanimate-subject',
        label: '無生物主語・名詞構文',
        labelEn: 'Inanimate subjects',
        aliases: ['無生物主語', '名詞構文'],
        keywords: ['無生物主語', '名詞構文'],
      },
      {
        id: 'question',
        label: '疑問文・付加疑問',
        labelEn: 'Questions',
        aliases: ['疑問文', '付加疑問', '疑問詞'],
        keywords: ['疑問文', '付加疑問', '疑問詞'],
      },
    ],
  },
];

/** カテゴリ(第1階層)のIDをそのまま返す */
export function grammarCategoryIds(): string[] {
  return GRAMMAR_TAXONOMY.map((category) => category.id);
}

/** ツリーを深さ優先で走査する (親→子の順) */
export function walkGrammarTaxonomy(
  visit: (node: GrammarTaxonomyNode, parent: GrammarTaxonomyNode | null, depth: number) => void,
): void {
  const walk = (nodes: GrammarTaxonomyNode[], parent: GrammarTaxonomyNode | null, depth: number) => {
    for (const node of nodes) {
      visit(node, parent, depth);
      if (node.children) walk(node.children, node, depth + 1);
    }
  };
  walk(GRAMMAR_TAXONOMY, null, 0);
}

const nodeById = new Map<string, GrammarTaxonomyNode>();
walkGrammarTaxonomy((node) => {
  if (nodeById.has(node.id)) {
    throw new Error(`duplicate grammar taxonomy id: ${node.id}`);
  }
  nodeById.set(node.id, node);
});

export function findGrammarNode(id: string): GrammarTaxonomyNode | null {
  return nodeById.get(id) ?? null;
}

/**
 * 指定ノードとその子孫のIDを返す。
 * カテゴリを指定して配下すべての問題を演習するときに使う。
 */
export function grammarNodeSubtreeIds(id: string): string[] {
  const root = nodeById.get(id);
  if (!root) return [];
  const ids: string[] = [];
  const collect = (node: GrammarTaxonomyNode) => {
    ids.push(node.id);
    for (const child of node.children ?? []) collect(child);
  };
  collect(root);
  return ids;
}
