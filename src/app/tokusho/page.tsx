'use client';

import { type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { DesktopTokushoView, type TokushoSection } from '@/components/desktop/DesktopSupport';
import { Icon } from '@/components/ui/Icon';

const TOKUSHO_UPDATED = '2026年4月13日';

const TOKUSHO_SECTIONS: TokushoSection[] = [
  {
    label: '販売事業者',
    rows: [
      { label: '販売事業者名', value: '原田浩司' },
      { label: '運営統括責任者', value: '原田浩司' },
      { label: 'サービス名', value: 'MERKEN' },
      {
        label: '所在地',
        value: (
          <>
            〒810-0001<br />
            福岡県福岡市中央区天神2丁目2番12号<br />
            T&Jビルディング7F
          </>
        ),
      },
      {
        label: '電話番号',
        value: (
          <>
            090-1077-1208<br />
            受付時間: 9:00–20:00
          </>
        ),
      },
      {
        label: 'メールアドレス',
        value: <a href="mailto:support@merken.jp" className="font-mono text-[var(--color-accent)]">support@merken.jp</a>,
      },
    ],
  },
  {
    label: '販売価格',
    rows: [
      { label: '無料プラン', value: '¥0' },
      { label: 'Pro（月額）', value: '¥300（税込）／ 月' },
    ],
  },
  {
    label: '支払いと提供時期',
    rows: [
      { label: '支払方法', value: 'クレジットカード決済（Stripe / Visa, Mastercard 等）' },
      { label: '商品代金以外の料金', value: 'インターネット接続に必要な通信料等はお客様のご負担となります。' },
      { label: '支払時期', value: '有料プランの申込時に初回決済が行われ、以後は毎月の更新日に自動で課金されます。' },
      { label: '提供時期', value: '決済完了後、直ちにご利用いただけます。' },
    ],
  },
  {
    label: 'その他',
    rows: [
      { label: '返品・返金', value: 'デジタルサービスの性質上、決済完了後の返品・返金は原則としてお受けしておりません。' },
      { label: '解約方法', value: 'アプリ内の設定画面から期間末解約の手続きが可能です。解約後も契約期間終了日まではご利用いただけます。' },
      { label: '動作環境', value: 'iOS 16.0 以降 / Android 10 以降 / 主要モダンブラウザ' },
    ],
  },
];

export default function TokushoPage() {
  const router = useRouter();

  return (
    <>
      <DesktopTokushoView onBack={() => router.back()} sections={TOKUSHO_SECTIONS} updated={TOKUSHO_UPDATED} />
      <div className="relative min-h-screen bg-[var(--color-background)] pt-3 font-[var(--font-body)] lg:hidden">
      {/* Header */}
      <div className="px-[18px] pb-3.5 pt-1">
        <div className="mb-0.5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-[38px] w-[38px] items-center justify-center rounded-[19px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
          >
            <Icon name="chevron_left" size={16} />
          </button>
          <div className="font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">ACCOUNT / SUPPORT</div>
        </div>
        <div className="mt-1.5 font-display text-2xl font-extrabold leading-[1.15] tracking-[-0.02em] text-[var(--solid-ink)]">
          特定商取引法<br />に基づく表記
        </div>
        <div className="mt-1.5 font-mono text-[10px] tracking-[0.02em] text-[var(--color-muted)]">SPECIFIED COMMERCIAL TRANSACTIONS ACT</div>
      </div>

      {/* Intro */}
      <div className="px-[18px] pb-3.5">
        <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-[#faf7f1] p-[12px_14px]">
          <p className="m-0 text-[11px] leading-[1.75] text-[var(--solid-ink)]">
            特定商取引法第11条に基づき、Pro 購読サービスの提供に関する事項を以下の通り表示します。
          </p>
        </div>
      </div>

      {TOKUSHO_SECTIONS.map((section) => (
        <Section key={section.label} label={section.label}>
          {section.rows.map((row, index) => (
            <DefRow key={row.label} label={row.label} last={index === section.rows.length - 1}>
              {row.value}
            </DefRow>
          ))}
        </Section>
      ))}

      <Footer updated={TOKUSHO_UPDATED} />
      </div>
    </>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="px-[18px] pb-3">
      <div className="pb-1.5 pl-1 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
        {label}
      </div>
      <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white p-[12px_14px]">
        {children}
      </div>
    </div>
  );
}

function DefRow({ label, children, last }: { label: string; children: ReactNode; last?: boolean }) {
  return (
    <div
      className="grid grid-cols-[92px_1fr] gap-2.5 py-2.5"
      style={{ borderBottom: last ? 'none' : '1px solid var(--color-border)' }}
    >
      <div className="font-mono text-[10px] font-bold tracking-[0.02em] text-[var(--color-muted)]">{label}</div>
      <div className="text-[11.5px] leading-[1.7] text-[var(--solid-ink)]">{children}</div>
    </div>
  );
}

function Footer({ updated }: { updated: string }) {
  return (
    <div className="px-[18px] pb-[110px] pt-1">
      <div className="text-center font-mono text-[9px] tracking-[0.04em] text-[var(--color-muted)]">
        最終更新 {updated} · MERKEN
      </div>
    </div>
  );
}
