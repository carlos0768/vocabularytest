'use client';

import { useRouter } from 'next/navigation';
import { DesktopContactView } from '@/components/desktop/DesktopSupport';
import { Icon } from '@/components/ui/Icon';

export default function ContactPage() {
  const router = useRouter();

  return (
    <>
      <DesktopContactView onBack={() => router.back()} />
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
        <div className="mt-1.5 font-display text-2xl font-extrabold leading-[1.15] tracking-[-0.02em] text-[var(--solid-ink)]">お問い合わせ</div>
        <div className="mt-1.5 font-mono text-[10px] tracking-[0.02em] text-[var(--color-muted)]">CONTACT · サポートチーム直通</div>
      </div>

      {/* Hero card */}
      <div className="px-[18px] pb-3.5">
        <div className="relative">
          <div className="absolute inset-0 translate-x-[2.5px] translate-y-[2.5px] rounded-xl bg-[var(--solid-ink)]" />
          <div
            className="relative rounded-xl border-2 border-[var(--solid-ink)] p-3.5"
            style={{ background: 'linear-gradient(135deg, oklch(0.94 0.06 130), #fff)' }}
          >
            <div className="flex items-center gap-1">
              <span className="font-mono text-[9px] font-bold tracking-[0.08em] text-[var(--color-accent)]">SUPPORT</span>
              <span className="mx-1 h-[3px] w-[3px] rounded-full bg-[var(--color-muted)]" />
              <span className="font-mono text-[9px] text-[var(--color-muted)]">通常 2 営業日以内に返信</span>
            </div>
            <div className="mt-1 font-display text-base font-bold text-[var(--solid-ink)]">気軽に聞いてください</div>
            <div className="mt-1 text-[11px] leading-[1.6] text-[var(--color-muted)]">
              バグ報告、機能リクエスト、課金に関するお問い合わせ、すべてここから。
            </div>
          </div>
        </div>
      </div>

      {/* Contact */}
      <div className="px-[18px] pb-3">
        <div className="pb-1.5 pl-1 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">連絡先</div>
        <a
          href="mailto:support@merken.jp"
          className="flex items-center gap-3 rounded-xl border-2 border-[var(--solid-ink)] bg-white p-[12px_14px] transition-all duration-100 active:translate-x-px active:translate-y-px"
        >
          <span className="inline-flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-[8px] bg-[rgba(26,26,26,0.05)] text-[var(--solid-ink)]">
            <Icon name="mail" size={16} />
          </span>
          <span className="flex-1 font-mono text-[13px] font-semibold text-[var(--solid-ink)]">support@merken.jp</span>
          <Icon name="chevron_right" size={14} className="text-[var(--color-muted)]" />
        </a>
      </div>

      {/* FAQ */}
      <Section label="よくある質問">
        <FaqRow q="Pro を解約したい" a="設定 > アカウントの「サブスクリプション管理」から、いつでも次回更新をキャンセルできます。解約後も契約期間終了日まではご利用いただけます。" />
        <FaqRow q="機種変更でデータ移行" a="同じメールアドレスで再ログインすると、学習データが自動同期されます。" />
        <FaqRow q="アカウントを削除したい" a="お問い合わせメールにてご連絡ください。アカウント削除時にすべての関連データを削除します。" last />
      </Section>

      <div className="px-[18px] pb-[110px] pt-1">
        <div className="text-center font-mono text-[9px] tracking-[0.04em] text-[var(--color-muted)]">
          MERKEN
        </div>
      </div>
      </div>
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
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

function FaqRow({ q, a, last }: { q: string; a: string; last?: boolean }) {
  return (
    <div className="py-2.5" style={{ borderBottom: last ? 'none' : '1px solid var(--color-border)' }}>
      <div className="mb-1 flex items-start gap-2">
        <span className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[var(--solid-ink)] font-mono text-[9px] font-bold text-white">
          Q
        </span>
        <span className="text-xs font-bold leading-[1.5] text-[var(--solid-ink)]">{q}</span>
      </div>
      <div className="pl-6 text-[11px] leading-[1.7] text-[var(--color-muted)]">{a}</div>
    </div>
  );
}
