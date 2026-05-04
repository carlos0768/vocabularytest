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
        <DefRow label="販売事業者名">原田浩司</DefRow>
        <DefRow label="運営統括責任者">原田浩司</DefRow>
        <DefRow label="サービス名">MERKEN</DefRow>
        <DefRow label="所在地">〒810-0001<br />福岡県福岡市中央区天神2丁目2番12号<br />T&Jビルディング7F</DefRow>
        <DefRow label="電話番号">090-1077-1208<br />受付時間: 9:00–20:00</DefRow>
        <DefRow label="メールアドレス" last>
          <a href="mailto:support@merken.jp" className="font-mono text-[var(--color-accent)]">support@merken.jp</a>
        </DefRow>
      </Section>

      <Section label="販売価格">
        <DefRow label="無料プラン">¥0</DefRow>
        <DefRow label="Pro（月額）" last>¥300（税込）／ 月</DefRow>
      </Section>

      <Section label="支払いと提供時期">
        <DefRow label="支払方法">クレジットカード決済（Stripe / Visa, Mastercard 等）</DefRow>
        <DefRow label="商品代金以外の料金">インターネット接続に必要な通信料等はお客様のご負担となります。</DefRow>
        <DefRow label="支払時期">有料プランの申込時に初回決済が行われ、以後は毎月の更新日に自動で課金されます。</DefRow>
        <DefRow label="提供時期" last>決済完了後、直ちにご利用いただけます。</DefRow>
      </Section>

      <Section label="その他">
        <DefRow label="返品・返金">デジタルサービスの性質上、決済完了後の返品・返金は原則としてお受けしておりません。</DefRow>
        <DefRow label="解約方法">アプリ内の設定画面から期間末解約の手続きが可能です。解約後も契約期間終了日まではご利用いただけます。</DefRow>
        <DefRow label="動作環境" last>iOS 16.0 以降 / Android 10 以降 / 主要モダンブラウザ</DefRow>
      </Section>

      <Footer updated="2026年4月13日" />
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
        最終更新 {updated} · MERKEN
      </div>
    </div>
  );
}
