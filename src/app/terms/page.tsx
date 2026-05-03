'use client';

import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';

export default function TermsPage() {
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
        <div className="mt-1.5 font-display text-2xl font-extrabold leading-[1.15] tracking-[-0.02em] text-[var(--solid-ink)]">利用規約</div>
        <div className="mt-1.5 font-mono text-[10px] tracking-[0.02em] text-[var(--color-muted)]">MERKEN TERMS OF SERVICE · 全 9 条</div>
      </div>

      {/* Intro */}
      <div className="px-[18px] pb-3.5">
        <div className="rounded-xl border-[1.25px] border-[var(--solid-ink)] bg-[#faf7f1] p-[12px_14px] shadow-[2.5px_2.5px_0_var(--solid-ink)]">
          <p className="m-0 text-[11px] leading-[1.75] text-[var(--solid-ink)]">
            この利用規約（以下「本規約」）は、Merken, Inc.（以下「当社」）が提供する語学学習アプリ「Merken」（以下「本サービス」）の利用条件を定めるものです。本サービスを利用する全てのお客様（以下「利用者」）は、本規約に同意の上ご利用ください。
          </p>
        </div>
      </div>

      <Section num="1" label="適用">
        <P>本規約は、当社と利用者との間の本サービスの利用に関わる一切の関係に適用されます。当社はサービス内において、本規約のほか個別の規定（以下「個別規定」）を定めることがあります。個別規定は本規約の一部を構成するものとし、両者が異なる場合は個別規定が優先します。</P>
      </Section>

      <Section num="2" label="アカウント登録">
        <P>本サービスの一部機能はアカウント登録が必要です。利用者は、登録時に正確な情報を提供するものとし、登録情報に変更があった場合は速やかに更新するものとします。</P>
        <OL items={[
          '13歳未満の方は、保護者の同意を得てご利用ください。',
          'アカウントの不正利用が疑われる場合、当社は予告なく利用を停止できます。',
          '一人の利用者が複数のアカウントを保有することを禁止します。',
        ]} />
      </Section>

      <Section num="3" label="禁止事項">
        <P>利用者は、本サービスの利用にあたり以下の行為をしてはなりません。</P>
        <OL items={[
          '法令または公序良俗に違反する行為',
          '当社、他の利用者、第三者の権利を侵害する行為',
          'サービスの運営を妨害する行為（リバースエンジニアリング、過度なリクエストを含む）',
          '本サービスを商用目的で第三者に再販・再配布する行為',
          '虚偽の情報を登録する行為',
        ]} />
      </Section>

      <Section num="4" label="有料プラン (Pro)">
        <P>Pro プランは月額または年額での自動継続課金です。料金は App Store / Google Play / Web 決済を通じて請求されます。期間途中での解約による日割り返金は行いません。</P>
      </Section>

      <Section num="5" label="知的財産権">
        <P>本サービスに関する著作権、商標権、その他一切の知的財産権は当社または正当な権利者に帰属します。利用者が登録した単語・例文等のコンテンツの著作権は利用者に帰属しますが、利用者は当社に対し、本サービスの提供・改善のため必要な範囲で利用する権利を許諾するものとします。</P>
      </Section>

      <Section num="6" label="免責事項">
        <P>当社は、本サービスの内容・機能・正確性について、特定の目的への適合性、商品性、完全性、継続性を含めいかなる保証も行いません。本サービスに起因して利用者に生じた損害について、当社の故意または重大な過失がある場合を除き、当社は責任を負いません。</P>
      </Section>

      <Section num="7" label="サービスの変更・終了">
        <P>当社は、利用者への事前の通知なく本サービスの内容を変更し、または提供を終了することができます。これにより利用者に生じた損害について、当社は責任を負いません。</P>
      </Section>

      <Section num="8" label="規約の変更">
        <P>当社は必要と判断した場合、利用者への通知をもって本規約を変更できます。変更後の規約は、当社が定める効力発生日から適用されます。</P>
      </Section>

      <Section num="9" label="準拠法・管轄">
        <P>本規約は日本法に準拠します。本サービスに関して紛争が生じた場合、当社の本店所在地を管轄する裁判所を第一審の専属的合意管轄裁判所とします。</P>
      </Section>

      <Footer updated="2026.01.05" />
    </div>
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
        最終更新 {updated} · Merken, Inc.
      </div>
    </div>
  );
}
