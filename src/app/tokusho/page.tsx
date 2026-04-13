import type { Metadata } from 'next';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { STRIPE_CONFIG } from '@/lib/stripe/config';

export const metadata: Metadata = {
  title: '特定商取引法に基づく表記 | MERKEN',
  description: 'MERKENの特定商取引法に基づく表記です。',
  alternates: {
    canonical: '/tokusho',
  },
};

const commercialDisclosureItems = [
  {
    label: '販売事業者名',
    value: '原田浩司',
  },
  {
    label: '運営統括責任者',
    value: '原田浩司',
  },
  {
    label: 'サービス名',
    value: 'MERKEN',
  },
  {
    label: '所在地',
    value: '〒810-0001\n福岡県福岡市中央区天神2丁目2番12号T&Jビルディング7F',
  },
  {
    label: '電話番号',
    value: '090-1077-1208\n受付時間: 9:00-20:00',
  },
  {
    label: 'メールアドレス',
    value: 'support@merken.jp',
    href: 'mailto:support@merken.jp',
  },
  {
    label: '販売価格',
    value: `無料プラン: ¥0\n${STRIPE_CONFIG.plans.pro.name}: 月額 ¥${STRIPE_CONFIG.plans.pro.price.toLocaleString()}`,
  },
  {
    label: '商品代金以外の必要料金',
    value: 'インターネット接続に必要な通信料等は、お客様のご負担となります。',
  },
  {
    label: '支払方法',
    value: 'クレジットカード決済（Stripe）',
  },
  {
    label: '支払時期',
    value: '有料プランの申込時に初回決済が行われ、以後は毎月の更新日に自動で課金されます。',
  },
  {
    label: 'サービス提供時期',
    value: '決済完了後、直ちにご利用いただけます。',
  },
  {
    label: '返品・返金',
    value: 'デジタルサービスの性質上、決済完了後の返品・返金は原則としてお受けしておりません。',
  },
  {
    label: '解約方法',
    value: 'アプリ内の設定画面から期間末解約の手続きが可能です。解約後も契約期間終了日まではご利用いただけます。',
  },
];

export default function TokushoPage() {
  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <header className="sticky top-0 bg-[var(--color-background)]/95 z-40 px-6 py-4">
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <Link href="/settings" className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
            <Icon name="arrow_back" size={20} className="text-[var(--color-foreground)]" />
          </Link>
          <h1 className="text-xl font-bold text-[var(--color-foreground)]">特定商取引法に基づく表記</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8">
        <div className="card p-6 space-y-8 text-[var(--color-foreground)] leading-relaxed">
          <div className="space-y-2">
            <p className="text-sm text-[var(--color-muted)]">最終更新日: 2026年4月13日</p>
            <p className="text-sm text-[var(--color-muted)]">
              本ページは、MERKENの有料プランに関する特定商取引法に基づく表記です。
            </p>
          </div>

          <section className="space-y-4">
            {commercialDisclosureItems.map((item) => (
              <div
                key={item.label}
                className="grid gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 md:grid-cols-[200px_1fr] md:gap-4"
              >
                <h2 className="text-sm font-semibold text-[var(--color-muted)]">{item.label}</h2>
                {item.href ? (
                  <a href={item.href} className="whitespace-pre-line break-words font-medium text-[var(--color-primary)]">
                    {item.value}
                  </a>
                ) : (
                  <p className="whitespace-pre-line break-words">{item.value}</p>
                )}
              </div>
            ))}
          </section>
        </div>
      </main>
    </div>
  );
}
