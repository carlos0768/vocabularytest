import Image from 'next/image';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { LpDemoSection } from '@/components/home/LpDemoSection';
import { isBillingEnabled } from '@/lib/billing/feature';

const ROOT_LANDING_SCAN_MODES = [
  {
    label: '単語帳取込',
    title: '単語帳の単語を抽出',
    body: '単語帳やノートに「英単語＋日本語訳」のペアで載っている単語だけを取り込みます。',
    icon: 'document_scanner',
  },
  {
    label: '丸囲み',
    title: '覚えたい単語だけ',
    body: 'ペンで丸を付けた単語を優先して抽出。授業中に印を付けた紙面をそのまま使えます。',
    icon: 'gesture',
  },
  {
    label: '英検',
    title: '級に合わせて選別',
    body: '5級から1級まで、選んだ英検レベルに合わせて単語を抽出します。',
    icon: 'filter_alt',
  },
  {
    label: '熟語・イディオム',
    title: '複数語の表現も保存',
    body: 'take care のような複数語の表現も、単語帳とクイズの対象にできます。',
    icon: 'link',
  },
];

const ROOT_LANDING_WORKFLOW = [
  {
    step: '01',
    label: 'CAPTURE',
    title: '撮る',
    body: 'ノート、教科書、プリントをカメラで撮影するか、写真から選びます。',
  },
  {
    step: '02',
    label: 'EXTRACT',
    title: '抽出する',
    body: 'AIが英単語、和訳、品詞、例文、発音記号の候補を作ります。',
  },
  {
    step: '03',
    label: 'SAVE',
    title: '確認して保存',
    body: '抽出結果を確認し、必要なら編集して自分の単語帳へ追加します。',
  },
  {
    step: '04',
    label: 'REVIEW',
    title: '覚える',
    body: '4択、語順クイズ、フラッシュカードで復習し、習得度を記録します。',
  },
];

const ROOT_LANDING_STUDY_FEATURES = [
  {
    title: '4択クイズ',
    body: 'AIが用意した選択肢でテンポよく復習。正答結果は単語の習得度に反映されます。',
    icon: 'quiz',
  },
  {
    title: '語順クイズ',
    body: '2語以上の表現は、下の単語を選んで並べる形式のクイズとして出題できます。',
    icon: 'view_column_2',
  },
  {
    title: 'フラッシュカード',
    body: '単語をめくりながら確認。習得度順、品詞順、保存済みの単語で学習できます。',
    icon: 'style',
  },
  {
    title: '保存済み単語',
    body: '気になる単語だけを保存して、カードや10問クイズですぐに復習できます。',
    icon: 'bookmark',
  },
];

const ROOT_LANDING_FAQS = [
  {
    q: '無料プランでも学習はできますか？',
    a: 'はい。無料プランでも共有ライブラリからの単語帳インポート、手動での単語追加、4択クイズ、フラッシュカードを使えます。保存は100単語までが上限で、写真からのAIスキャンはProプラン限定です。',
  },
  {
    q: 'Proにすると何が変わりますか？',
    a: 'Proでは写真からのAIスキャンが無制限で使えるほか、クラウド同期とマルチデバイス対応が有効になります。撮るだけで単語帳を作りたい人、複数端末で同じ単語帳を扱いたい人向けです。',
  },
  {
    q: 'どんな抽出モードがありますか？',
    a: '単語帳取込、丸囲み、英検レベル、熟語・イディオムの4種類です（スキャンはProプランの機能です）。教材の種類と目的に合わせて切り替えられます。詳しくは使い方ガイドをご覧ください。',
  },
  {
    q: '登録方法は？',
    a: 'メールとOTP認証、またはGoogle / Appleログインで始められます。登録後はそのままホーム画面に進みます。',
  },
];

export function GuestLanding() {
  const billingEnabled = isBillingEnabled();

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f3f0e9] font-[var(--font-body)] text-[#1a1a1a] [background-image:radial-gradient(rgba(26,26,26,0.045)_1px,transparent_1px)] [background-size:22px_22px]">
      <header className="mx-auto max-w-[1200px] px-5 md:px-10">
        <div className="flex items-center justify-between border-b-2 border-[#1a1a1a] py-6">
          <RootLandingBrand />
          <nav className="flex items-center gap-7">
            <Link href="#how" className="hidden text-sm font-semibold hover:text-[var(--color-accent)] md:inline">使い方</Link>
            <Link href="#features" className="hidden text-sm font-semibold hover:text-[var(--color-accent)] md:inline">機能</Link>
            <Link href="#demo" className="hidden text-sm font-semibold hover:text-[var(--color-accent)] md:inline">体験する</Link>
            {billingEnabled && <Link href="#pricing" className="hidden text-sm font-semibold hover:text-[var(--color-accent)] md:inline">料金</Link>}
            <Link href="/login?redirect=/" className="hidden text-sm font-semibold hover:text-[var(--color-accent)] md:inline">ログイン</Link>
            <Link
              href="/signup?redirect=/"
              className="inline-flex items-center gap-2 rounded-full bg-[#1a1a1a] px-4 py-2 text-sm font-bold text-white"
            >
              無料で始める
              <Icon name="arrow_forward" size={16} />
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-[1200px] px-5 md:px-10">
        <div className="grid items-center gap-10 border-b-2 border-[#1a1a1a] py-14 lg:grid-cols-[1.05fr_1fr] lg:py-20">
          <div>
            <p className="mb-5 flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-accent)] before:h-[1.5px] before:w-5 before:bg-[var(--color-accent)]">
              AI vocabulary notebook
            </p>
            <h1 className="font-display text-[clamp(42px,7vw,78px)] font-black leading-[1.02] tracking-normal">
              手入力ゼロで、<br />
              <span className="text-[var(--color-accent)]">単語帳。</span>
            </h1>
            <p className="mt-6 max-w-[520px] text-base leading-8 text-[#555]">
              教科書・ノート・プリントを撮影するだけ。AIが英単語、和訳、例文、発音記号、クイズ素材を作り、あなた専用の単語帳として保存できます（AIスキャンはProプラン）。無料でも共有ライブラリから単語帳を取り込んで、すぐに学習を始められます。
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <Link
                href="/signup?redirect=/"
                className="inline-flex h-14 items-center justify-center gap-2 rounded-[14px] border-2 border-[#1a1a1a] bg-[#1a1a1a] px-7 text-base font-bold text-white shadow-[3px_4px_0_#000] transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_#000]"
              >
                無料で始める
                <Icon name="arrow_forward" size={18} />
              </Link>
              <Link
                href="#how"
                className="inline-flex items-center gap-2 border-b-2 border-[#1a1a1a] px-1 py-1 font-display text-sm font-bold text-[#1a1a1a] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              >
                使い方を見る
                <Icon name="arrow_forward" size={16} />
              </Link>
            </div>
            <div className="mt-9 flex flex-wrap gap-7 border-t border-dashed border-[#1a1a1a]/20 pt-6">
              {[
                ['4', '抽出モード（Pro）'],
                ['無料', '共有単語帳の取込'],
                ['100語', '無料保存枠'],
              ].map(([num, label]) => (
                <div key={label}>
                  <div className="font-display text-2xl font-black leading-none">{num}</div>
                  <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[#8a857a]">{label}</div>
                </div>
              ))}
            </div>
          </div>
          <RootLandingHeroVisual />
        </div>
      </section>

      {/* 語彙力レベル診断 — 登録不要で遊べるバイラル導線 */}
      <section className="border-b-2 border-[#1a1a1a] bg-[#1a1a1a] text-white" aria-label="語彙力レベル診断">
        <div className="mx-auto flex max-w-[1200px] flex-col items-start gap-5 px-5 py-10 md:flex-row md:items-center md:justify-between md:px-10">
          <div>
            <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-accent)]">
              Vocabulary level test
            </p>
            <h2 className="mt-2 font-display text-[clamp(26px,4vw,40px)] font-black leading-tight">
              あなたの語彙力は<span className="text-[var(--color-accent)]">英検何級</span>レベル?
            </h2>
            <p className="mt-2 text-sm leading-6 text-white/70">
              20問・約3分の4択クイズで語彙レベルと推定語彙数を診断。無料・登録不要。
            </p>
          </div>
          <Link
            href="/level-test"
            className="inline-flex h-14 shrink-0 items-center justify-center gap-2 rounded-[14px] border-2 border-white px-7 text-base font-bold text-white shadow-[3px_4px_0_rgba(255,255,255,0.35)] transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
            style={{ background: 'linear-gradient(120deg,#15803d,#137FEC,#7C3AED,#EE2A7B)' }}
          >
            いますぐ診断する
            <Icon name="arrow_forward" size={18} />
          </Link>
        </div>
      </section>

      <section className="overflow-hidden border-b-2 border-[#1a1a1a] py-5" aria-label="MERKENで扱える教材">
        <div className="mx-auto flex max-w-[1200px] flex-wrap gap-x-8 gap-y-3 px-5 font-display text-lg font-black md:px-10">
          {['教科書', 'プリント', 'ノート', '英検対策', '熟語・イディオム', '保存済み復習', 'フラッシュカード'].map((item, index) => (
            <span key={item} className={`inline-flex items-center gap-3 ${index % 2 === 1 ? 'text-[#8a857a]' : 'text-[#1a1a1a]'}`}>
              {item}
              <span className="h-1.5 w-1.5 bg-[var(--color-accent)]" />
            </span>
          ))}
        </div>
      </section>

      <section id="how" className="mx-auto max-w-[1200px] border-b-2 border-[#1a1a1a] px-5 py-16 md:px-10 lg:py-24">
        <RootLandingSectionHeading
          number="01"
          label="How it works"
          title={<>撮る、確認する、<br />覚える。</>}
          body="手入力やコピペを前提にせず、教材の写真から単語帳を作ります（AIスキャンはProプラン）。登録後すぐにホーム、単語帳、クイズへ進める構成です。"
        />
        <div className="grid border-l-[1.5px] border-t-2 border-[#1a1a1a] md:grid-cols-2 lg:grid-cols-4">
          {ROOT_LANDING_WORKFLOW.map((item, index) => (
            <article key={item.step} className="flex min-h-[280px] flex-col gap-4 border-b-2 border-r-[1.5px] border-[#1a1a1a] bg-[#faf7f1] p-6">
              <div className="flex items-baseline gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-[#8a857a]">
                <span className="text-[var(--color-accent)]">{item.step}</span>
                {item.label}
              </div>
              <h3 className="font-display text-2xl font-black">{item.title}</h3>
              <p className="text-[13px] leading-6 text-[#555]">{item.body}</p>
              <div className="mt-auto flex h-[130px] items-center justify-center overflow-hidden rounded-[10px] border-2 border-[#1a1a1a] bg-white p-4">
                <RootLandingStepArt index={index} />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section id="features" className="mx-auto max-w-[1200px] border-b-2 border-[#1a1a1a] px-5 py-16 md:px-10 lg:py-24">
        <RootLandingSectionHeading
          number="02"
          label="What's inside"
          title={<>単語学習に必要な機能を、<br />ひとつのアプリに。</>}
          body="単語帳の作成、スキャン、クイズでの復習、進捗管理まで。英単語学習に必要な流れを、迷わず使えるようにまとめています。"
        />

        <div className="grid gap-16 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div>
            <p className="mb-3 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-[#8a857a]">
              <span className="text-[var(--color-accent)]">01</span> Scan modes
            </p>
            <h3 className="font-display text-[clamp(28px,3vw,40px)] font-black leading-[1.1]">目的に合わせて、抽出方法を選ぶ。</h3>
            <p className="mt-5 max-w-[500px] text-[15px] leading-8 text-[#555]">
              まずは「すべての単語」で広く取り込み、必要に応じて丸囲み、英検、熟語・イディオムへ切り替えます。抽出後は確認画面で編集してから保存できます（スキャンはProプランの機能です）。
            </p>
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {ROOT_LANDING_SCAN_MODES.map((mode) => (
                <article key={mode.label} className="rounded-[14px] border-2 border-[#1a1a1a] bg-[#faf7f1] p-4 shadow-[3px_4px_0_#1a1a1a]">
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
                    <Icon name={mode.icon} size={20} />
                  </div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-accent)]">{mode.label}</p>
                  <h4 className="mt-1 font-display text-lg font-black">{mode.title}</h4>
                  <p className="mt-2 text-xs leading-6 text-[#555]">{mode.body}</p>
                </article>
              ))}
            </div>
          </div>
          <div className="rounded-[18px] border-2 border-[#1a1a1a] bg-[#faf7f1] p-4 shadow-[4px_6px_0_#1a1a1a]">
            <Image
              src="/lp/scan-modes.png"
              alt="MERKENのスキャンモード画面"
              width={900}
              height={720}
              className="h-auto w-full rounded-[12px] border border-[#1a1a1a]/15"
            />
          </div>
        </div>

        <div className="mt-20 grid gap-16 border-t border-dashed border-[#1a1a1a]/20 pt-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="order-2 rounded-[16px] border-2 border-[#1a1a1a] bg-[#fffdf7] p-7 shadow-[4px_6px_0_#1a1a1a] [background-image:linear-gradient(transparent_31px,rgba(26,26,26,0.08)_32px,transparent_33px)] [background-size:100%_32px] lg:order-1">
            <div className="border-l border-[#e8b4b8] pl-6">
              <div className="flex items-baseline justify-between gap-4">
                <div>
                  <p className="font-display text-4xl font-black">take care</p>
                  <p className="mt-1 font-mono text-xs text-[#8a857a]">AI generated pronunciation</p>
                </div>
                <span className="rounded-full border border-[#1a1a1a]/40 px-3 py-1 font-mono text-[10px]">phrase</span>
              </div>
              <p className="mt-5 text-base leading-8">世話をする、気をつける</p>
              <div className="mt-4">
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[#8a857a]">example</p>
                <p className="mt-1 text-sm leading-8 text-[#555]">
                  Please <em className="border-b border-[#1a1a1a]/30 text-[#1a1a1a]">take care</em> of your notes after class.
                </p>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                {['4択', '語順クイズ', '例文', '発音記号'].map((tag) => (
                  <span key={tag} className="rounded-full border border-[#1a1a1a]/40 px-3 py-1 font-mono text-[10px] font-bold text-[#555]">{tag}</span>
                ))}
              </div>
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <p className="mb-3 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-[#8a857a]">
              <span className="text-[var(--color-accent)]">02</span> Word detail
            </p>
            <h3 className="font-display text-[clamp(28px,3vw,40px)] font-black leading-[1.1]">保存した単語は、学習用データになる。</h3>
            <p className="mt-5 max-w-[500px] text-[15px] leading-8 text-[#555]">
              和訳だけでなく、例文、品詞、発音記号、クイズ用の選択肢を持てる構造です。2語以上の表現は語順クイズとして扱い、4択だけに寄せすぎないようにしています。
            </p>
          </div>
        </div>

        <div className="mt-20 grid gap-6 border-t border-dashed border-[#1a1a1a]/20 pt-20 sm:grid-cols-2 lg:grid-cols-4">
          {ROOT_LANDING_STUDY_FEATURES.map((feature) => (
            <article key={feature.title} className="rounded-[16px] border-2 border-[#1a1a1a] bg-[#faf7f1] p-6 shadow-[4px_6px_0_#1a1a1a]">
              <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-[#1a1a1a] text-white">
                <Icon name={feature.icon} size={24} />
              </div>
              <h3 className="font-display text-xl font-black">{feature.title}</h3>
              <p className="mt-3 text-sm leading-7 text-[#555]">{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <LpDemoSection />

      <section className="mx-auto max-w-[1200px] border-b-2 border-[#1a1a1a] px-5 py-16 md:px-10 lg:py-24">
        <RootLandingSectionHeading
          number="04"
          label="Progress"
          title={<>ホームで、今日やることが<br />すぐ見える。</>}
          body="単語帳、習得度、連続日数、保存済み単語へアクセスできます。学習の入口をホームに集約し、スキャンから復習まで迷わない構成にしています。"
        />
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="grid gap-4">
            {[
              ['習得度', '習得、学習中、未学習を単語ごとに管理'],
              ['連続日数', '毎日の学習をホームで確認'],
              ['マイ単語帳', '直近の単語帳をホームから開ける'],
              ['保存済み', 'あとで見返したい単語だけを集めて復習'],
            ].map(([title, body]) => (
              <div key={title} className="rounded-[14px] border-2 border-[#1a1a1a] bg-[#faf7f1] p-5 shadow-[3px_4px_0_#1a1a1a]">
                <h3 className="font-display text-xl font-black">{title}</h3>
                <p className="mt-2 text-sm leading-7 text-[#555]">{body}</p>
              </div>
            ))}
          </div>
          <div className="rounded-[18px] border-2 border-[#1a1a1a] bg-[#faf7f1] p-4 shadow-[4px_6px_0_#1a1a1a]">
            <Image
              src="/lp/home.png"
              alt="MERKENのホーム画面"
              width={900}
              height={720}
              className="h-auto w-full rounded-[12px] border border-[#1a1a1a]/15"
            />
          </div>
        </div>
      </section>

      {billingEnabled && (
        <section id="pricing" className="mx-auto max-w-[1200px] border-b-2 border-[#1a1a1a] px-5 py-16 md:px-10 lg:py-24">
          <RootLandingSectionHeading
            number="05"
            label="Pricing"
            title={<>無料で始めて、<br />必要ならProへ。</>}
            body="料金と制限は実装中の設定に合わせています。まずは無料で試し、AIスキャンや同期が必要になったらProへ切り替えられます。"
          />
          <div className="grid gap-7 lg:grid-cols-2">
            <RootLandingPricingCard
              plan="Free"
              price="0"
              description="共有ライブラリの単語帳で、基本の復習を試すためのプランです。"
              features={['共有単語帳のインポート', '100単語まで保存', 'ローカル保存', '基本の単語帳・クイズ・カード']}
            />
            <RootLandingPricingCard
              plan="Pro"
              price="300"
              description="撮るだけ単語帳、複数端末、クラウド同期が必要な人向けのプランです。"
              features={['AIスキャン無制限', 'クラウド同期', 'マルチデバイス対応', 'データ永続化']}
              pro
            />
          </div>
        </section>
      )}

      <section id="faq" className="mx-auto max-w-[1200px] border-b-2 border-[#1a1a1a] px-5 py-16 md:px-10 lg:py-24">
        <RootLandingSectionHeading
          number="06"
          label="FAQ"
          title={<>よくある質問。</>}
          body="プランの違いや使い方について、よくいただく質問をまとめました。さらに詳しい解説は使い方ガイドと学習コラムにあります。"
        />
        <div className="border-t-2 border-[#1a1a1a]">
          {ROOT_LANDING_FAQS.map((item, index) => (
            <details key={item.q} className="group border-b-2 border-[#1a1a1a] py-6" open={index === 0}>
              <summary className="grid cursor-pointer list-none grid-cols-[64px_1fr_32px] items-start gap-4">
                <span className="pt-1 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-[#8a857a]">
                  Q. {String(index + 1).padStart(2, '0')}
                </span>
                <span className="font-display text-xl font-black leading-7">{item.q}</span>
                <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#1a1a1a] transition-transform group-open:rotate-45 group-open:bg-[#1a1a1a] group-open:text-white">
                  +
                </span>
              </summary>
              <p className="ml-[80px] mt-4 max-w-[720px] text-sm leading-7 text-[#555]">{item.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="bg-[#1a1a1a] px-5 py-20 text-white md:px-10 lg:py-24">
        <div className="mx-auto max-w-[1200px]">
          <p className="mb-4 flex items-center gap-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-accent)] before:h-[1.5px] before:w-5 before:bg-[var(--color-accent)]">
            Ready
          </p>
          <h2 className="max-w-[900px] font-display text-[clamp(40px,6vw,74px)] font-black leading-[1.02] tracking-normal">
            単語帳を、<br />もう手で作らなくていい。
          </h2>
          <p className="mt-6 max-w-[560px] text-base leading-8 text-white/70">
            ブラウザからすぐに開始できます。メールOTP、Google、Appleのいずれかで登録し、最初の単語帳を作成してください。
          </p>
          <div className="mt-9 flex flex-wrap gap-4">
            <Link
              href="/signup?redirect=/"
              className="inline-flex h-14 items-center justify-center gap-2 rounded-[14px] border-2 border-[#14532d] bg-[var(--color-accent)] px-7 text-base font-bold text-white shadow-[3px_4px_0_#14532d]"
            >
              無料で始める
              <Icon name="arrow_forward" size={18} />
            </Link>
            <Link
              href="/login?redirect=/"
              className="inline-flex items-center justify-center gap-2 border-b-2 border-white/40 px-1 py-1 font-display text-sm font-bold text-white transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
            >
              ログイン
              <Icon name="arrow_forward" size={16} />
            </Link>
          </div>
        </div>
      </section>

      <footer className="mx-auto max-w-[1200px] px-5 py-12 md:px-10">
        <div className="grid gap-10 border-b border-dashed border-[#1a1a1a]/20 pb-9 md:grid-cols-[1.7fr_1fr_1fr_1fr]">
          <div>
            <RootLandingBrand />
            <p className="mt-4 max-w-[360px] text-sm leading-7 text-[#555]">
              手入力ゼロで単語帳を作成。スキャン、単語帳、クイズ、フラッシュカードで英単語を復習するための学習アプリです。
            </p>
          </div>
          <div>
            <p className="mb-4 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[#8a857a]">Product</p>
            <ul className="flex flex-col gap-2 text-sm">
              <li><Link href="#features" className="hover:text-[var(--color-accent)]">機能</Link></li>
              {billingEnabled && <li><Link href="#pricing" className="hover:text-[var(--color-accent)]">料金</Link></li>}
              <li><Link href="/guide" className="hover:text-[var(--color-accent)]">使い方ガイド</Link></li>
              <li><Link href="/column" className="hover:text-[var(--color-accent)]">学習コラム</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-4 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[#8a857a]">Account</p>
            <ul className="flex flex-col gap-2 text-sm">
              <li><Link href="/signup?redirect=/" className="hover:text-[var(--color-accent)]">新規登録</Link></li>
              <li><Link href="/login?redirect=/" className="hover:text-[var(--color-accent)]">ログイン</Link></li>
              <li><Link href="/reset-password" className="hover:text-[var(--color-accent)]">パスワード再設定</Link></li>
            </ul>
          </div>
          <div>
            <p className="mb-4 font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-[#8a857a]">Legal</p>
            <ul className="flex flex-col gap-2 text-sm">
              <li><Link href="/terms" className="hover:text-[var(--color-accent)]">利用規約</Link></li>
              <li><Link href="/privacy" className="hover:text-[var(--color-accent)]">プライバシー</Link></li>
              <li><Link href="/tokusho" className="hover:text-[var(--color-accent)]">特商法表記</Link></li>
              <li><Link href="/contact" className="hover:text-[var(--color-accent)]">お問い合わせ</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.04em] text-[#8a857a]">
          <p>© {new Date().getFullYear()} MERKEN. All rights reserved.</p>
          <p>Built for English learners.</p>
        </div>
      </footer>
    </main>
  );
}
function RootLandingBrand() {
  return (
    <Link href="/" className="flex items-baseline gap-2" aria-label="MERKEN home">
      <span className="font-display text-[22px] font-black tracking-[0.14em] text-[#1a1a1a]">MERKEN</span>
      <span className="inline-block h-1.5 w-1.5 bg-[var(--color-accent)]" />
    </Link>
  );
}

function RootLandingSectionHeading({
  number,
  label,
  title,
  body,
}: {
  number: string;
  label: string;
  title: React.ReactNode;
  body: string;
}) {
  return (
    <div className="mb-10 grid gap-5 lg:mb-14 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
      <div>
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-accent)]">
          <span className="mr-3 text-[#8a857a]">{number} /</span>
          {label}
        </p>
        <h2 className="mt-3 font-display text-[clamp(30px,4vw,48px)] font-black leading-[1.06] tracking-normal text-[#1a1a1a]">
          {title}
        </h2>
      </div>
      <p className="max-w-[560px] text-[15px] leading-8 text-[#555] lg:pt-8">{body}</p>
    </div>
  );
}

function RootLandingHeroVisual() {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[560px]" aria-label="MERKENで写真からクイズまで作る流れ">
      <div className="absolute left-[2%] top-[12%] w-[62%] -rotate-[4deg] rounded-sm bg-[#fffdf7] px-6 py-7 shadow-[0_12px_28px_rgba(26,26,26,0.10),0_0_0_1px_rgba(26,26,26,0.10)] [background-image:linear-gradient(transparent_27px,rgba(26,26,26,0.08)_28px,transparent_29px)] [background-size:100%_28px]">
        <div className="absolute bottom-3 left-9 top-0 w-px bg-[#e8b4b8]" />
        <p className="absolute right-4 top-3 font-mono text-[10px] uppercase tracking-[0.08em] text-[#8a857a]">P. 142</p>
        <p className="relative z-10 mb-3 pl-5 font-display text-[13px] font-bold">Lesson 7 — Reading</p>
        {[
          ['The pattern was', 'ubiquitous', 'in'],
          ['modern', 'architecture', 'appearing'],
          ['Critics', 'lamented', 'the loss of'],
          ['others', 'embraced', 'its charm.'],
        ].map(([a, b, c]) => (
          <p key={`${a}-${b}`} className="relative z-10 pl-5 text-sm leading-7 text-[#1a1a1a]">
            {a} <span className="bg-[#f59e0b]/25 px-1">{b}</span> {c}
          </p>
        ))}
      </div>

      <div className="absolute left-[6%] top-[8%] z-20 aspect-[1/1.1] w-[58%]">
        <span className="absolute left-0 top-0 h-7 w-7 border-l-[2.5px] border-t-[2.5px] border-[#1a1a1a]" />
        <span className="absolute right-0 top-0 h-7 w-7 border-r-[2.5px] border-t-[2.5px] border-[#1a1a1a]" />
        <span className="absolute bottom-0 left-0 h-7 w-7 border-b-[2.5px] border-l-[2.5px] border-[#1a1a1a]" />
        <span className="absolute bottom-0 right-0 h-7 w-7 border-b-[2.5px] border-r-[2.5px] border-[#1a1a1a]" />
      </div>

      <svg className="absolute left-[54%] top-[34%] z-20 h-20 w-24" viewBox="0 0 90 80" fill="none" aria-hidden="true">
        <path d="M5 20 Q 50 0 75 60" stroke="#1a1a1a" strokeWidth="1.5" strokeDasharray="3 4" />
        <path d="M68 50 L75 60 L82 56" stroke="#1a1a1a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>

      <div className="absolute bottom-0 right-0 z-30 w-[56%] rotate-[5deg] rounded-[36px] bg-[#1a1a1a] p-2 shadow-[0_24px_50px_rgba(26,26,26,0.22),0_0_0_1.5px_#1a1a1a]">
        <div className="relative overflow-hidden rounded-[28px] bg-white">
          <div className="absolute left-1/2 top-2 z-10 h-[22px] w-[86px] -translate-x-1/2 rounded-full bg-[#1a1a1a]" />
          <Image
            src="/lp/quiz-new.png"
            alt="MERKENのクイズ画面"
            width={375}
            height={812}
            priority
            className="h-auto w-full"
          />
        </div>
      </div>

      <span className="absolute bottom-[8%] left-[4%] z-40 rounded-full bg-[#1a1a1a] px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-white">
        AI 抽出
      </span>
      <span className="absolute right-[8%] top-[4%] z-40 rotate-[4deg] rounded-full bg-[var(--color-accent)] px-3 py-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-white">
        + 単語帳へ
      </span>
    </div>
  );
}

function RootLandingStepArt({ index }: { index: number }) {
  if (index === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center rounded bg-gradient-to-br from-[#f5f1e8] to-[#e8e0d0]">
        <div className="relative flex h-16 w-20 items-center justify-center rounded-xl border-[2px] border-[#1a1a1a] bg-white">
          <Icon name="photo_camera" size={30} />
        </div>
      </div>
    );
  }

  if (index === 1) {
    return (
      <div className="w-full font-display text-[11px] leading-6 text-[#555]">
        <p>The pattern was <span className="rounded bg-[var(--color-accent)] px-1 text-white">ubiquitous</span></p>
        <p>in modern <span className="rounded bg-[var(--color-accent)]/15 px-1 text-[var(--color-accent-ink)]">architecture</span></p>
        <p>critics <span className="rounded bg-[var(--color-accent)] px-1 text-white">lamented</span> the loss</p>
      </div>
    );
  }

  if (index === 2) {
    return (
      <div className="w-full">
        <div className="mb-3 font-display text-lg font-black text-[#1a1a1a]">austere</div>
        {['厳格な', '簡素な', '派手な'].map((item, itemIndex) => (
          <div
            key={item}
            className={`mb-1.5 rounded-md border-2 border-[#1a1a1a] px-2 py-1 text-[10px] ${itemIndex === 1 ? 'bg-[var(--color-accent)] text-white' : 'bg-white text-[#1a1a1a]'}`}
          >
            {String.fromCharCode(65 + itemIndex)}. {item}
          </div>
        ))}
      </div>
    );
  }

  return (
    <svg className="h-full w-full" viewBox="0 0 240 130" preserveAspectRatio="none" aria-hidden="true">
      <line x1="10" y1="115" x2="230" y2="115" stroke="#1a1a1a" strokeWidth="1.5" />
      <line x1="10" y1="10" x2="10" y2="115" stroke="#1a1a1a" strokeWidth="1.5" />
      <path d="M10,15 Q 30,55 60,80 T 130,108 T 230,114" stroke="rgba(26,26,26,0.4)" strokeWidth="1.5" strokeDasharray="3 3" fill="none" />
      <path d="M10,15 Q 25,40 40,55 L 42,18 Q 70,40 90,55 L 92,20 Q 130,40 150,55 L 152,22 Q 200,40 230,52" stroke="#15803d" strokeWidth="2" fill="none" />
      <circle cx="42" cy="18" r="2.5" fill="#15803d" />
      <circle cx="92" cy="20" r="2.5" fill="#15803d" />
      <circle cx="152" cy="22" r="2.5" fill="#15803d" />
    </svg>
  );
}

function RootLandingPricingCard({
  plan,
  price,
  description,
  features,
  pro = false,
}: {
  plan: string;
  price: string;
  description: string;
  features: string[];
  pro?: boolean;
}) {
  return (
    <article className={`relative flex min-h-[430px] flex-col rounded-[20px] border-2 border-[#1a1a1a] p-8 shadow-[4px_6px_0_#1a1a1a] ${pro ? 'bg-[#1a1a1a] text-white' : 'bg-[#faf7f1] text-[#1a1a1a]'}`}>
      {pro && (
        <span className="absolute right-6 top-6 rounded-full bg-[var(--color-accent)] px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-white">
          Pro
        </span>
      )}
      <p className={`font-mono text-[11px] font-bold uppercase tracking-[0.14em] ${pro ? 'text-white/60' : 'text-[#8a857a]'}`}>{plan}</p>
      <h3 className="mt-3 font-display text-3xl font-black">{pro ? 'もっと続ける' : 'まず試す'}</h3>
      <div className={`my-5 flex items-end gap-2 border-b-2 pb-4 ${pro ? 'border-white/25' : 'border-[#1a1a1a]'}`}>
        <span className="font-display text-6xl font-black leading-none tracking-normal">{price}</span>
        <span className="pb-1 font-display text-base font-bold">円</span>
        <span className={`ml-auto pb-1 font-mono text-[11px] ${pro ? 'text-white/60' : 'text-[#8a857a]'}`}>/ 月</span>
      </div>
      <p className={`text-sm leading-7 ${pro ? 'text-white/70' : 'text-[#555]'}`}>{description}</p>
      <ul className="mt-6 flex flex-col gap-3">
        {features.map((feature) => (
          <li key={feature} className={`flex gap-3 text-sm leading-6 ${pro ? 'text-white' : 'text-[#1a1a1a]'}`}>
            <Icon name="arrow_forward" size={16} className="mt-1 text-[var(--color-accent)]" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      <div className="mt-auto pt-8">
        <Link
          href={pro ? '/signup?redirect=/subscription' : '/signup?redirect=/'}
          className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-[14px] border-2 border-[#1a1a1a] text-sm font-bold shadow-[2px_3px_0_#1a1a1a] ${pro ? 'bg-white text-[#1a1a1a]' : 'bg-[#1a1a1a] text-white'}`}
        >
          {pro ? '無料登録して始める' : '無料で始める'}
          <Icon name="arrow_forward" size={16} />
        </Link>
      </div>
    </article>
  );
}
