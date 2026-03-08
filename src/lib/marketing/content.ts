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
    description: 'クイズ、自己評価、カード、例文クイズに対応。',
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
    title: '自己評価',
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

/* ===== Features LP: How It Works ===== */

export interface HowItWorksStep {
  number: string;
  title: string;
  description: string;
  icon: string;
}

export const howItWorksSteps: HowItWorksStep[] = [
  {
    number: '01',
    title: '撮影する',
    description: 'ノート・プリント・教科書の写真を撮るだけ。',
    icon: 'photo_camera',
  },
  {
    number: '02',
    title: '確認する',
    description: 'AIが抽出した単語を確認・編集。',
    icon: 'edit_note',
  },
  {
    number: '03',
    title: '学習する',
    description: 'クイズ・カード・例文で繰り返し学習。',
    icon: 'school',
  },
];

/* ===== Features LP: Scan Modes (expanded) ===== */

export interface LPScanMode extends MarketingItem {
  useCase: string;
  color: string;
}

export const lpScanModes: LPScanMode[] = [
  {
    title: 'すべての単語',
    description: '写真内の英単語をまとめて抽出。ノートを丸ごとデジタル化。',
    icon: 'center_focus_weak',
    useCase: '授業ノートやプリントを一括取り込みしたいとき',
    color: '#137fec',
  },
  {
    title: '丸で囲んだ単語',
    description: 'ペンで丸をつけた単語だけをAIが認識して抽出。',
    icon: 'radio_button_checked',
    useCase: 'テスト前に覚えたい単語だけピックアップしたいとき',
    color: '#8b5cf6',
  },
  {
    title: 'ハイライト単語',
    description: '蛍光ペンで塗った単語だけを自動で抽出。',
    icon: 'highlight',
    useCase: '教科書の重要箇所をマーカーで印をつけているとき',
    color: '#f59e0b',
  },
  {
    title: '英検レベル',
    description: '英検5級〜1級の範囲を指定して、該当する単語だけを抽出。',
    icon: 'menu_book',
    useCase: '英検対策で、自分の級に合った単語だけ学びたいとき',
    color: '#22c55e',
  },
  {
    title: '熟語・イディオム',
    description: '句動詞や熟語をまとめて重点抽出。',
    icon: 'translate',
    useCase: '長文読解に必要なフレーズをまとめて覚えたいとき',
    color: '#ec4899',
  },
  {
    title: '間違えた単語',
    description: 'テストで間違えた問題の英単語を再学習用に抽出。',
    icon: 'warning',
    useCase: 'テスト返却後、間違いだけを効率よく復習したいとき',
    color: '#ef4444',
  },
];

/* ===== Features LP: Progress Tracking ===== */

export interface ProgressFeature {
  icon: string;
  text: string;
}

export const progressFeatures: ProgressFeature[] = [
  { icon: 'check_circle', text: '習得済み・復習中・未学習を自動で分類' },
  { icon: 'bar_chart', text: '今日の学習量と正答率をリアルタイム表示' },
  { icon: 'local_fire_department', text: '連続学習日数で継続をサポート' },
  { icon: 'star', text: '苦手単語をお気に入り登録して重点復習' },
];

/* ===== Pricing page ===== */

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
