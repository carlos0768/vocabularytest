'use client';

import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';

export default function ContactPage() {
  const router = useRouter();

  return (
    <div className="relative min-h-screen bg-[var(--color-background)] pt-3 font-[var(--font-body)]">
      {/* Header */}
      <div className="px-[18px] pb-3.5 pt-1">
        <div className="mb-0.5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border-[1.25px] border-[var(--solid-ink)] bg-white text-[var(--solid-ink)]"
          >
            <Icon name="chevron_left" size={14} />
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
            className="relative rounded-xl border-[1.25px] border-[var(--solid-ink)] p-3.5"
            style={{ background: 'linear-gradient(135deg, oklch(0.94 0.06 130), #fff)' }}
          >
            <div className="flex items-center gap-1">
              <span className="font-mono text-[9px] font-bold tracking-[0.08em] text-[var(--color-accent)]">SUPPORT</span>
              <span className="mx-1 h-[3px] w-[3px] rounded-full bg-[var(--color-muted)]" />
              <span className="font-mono text-[9px] text-[var(--color-muted)]">平均返信 1 営業日以内</span>
            </div>
            <div className="mt-1 font-display text-base font-bold text-[var(--solid-ink)]">気軽に聞いてください</div>
            <div className="mt-1 text-[11px] leading-[1.6] text-[var(--color-muted)]">
              バグ報告、機能リクエスト、課金に関するお問い合わせ、すべてここから。
            </div>
          </div>
        </div>
      </div>

      {/* Contact channels */}
      <Section label="連絡方法">
        <ContactRow icon="mail" label="メール" hint="support@merken.jp" mono />
        <ContactRow icon="chat" label="アプリ内チャット" hint="設定 > ヘルプ" />
        <ContactRow icon="share" label="X (Twitter)" hint="@merken_app" mono last />
      </Section>

      {/* Form */}
      <Section label="フォームから送る">
        <FormField label="お名前" placeholder="山田 太郎" />
        <FormField label="メールアドレス" placeholder="you@example.com" mono />
        <FormSelect label="種別" value="不具合の報告" />
        <FormTextarea label="内容" placeholder="どんな状況で何が起きたか、できるだけ詳しく教えてください。" />
        <div className="mt-3">
          <div className="relative">
            <div className="absolute inset-0 translate-x-[2.5px] translate-y-[2.5px] rounded-xl bg-[var(--solid-ink)]" />
            <div className="relative flex items-center justify-center gap-1.5 rounded-xl border-[1.25px] border-[var(--solid-ink)] bg-[var(--solid-ink)] py-3 text-sm font-bold text-white">
              送信する
              <Icon name="chevron_right" size={14} />
            </div>
          </div>
        </div>
      </Section>

      {/* FAQ */}
      <Section label="よくある質問">
        <FaqRow q="Pro を解約したい" a="App Store / Google Play の購読管理から、いつでも次回更新をオフにできます。" />
        <FaqRow q="機種変更でデータ移行" a="同じメールアドレスで再ログインすると、学習データが自動同期されます。" />
        <FaqRow q="アカウントを削除したい" a="設定 > アカウント > アカウント削除から、30 日以内にデータが完全削除されます。" last />
      </Section>

      <div className="px-[18px] pb-[110px] pt-1">
        <div className="text-center font-mono text-[9px] tracking-[0.04em] text-[var(--color-muted)]">
          最終更新 2026.01.05 · Merken, Inc.
        </div>
      </div>
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

function ContactRow({ icon, label, hint, mono, last }: { icon: string; label: string; hint: string; mono?: boolean; last?: boolean }) {
  return (
    <div
      className="flex items-center gap-2.5 py-[11px]"
      style={{ borderBottom: last ? 'none' : '1px solid var(--color-border)' }}
    >
      <span className="inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] bg-[rgba(26,26,26,0.05)] text-[var(--solid-ink)]">
        <Icon name={icon} size={16} />
      </span>
      <span className="flex-1 text-[13px] font-medium text-[var(--solid-ink)]">{label}</span>
      {hint && <span className={`text-[11px] text-[var(--color-muted)] ${mono ? 'font-mono' : ''}`}>{hint}</span>}
      <Icon name="chevron_right" size={14} className="text-[var(--color-muted)]" />
    </div>
  );
}

function FormField({ label, placeholder, mono }: { label: string; placeholder: string; mono?: boolean }) {
  return (
    <div className="mb-2.5">
      <div className="mb-1 font-mono text-[9px] font-bold tracking-[0.06em] text-[var(--color-muted)]">{label}</div>
      <div className={`rounded-lg border border-[var(--color-border)] bg-[#faf7f1] px-[11px] py-[9px] text-xs text-[var(--color-muted)] ${mono ? 'font-mono' : ''}`}>
        {placeholder}
      </div>
    </div>
  );
}

function FormSelect({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-2.5">
      <div className="mb-1 font-mono text-[9px] font-bold tracking-[0.06em] text-[var(--color-muted)]">{label}</div>
      <div className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[#faf7f1] px-[11px] py-[9px] text-xs font-medium text-[var(--solid-ink)]">
        <span className="flex-1">{value}</span>
        <Icon name="chevron_right" size={12} className="text-[var(--color-muted)]" />
      </div>
    </div>
  );
}

function FormTextarea({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <div>
      <div className="mb-1 font-mono text-[9px] font-bold tracking-[0.06em] text-[var(--color-muted)]">{label}</div>
      <div className="min-h-[76px] rounded-lg border border-[var(--color-border)] bg-[#faf7f1] px-[11px] py-2.5 text-xs leading-[1.7] text-[var(--color-muted)]">
        {placeholder}
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
