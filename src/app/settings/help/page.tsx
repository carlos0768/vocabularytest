'use client';

/**
 * 設定 > 使い方ガイド。MERKENの機能と使い方をアプリ内で読めるページ。
 * /guide (マーケティング用のSEOページ) とは別物で、こちらはログイン後の
 * ユーザーが「どこに何があるか」を引くためのもの。
 */

import { useRouter } from 'next/navigation';
import { HelpGuide } from '@/components/settings/HelpGuide';
import { Icon } from '@/components/ui';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';

export default function SettingsHelpPage() {
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
            <div className="crumb">設定 / 使い方ガイド</div>
            <h1>使い方ガイド</h1>
          </div>
        </div>
        <div className="ds-scroll">
          <div style={{ width: 'min(100%, 720px)', margin: '0 auto' }}>
            <HelpGuide />
          </div>
        </div>
      </div>

      <div className="relative min-h-screen bg-[var(--color-background)] pb-[110px] font-[var(--font-body)] lg:hidden">
        <StickyPageHeader
          eyebrow="HELP"
          title="使い方ガイド"
          backLabel="設定へ戻る"
          onBack={() => router.push('/settings')}
          className="mb-3"
        />

        <div className="mx-auto w-full max-w-[560px] px-[18px]">
          <HelpGuide />
        </div>
      </div>
    </>
  );
}
