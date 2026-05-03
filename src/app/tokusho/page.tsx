'use client';

import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';

export default function TokushoPage() {
  const router = useRouter();

  return (
    <div className="relative min-h-screen bg-[var(--color-background)] pt-3 font-[var(--font-body)]">
      {/* Header */}
      <div className="px-[18px] pb-3.5 pt-1">
        <div className="mb-0.5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-[38px] w-[38px] items-center justify-center rounded-[19px] border-[1.25px] border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] shadow-[2px_2px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px active:shadow-none"
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
        <div className="rounded-xl border-[1.25px] border-[var(--solid-ink)] bg-[#faf7f1] p-[12px_14px] shadow-[2.5px_2.5px_0_var(--solid-ink)]">
          <p className="m-0 text-[11px] leading-[1.75] text-[var(--solid-ink)]">
            特定商取引法第11条に基づき、Pro 購読サービスの提供に関する事項を以下の通り表示します。
          </p>
        </div>
      </div>

      <Section label="販売事業者">
        <DefRow label="事業者名">Merken, Inc.（メルケン株式会社）</DefRow>
        <DefRow label="代表者">代表取締役 山田 健太</DefRow>
        <DefRow label="所在地">〒150-0002 東京都渋谷区渋谷 1-2-3 Merken Building 4F</DefRow>
        <DefRow label="連絡先" last>
          電話 03-0000-0000（受付 平日 10:00–18:00）<br />
          <span className="font-mono">support@merken.jp</span>
        </DefRow>
      </Section>

      <Section label="販売価格">
        <DefRow label="Pro 月額">¥600（税込）／ 月</DefRow>
        <DefRow label="Pro 年額">¥4,800（税込）／ 年</DefRow>
        <DefRow label="無料トライアル" last>初回購読時 7 日間（年額のみ）</DefRow>
      </Section>

      <Section label="支払いと提供時期">
        <DefRow label="支払方法">App Store / Google Play / クレジットカード（Visa, Mastercard, JCB, AMEX）</DefRow>
        <DefRow label="支払時期">購読開始時に初回課金、以降は購読期間ごとに自動更新</DefRow>
        <DefRow label="商品引渡時期" last>決済完了後、即時に Pro 機能をご利用いただけます</DefRow>
      </Section>

      <Section label="その他">
        <DefRow label="返品・解約">デジタル商品の性質上、購入後の返金は原則として承っておりません。次回更新のキャンセルは、購読プラットフォームの設定からいつでも可能です。</DefRow>
        <DefRow label="動作環境">iOS 16.0 以降 / Android 10 以降 / 主要モダンブラウザ</DefRow>
        <DefRow label="販売数量" last>制限なし</DefRow>
      </Section>

      <Footer updated="2026.01.05" />
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-[18px] pb-3">
      <div className="pb-1.5 pl-1 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
        {label}
      </div>
      <div className="rounded-xl border-[1.25px] border-[var(--solid-ink)] bg-white p-[12px_14px] shadow-[2.5px_2.5px_0_var(--solid-ink)]">
        {children}
      </div>
    </div>
  );
}

function DefRow({ label, children, last }: { label: string; children: React.ReactNode; last?: boolean }) {
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
        最終更新 {updated} · Merken, Inc.
      </div>
    </div>
  );
}
