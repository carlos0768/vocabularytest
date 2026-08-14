'use client';

import { useRouter } from 'next/navigation';
import { StudyReminderSettings } from '@/components/settings/StudyReminderSettings';
import { ExampleGenreSettings } from '@/components/settings/ExampleGenreSettings';
import { Icon } from '@/components/ui';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';

export default function CustomizePage() {
  const router = useRouter();

  return (
    <>
      <div className="hidden h-full min-h-0 flex-col lg:flex">
        <div className="ds-top">
          <button
            type="button"
            className="ds-iconbtn"
            onClick={() => router.push('/settings')}
            style={{ width: 38, height: 38 }}
            aria-label="設定へ戻る"
          >
            <Icon name="arrow_back" />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="crumb">設定 / カスタマイズ</div>
            <h1>カスタマイズ</h1>
          </div>
        </div>
        <div className="ds-scroll">
          <div style={{ width: 'min(100%, 720px)', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <StudyReminderSettings variant="desktop" />
            <ExampleGenreSettings variant="desktop" />
          </div>
        </div>
      </div>

      <div className="relative min-h-screen bg-[var(--color-background)] pb-[110px] font-[var(--font-body)] lg:hidden">
        <StickyPageHeader
          eyebrow="CUSTOMIZE"
          title="カスタマイズ"
          backLabel="設定へ戻る"
          onBack={() => router.push('/settings')}
          className="mb-3"
        />

        <div className="px-[18px] pb-3">
          <StudyReminderSettings variant="mobile" />
        </div>

        <div className="px-[18px] pb-3">
          <ExampleGenreSettings variant="mobile" />
        </div>
      </div>
    </>
  );
}
