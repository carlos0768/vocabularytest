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

  // 戻るは履歴を 1 つ戻す。push('/settings') だと履歴に「設定」が積まれ、
  // ブラウザの戻るで使い方ガイドへ、またガイドの戻るで設定へ…と往復し続ける。
  // 履歴が無い (直接開いた) ときだけ設定へ遷移する。
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

      <div className="relative min-h-screen bg-[var(--color-background)] pb-[110px] font-[var(--font-body)] desktop:hidden">
        <StickyPageHeader
          eyebrow="HELP"
          title="使い方ガイド"
          backLabel="設定へ戻る"
          onBack={goBack}
          className="mb-3"
        />

        <div className="mx-auto w-full max-w-[560px] px-[18px]">
          <HelpGuide />
        </div>
      </div>
    </>
  );
}
