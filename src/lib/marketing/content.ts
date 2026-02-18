export interface MarketingItem {
  title: string;
  description: string;
  icon: string;
  proOnly?: boolean;
}

export interface PricingComparisonRow {
  feature: string;
  free: string;
  pro: string;
}

export const marketingHighlights: MarketingItem[] = [
  {
    title: '手入力ゼロ',
    description: 'ノートやプリントを撮るだけで単語帳を作成。',
    icon: 'photo_camera',
  },
  {
    title: '学習進捗を可視化',
    description: '習得率・復習中・未学習を自動で集計。',
    icon: 'insights',
  },
  {
    title: '使い分けできる学習モード',
    description: 'クイズ、クイズ2、カード、例文クイズに対応。',
    icon: 'psychology',
  },
];

export const scanModes: MarketingItem[] = [
  {
    title: 'すべての単語',
    description: '写真内の英単語をまとめて抽出。',
    icon: 'center_focus_weak',
  },
  {
    title: '丸で囲んだ単語',
    description: 'マークした単語だけを抽出。',
    icon: 'radio_button_checked',
  },
  {
    title: 'ハイライト単語',
    description: '蛍光ペンで塗った単語を抽出。',
    icon: 'highlight',
  },
  {
    title: '英検レベル',
    description: '指定した級の単語だけを抽出。',
    icon: 'menu_book',
  },
  {
    title: '熟語・イディオム',
    description: '句動詞や熟語を重点抽出。',
    icon: 'translate',
  },
  {
    title: '間違えた単語',
    description: 'テストの誤答語を再学習用に抽出。',
    icon: 'warning',
  },
];

export const studyModes: MarketingItem[] = [
  {
    title: 'クイズ',
    description: '意味を確認しながらテンポよく学習。',
    icon: 'quiz',
  },
  {
    title: 'クイズ2',
    description: '自己想起してAgain/Hard/Good/Easyで評価。',
    icon: 'psychology',
    proOnly: true,
  },
  {
    title: 'カード',
    description: 'フラッシュカードで反復練習。',
    icon: 'style',
    proOnly: true,
  },
  {
    title: '例文クイズ',
    description: '文脈で単語を定着。',
    icon: 'chat',
    proOnly: true,
  },
];

export const pricingComparisonRows: PricingComparisonRow[] = [
  {
    feature: 'スキャン回数',
    free: '1日3回まで',
    pro: '無制限',
  },
  {
    feature: '保存方式',
    free: 'ローカル保存',
    pro: 'クラウド同期',
  },
  {
    feature: 'マルチデバイス',
    free: '非対応',
    pro: '対応',
  },
  {
    feature: '高度学習モード',
    free: '一部利用',
    pro: 'すべて利用可能',
  },
];

export const pricingFaqs = [
  {
    question: '無料プランでも使えますか？',
    answer: '使えます。まず無料で始めて、必要になったらProに切り替えできます。',
  },
  {
    question: 'Proの解約はいつでもできますか？',
    answer: 'いつでも解約できます。解約後も現在の請求期間が終わるまでは利用できます。',
  },
  {
    question: 'どんな人にProが向いていますか？',
    answer: '複数端末で学習したい方、毎日たくさんスキャンする方に向いています。',
  },
];
