'use client';

import { useRouter } from 'next/navigation';
import { StudyReminderSettings } from '@/components/settings/StudyReminderSettings';
import { ExampleGenreSettings } from '@/components/settings/ExampleGenreSettings';
import { Icon } from '@/components/ui';

export default function CustomizePage() {
  const router = useRouter();

  return (
    <div className="relative min-h-screen bg-[var(--color-background)] pb-[110px] pt-3 font-[var(--font-body)] lg:hidden">
      <div className="px-[18px] pb-[14px] pt-1">
        <button
          type="button"
          onClick={() => router.push('/settings')}
          className="mb-2 inline-flex items-center gap-0.5 font-display text-[12px] font-bold text-[var(--color-muted)]"
        >
          <Icon name="chevron_left" size={16} />
          設定
        </button>
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">CUSTOMIZE</div>
        <div className="mt-0.5 font-display text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] text-[var(--solid-ink)]">カスタマイズ</div>
      </div>

      <div className="px-[18px] pb-3">
        <StudyReminderSettings variant="mobile" />
      </div>

      <div className="px-[18px] pb-3">
        <ExampleGenreSettings variant="mobile" />
      </div>
    </div>
  );
}
