'use client';

import { useRouter } from 'next/navigation';
import { StudyReminderSettings } from '@/components/settings/StudyReminderSettings';
import { ExampleGenreSettings } from '@/components/settings/ExampleGenreSettings';
import { WordDisplaySettings } from '@/components/settings/WordDisplaySettings';
import { Icon } from '@/components/ui';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';

export default function CustomizePage() {
  const router = useRouter();

  // push('/settings') だと履歴に設定が積まれ、ブラウザの戻るでここへ引き戻される。
  const goBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.replace('/settings');
  };

  return (
    <>
      <div className="hidden h-full min-h-0 flex-col desktop:flex">
        <div className="ds-top">
          <button
            type="button"
            className="ds-iconbtn"
            onClick={goBack}
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
            <WordDisplaySettings variant="desktop" />
          </div>
        </div>
      </div>

      <div className="relative min-h-screen bg-[var(--color-background)] pb-[110px] font-[var(--font-body)] desktop:hidden">
        <StickyPageHeader
          eyebrow="CUSTOMIZE"
          title="カスタマイズ"
          backLabel="設定へ戻る"
          onBack={goBack}
          className="mb-3"
        />

        <div className="px-[18px] pb-3">
          <StudyReminderSettings variant="mobile" />
        </div>

        <div className="px-[18px] pb-3">
          <ExampleGenreSettings variant="mobile" />
        </div>

        <div className="px-[18px] pb-3">
          <WordDisplaySettings variant="mobile" />
        </div>
      </div>
    </>
  );
}
