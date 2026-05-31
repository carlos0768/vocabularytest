'use client';

import { useRouter } from 'next/navigation';
import { DesktopLegalDocView } from '@/components/desktop/DesktopSupport';
import { Icon } from '@/components/ui/Icon';

const TERMS_ARTICLES = [
  { h: '適用', p: ['本規約は、本サービスの利用に関わる一切の関係に適用されます。運営者はサービス内において本規約のほか個別の規定を定めることがあり、両者が異なる場合は個別規定が優先します。'] },
  { h: 'サービス内容', p: ['本サービスは、画像から英単語を抽出し、日本語訳とクイズを自動生成する学習支援サービスです。AI技術を利用しているため、抽出結果や翻訳の正確性を完全に保証するものではありません。'] },
  { h: 'アカウント登録', p: ['本サービスの一部機能はアカウント登録が必要です。利用者は、登録時に正確な情報を提供するものとします。'], list: ['ユーザーは正確な情報を登録するものとします。', 'アカウントの管理はユーザーの責任とします。', 'アカウントの第三者への譲渡・貸与は禁止します。'] },
  { h: '禁止事項', p: ['利用者は、本サービスの利用にあたり以下の行為をしてはなりません。'], list: ['法令または公序良俗に違反する行為', 'サービスの運営を妨害する行為（リバースエンジニアリング、過度なリクエストを含む）', '不正アクセスまたはそれを試みる行為', '本サービスを商業目的で無断利用する行為', '虚偽の情報を登録する行為'] },
  { h: '有料プラン (Pro)', p: ['Proプランは月額課金制です。支払いはStripeを通じて処理されます。解約はいつでも可能で、解約後も契約期間終了日まではご利用いただけます。返金は原則として行いません。'] },
  { h: '知的財産権', p: ['本サービスに関する知的財産権は運営者に帰属します。ユーザーが登録した単語・例文等のコンテンツの権利はユーザーに帰属しますが、本サービスの提供・改善のため必要な範囲で利用する権利を許諾するものとします。'] },
  { h: '免責事項', list: ['AIによる抽出・翻訳結果の正確性は保証しません。', 'サービスの中断・停止による損害について責任を負いません。', 'ユーザー間または第三者とのトラブルについて責任を負いません。'] },
  { h: 'サービスの変更・終了', p: ['運営者は、事前の通知なくサービス内容の変更または終了を行うことがあります。これにより利用者に生じた損害について、運営者は責任を負いません。'] },
  { h: '準拠法・管轄', p: ['本規約は日本法に準拠します。本サービスに関して紛争が生じた場合、福岡地方裁判所を第一審の専属的合意管轄裁判所とします。'] },
  { h: 'お問い合わせ', p: ['本規約に関するお問い合わせは support@merken.jp までご連絡ください。'] },
];

export default function TermsPage() {
  const router = useRouter();

  return (
    <>
      <DesktopLegalDocView
        title="利用規約"
        updated="2026年2月24日"
        intro="本規約は、MERKEN（以下「本サービス」）の利用に関する条件を定めるものです。ユーザーは本規約に同意の上、本サービスを利用するものとします。"
        toc={TERMS_ARTICLES.map((article) => article.h)}
        articles={TERMS_ARTICLES}
        onBack={() => router.back()}
      />
      <div className="relative min-h-screen bg-[var(--color-background)] pt-3 font-[var(--font-body)] lg:hidden">
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
        <div className="mt-1.5 font-display text-2xl font-extrabold leading-[1.15] tracking-[-0.02em] text-[var(--solid-ink)]">利用規約</div>
        <div className="mt-1.5 font-mono text-[10px] tracking-[0.02em] text-[var(--color-muted)]">MERKEN TERMS OF SERVICE · 全 10 条</div>
      </div>

      {/* Intro */}
      <div className="px-[18px] pb-3.5">
        <div className="rounded-xl border-[1.25px] border-[var(--solid-ink)] bg-[#faf7f1] p-[12px_14px] shadow-[2.5px_2.5px_0_var(--solid-ink)]">
          <p className="m-0 text-[11px] leading-[1.75] text-[var(--solid-ink)]">
            本規約は、MERKEN（以下「本サービス」）の利用に関する条件を定めるものです。ユーザーは本規約に同意の上、本サービスを利用するものとします。
          </p>
        </div>
      </div>

      <Section num="1" label="適用">
        <P>本規約は、本サービスの利用に関わる一切の関係に適用されます。運営者はサービス内において本規約のほか個別の規定を定めることがあり、両者が異なる場合は個別規定が優先します。</P>
      </Section>

      <Section num="2" label="サービス内容">
        <P>本サービスは、画像から英単語を抽出し、日本語訳とクイズを自動生成する学習支援サービスです。AI技術を利用しているため、抽出結果や翻訳の正確性を完全に保証するものではありません。</P>
      </Section>

      <Section num="3" label="アカウント登録">
        <P>本サービスの一部機能はアカウント登録が必要です。利用者は、登録時に正確な情報を提供するものとします。</P>
        <OL items={[
          'ユーザーは正確な情報を登録するものとします。',
          'アカウントの管理はユーザーの責任とします。',
          'アカウントの第三者への譲渡・貸与は禁止します。',
        ]} />
      </Section>

      <Section num="4" label="禁止事項">
        <P>利用者は、本サービスの利用にあたり以下の行為をしてはなりません。</P>
        <OL items={[
          '法令または公序良俗に違反する行為',
          'サービスの運営を妨害する行為（リバースエンジニアリング、過度なリクエストを含む）',
          '不正アクセスまたはそれを試みる行為',
          '本サービスを商業目的で無断利用する行為',
          '虚偽の情報を登録する行為',
        ]} />
      </Section>

      <Section num="5" label="有料プラン (Pro)">
        <P>Proプランは月額課金制です。支払いはStripeを通じて処理されます。解約はいつでも可能で、解約後も契約期間終了日まではご利用いただけます。返金は原則として行いません。</P>
      </Section>

      <Section num="6" label="知的財産権">
        <P>本サービスに関する知的財産権は運営者に帰属します。ユーザーが登録した単語・例文等のコンテンツの権利はユーザーに帰属しますが、本サービスの提供・改善のため必要な範囲で利用する権利を許諾するものとします。</P>
      </Section>

      <Section num="7" label="免責事項">
        <OL items={[
          'AIによる抽出・翻訳結果の正確性は保証しません。',
          'サービスの中断・停止による損害について責任を負いません。',
          'ユーザー間または第三者とのトラブルについて責任を負いません。',
        ]} />
      </Section>

      <Section num="8" label="サービスの変更・終了">
        <P>運営者は、事前の通知なくサービス内容の変更または終了を行うことがあります。これにより利用者に生じた損害について、運営者は責任を負いません。</P>
      </Section>

      <Section num="9" label="準拠法・管轄">
        <P>本規約は日本法に準拠します。本サービスに関して紛争が生じた場合、福岡地方裁判所を第一審の専属的合意管轄裁判所とします。</P>
      </Section>

      <Section num="10" label="お問い合わせ">
        <div className="mt-1 rounded-lg border border-[var(--color-border)] bg-[#faf7f1] px-3 py-2.5">
          <div className="font-mono text-[9px] font-bold tracking-[0.08em] text-[var(--color-muted)]">CONTACT</div>
          <a href="mailto:support@merken.jp" className="mt-1 block font-mono text-xs text-[var(--color-accent)]">support@merken.jp</a>
        </div>
      </Section>

      <Footer updated="2026年2月24日" />
      </div>
    </>
  );
}

function Section({ num, label, children }: { num: string; label: string; children: React.ReactNode }) {
  return (
    <div className="px-[18px] pb-3">
      <div className="flex items-baseline gap-1.5 pb-1.5 pl-1 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
        <span className="text-[var(--solid-ink)]">§{num}</span>
        <span>{label}</span>
      </div>
      <div className="rounded-xl border-[1.25px] border-[var(--solid-ink)] bg-white p-[12px_14px] shadow-[2.5px_2.5px_0_var(--solid-ink)]">
        {children}
      </div>
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="m-0 text-[11.5px] leading-[1.75] text-[var(--solid-ink)]">{children}</p>;
}

function OL({ items }: { items: string[] }) {
  return (
    <ol className="mt-1.5 space-y-0.5 pl-[18px]">
      {items.map((t, i) => (
        <li key={i} className="pl-0.5 text-[11.5px] leading-[1.75] text-[var(--solid-ink)]">{t}</li>
      ))}
    </ol>
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
