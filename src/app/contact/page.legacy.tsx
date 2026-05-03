'use client';

import { Icon } from '@/components/ui/Icon';
import { SolidHeader, SolidPage, SolidPanel } from '@/components/redesign/SolidPage';

export default function ContactPage() {
  return (
    <SolidPage maxWidth="max-w-2xl">
      <SolidHeader
        eyebrow="SUPPORT"
        title="お問い合わせ"
        description="不具合の報告、機能要望、課金に関する相談はこちらから連絡できます。"
        backHref="/settings"
      />
        <SolidPanel className="space-y-4 p-6">
          <p className="text-[var(--color-foreground)] leading-relaxed">
            MERKENに関するご質問、不具合のご報告、ご要望などがございましたら、以下のメールアドレスまでお気軽にご連絡ください。
          </p>

          <a
            href="mailto:support@merken.jp"
            className="flex items-center gap-3 rounded-[var(--solid-radius-sm)] border-[1.5px] border-[var(--solid-ink)] bg-[var(--color-surface-secondary)] p-4 transition-colors hover:bg-[var(--color-accent-subtle)]"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-[12px] border-[1.5px] border-[var(--solid-ink)] bg-[var(--color-surface)]">
              <Icon name="mail" size={20} className="text-[var(--solid-ink)]" />
            </div>
            <span className="font-semibold text-[var(--color-foreground)]">support@merken.jp</span>
          </a>

          <p className="text-sm text-[var(--color-muted)]">
            通常2営業日以内にご返信いたします。
          </p>
        </SolidPanel>
    </SolidPage>
  );
}
