/**
 * 設定 > 使い方ガイド (/settings/help) に出す説明文の単一情報源。
 *
 * ここに載せるのは「アプリから実際に到達できる機能」だけ。
 * UI先行実装のモック画面 (/correction, /parser, /collections) や
 * 現状どこからもリンクされていない画面 (/quiz2, /quick-response) は
 * 使えると誤解させるので載せない。機能を追加・削除したらここも直す。
 */

export type HelpPlanBadge = 'pro' | 'free-limited';

export interface HelpItem {
  /** Material Symbols のアイコン名 */
  icon: string;
  title: string;
  body: string;
  /** アプリ内の該当画面。指定すると「開く」リンクを出す */
  href?: string;
  linkLabel?: string;
  badge?: HelpPlanBadge;
}

export interface HelpSection {
  id: string;
  /** 見出しの右に出す英字ラベル */
  eyebrow: string;
  label: string;
  summary: string;
  items: HelpItem[];
}

export interface HelpStep {
  number: string;
  title: string;
  body: string;
  icon: string;
}

/** 冒頭に置く3ステップ。初めて開いた人がまず何をすればいいかだけを書く。 */
export const HELP_STEPS: HelpStep[] = [
  {
    number: '01',
    title: '単語帳をつくる',
    body: '写真をスキャンする、共有単語帳を取り込む、手で入力する。どれでも単語帳になります。',
    icon: 'library_add',
  },
  {
    number: '02',
    title: 'クイズで覚える',
    body: '四択・声・カードから好きな解き方を選びます。正解・不正解に応じて次に出る日が決まります。',
    icon: 'school',
  },
  {
    number: '03',
    title: '記録を見る',
    body: '習得済み・復習中・未学習が自動で集計されます。続けるほど復習の間隔が伸びていきます。',
    icon: 'insights',
  },
];

export const HELP_SECTIONS: HelpSection[] = [
  {
    id: 'build',
    eyebrow: 'BUILD',
    label: '単語帳をつくる',
    summary: '4つのつくり方があります。1冊に入れられる単語数に上限はありません。',
    items: [
      {
        icon: 'photo_camera',
        title: 'AIスキャン',
        body:
          'ノート・プリント・市販の単語帳を撮ると、英単語と訳を読み取って単語帳にします。'
          + '抽出のしかたは「単語帳取込」「丸で囲んだ単語」「英検レベル」「熟語・イディオム」「カスタム（自由記述）」から選べます。'
          + '複数枚をまとめて読み取ることもできます。',
        href: '/scan',
        linkLabel: 'スキャンを開く',
        badge: 'pro',
      },
      {
        icon: 'edit_note',
        title: '手で入力する',
        body:
          '単語帳の「＋」から「手で入力」を選ぶと1語ずつ追加できます。'
          + '英単語を入れれば訳・発音記号・品詞は自動で補完されるので、意味を全部書く必要はありません。',
      },
      {
        icon: 'cloud_download',
        title: '共有単語帳を取り込む',
        body:
          '他のユーザーが公開した単語帳を自分の単語帳としてコピーできます。'
          + '取り込んだあとは自分の単語帳なので、自由に編集・削除できます。',
        href: '/shared',
        linkLabel: '共有を見る',
      },
      {
        icon: 'verified',
        title: '公式単語帳',
        body:
          'MERKENが用意した単語帳です。登録直後からいくつか入っていて、'
          + '共有ページの「公式」タブからいつでも追加で取り込めます。',
        href: '/shared?tab=official',
        linkLabel: '公式を見る',
      },
      {
        icon: 'swipe',
        title: 'リール',
        body:
          '共有・公式の単語をカード形式で縦にめくって眺められます。'
          + '気に入った単語帳はその場で取り込めます。無料プランは1日に見られる枚数に上限があります。',
        href: '/reels',
        linkLabel: 'リールを開く',
        badge: 'free-limited',
      },
    ],
  },
  {
    id: 'study',
    eyebrow: 'STUDY',
    label: '覚える',
    summary: '同じ単語帳を、その日の状況に合う解き方で回せます。どれで解いても記録は共通です。',
    items: [
      {
        icon: 'quiz',
        title: '四択クイズ',
        body:
          '単語帳の「クイズを始める」から。選択肢から意味を選びます。'
          + '正解は緑、不正解は赤で正しい意味が出て、「次へ」で進みます。声を出せない場所でも解けます。',
      },
      {
        icon: 'mic',
        title: '声で答える（音読チャレンジ）',
        body:
          'クイズ画面の右上のマイクから切り替えます。日本語で問題が読み上げられ、'
          + '英語を声に出して答えます。試行回数（1〜3回）を選べて、外すと「もう一回!」と促されます。'
          + 'マイクの許可が必要です。',
      },
      {
        icon: 'style',
        title: 'フラッシュカード',
        body:
          '単語帳のカードアイコンから。表に英単語、裏に意味のカードをめくって確認します。'
          + '覚えたかどうかを自分で判断したいときに向いています。',
      },
      {
        icon: 'favorite',
        title: 'お気に入りだけ復習',
        body:
          '単語に付けたお気に入りは、単語帳をまたいで1か所に集まります。'
          + '苦手な単語だけを集中して回したいときに使います。',
        href: '/favorites',
        linkLabel: 'お気に入りを開く',
      },
      {
        icon: 'event_repeat',
        title: '復習のタイミングは自動',
        body:
          '間隔反復（SM-2）で、正解した単語は次に出るまでの間隔が伸び、間違えた単語はすぐ戻ってきます。'
          + '自分で復習日を決める必要はありません。',
      },
    ],
  },
  {
    id: 'organize',
    eyebrow: 'ORGANIZE',
    label: '整理する・探す',
    summary: '単語帳が増えてきたら、バインダーでまとめて、検索で1語にたどり着けます。',
    items: [
      {
        icon: 'menu_book',
        title: '単語帳の一覧',
        body: '持っている単語帳が並びます。名前の変更・削除・並び替えもここから行います。',
        href: '/projects',
        linkLabel: '単語帳を開く',
      },
      {
        icon: 'folder',
        title: 'バインダー',
        body:
          '単語帳の「…」メニューから「バインダーに追加」で、複数の単語帳を1つの名前にまとめられます。'
          + '「英検2級」「学校の小テスト」のように用途でまとめると探しやすくなります。',
      },
      {
        icon: 'list_alt',
        title: 'すべての単語',
        body: '単語帳をまたいで、持っている単語を一覧で見られます。習得状況での絞り込みもできます。',
        href: '/words',
        linkLabel: '単語を開く',
      },
      {
        icon: 'search',
        title: '検索',
        body: '英単語・日本語訳のどちらからでも、自分の単語帳の中を横断して検索できます。',
        href: '/search',
        linkLabel: '検索を開く',
      },
    ],
  },
  {
    id: 'social',
    eyebrow: 'SOCIAL',
    label: 'みんなで使う',
    summary: 'つくった単語帳を公開したり、友だちと競ったりできます。',
    items: [
      {
        icon: 'share',
        title: '単語帳を公開・共有する',
        body:
          'つくった単語帳を共有ページに公開したり、リンクで友だちに渡したりできます。'
          + '公開はProプラン限定ですが、公開された単語帳を見て取り込むのは無料プランでもできます。',
        badge: 'pro',
      },
      {
        icon: 'groups',
        title: 'グループ',
        body:
          '招待コードで仲間と集まれます。グループに単語帳を追加すると全員で共有でき、'
          + '今週の学習量ランキングやグループ内対戦も使えます。',
        href: '/groups',
        linkLabel: 'グループを開く',
      },
      {
        icon: 'sports_esports',
        title: '単語対戦',
        body:
          '早押し四択の1対1リアルタイム対戦です。6桁の招待コードでのフレンド対戦、'
          + 'ランダムマッチ、グループ内マッチに対応しています。コインは消費しません。',
        href: '/battle',
        linkLabel: '対戦を開く',
        badge: 'pro',
      },
      {
        icon: 'menu_book',
        title: '語法問題集',
        body:
          '空欄補充の四択問題を解説つきで解けます。問題集の閲覧はログインすればでき、'
          + '自分で公開したり他の人の問題集を取り込んだりするのはProプラン限定です。',
        href: '/grammar',
        linkLabel: '語法問題集を開く',
      },
      {
        icon: 'person_add',
        title: 'フォローとフレンド',
        body:
          '他のユーザーをフォローすると公開単語帳を追いかけられます。'
          + 'フレンドになると学習記録やタイムラインをお互いに見られます。',
        href: '/profile',
        linkLabel: 'プロフィールを開く',
      },
    ],
  },
  {
    id: 'progress',
    eyebrow: 'PROGRESS',
    label: '記録と診断',
    summary: 'どれだけ覚えたか、いまどのレベルかを確かめられます。',
    items: [
      {
        icon: 'insights',
        title: '学習記録',
        body:
          '今日の学習量・正答率・連続日数と、習得済み／復習中／未学習の内訳が見られます。'
          + 'カレンダーの色の濃さはその日の学習量です。',
        href: '/stats',
        linkLabel: '記録を開く',
      },
      {
        icon: 'military_tech',
        title: '語彙力レベル診断',
        body: '20問に答えると、いまの語彙力が英検の何級あたりかを判定します。何度でも受けられます。',
        href: '/level-test',
        linkLabel: '診断を受ける',
      },
      {
        icon: 'lightbulb',
        title: '豆知識',
        body:
          '接頭語・接尾語・接中語のパーツ辞典です。パーツの意味が分かると、'
          + '初めて見る単語でも意味と品詞を推測できます。',
        href: '/tips',
        linkLabel: '豆知識を開く',
      },
    ],
  },
  {
    id: 'plan',
    eyebrow: 'PLAN',
    label: 'プランとコイン',
    summary: '無料プランとProプランの違いです。',
    items: [
      {
        icon: 'person',
        title: '無料プランでできること',
        body:
          '共有・公式単語帳の取り込み、手入力での単語追加、クイズ・カード・音読チャレンジ、'
          + '学習記録、ログイン時のクラウド同期まで使えます。単語帳は50冊まで、'
          + '1冊に入る単語数に制限はありません。スキャンは使えません。',
      },
      {
        icon: 'auto_awesome',
        title: 'Proプランでできること',
        body:
          'AIスキャン、単語帳・語法問題集の公開、単語対戦が解放され、単語帳の冊数も無制限になります。',
        href: '/subscription',
        linkLabel: 'プランを見る',
      },
      {
        icon: 'toll',
        title: 'コイン',
        body:
          'Proプランのスキャンはコインを消費します。毎月付与されるぶんはその月のうちに使い切りで、'
          + '購入したコインは有効期限なしで残ります。'
          + '消費枚数はモードと枚数で変わり、語源解析・例文生成を付けるとその分だけ増えます。',
        href: '/coins',
        linkLabel: 'コインを見る',
      },
    ],
  },
];

export interface HelpFaq {
  question: string;
  answer: string;
  href?: string;
  linkLabel?: string;
}

export const HELP_FAQS: HelpFaq[] = [
  {
    question: 'スマホとパソコンで同じ単語帳を使えますか？',
    answer:
      '使えます。ログインしていれば無料プランでもクラウドに保存され、別の端末でログインすると同じ単語帳が出てきます。'
      + 'ログインしていないと、その端末の中だけの保存になります。',
  },
  {
    question: 'オフラインでも使えますか？',
    answer:
      '一度開いた単語帳は端末内にも保存されるので、通信がなくても閲覧とクイズはできます。'
      + '学習結果はオンラインに戻ったときにまとめて同期されます。',
  },
  {
    question: 'スキャンでうまく読み取れません。',
    answer:
      '明るい場所で、紙が斜めにならないように、1ページずつ撮ると精度が上がります。'
      + '読み取ったあとの確認画面で単語と訳を直してから保存できるので、少しの間違いはそこで直せます。',
  },
  {
    question: 'ホーム画面から開けますか？',
    answer:
      'できます。ブラウザの共有メニューから「ホーム画面に追加」を選ぶと、アプリのように全画面で起動します。'
      + '音読チャレンジもホーム画面から起動した状態で使えます。',
  },
  {
    question: 'Proプランを解約するとデータは消えますか？',
    answer:
      '消えません。ただし解約後は単語帳が閲覧のみになり、新しく追加したり編集したりはできなくなります。'
      + '再度Proにすると元どおり編集できます。',
    href: '/settings/account/plan',
    linkLabel: 'プランを確認する',
  },
  {
    question: '退会したい／データを全部消したい。',
    answer:
      '設定 > プラン・アカウント管理 > アカウント削除から行えます。'
      + 'ログイン情報とクラウド上の学習データがすべて削除され、元に戻せません。',
    href: '/settings/account/delete',
    linkLabel: 'アカウント削除',
  },
  {
    question: '不具合を見つけた／要望がある。',
    answer: 'お問い合わせからご連絡ください。返信が必要な場合は連絡先も一緒にお知らせください。',
    href: '/contact',
    linkLabel: 'お問い合わせ',
  },
];
