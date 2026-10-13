'use client';

/**
 * デスクトップ幅のサポート系ページ (お問い合わせ / 規約類 / 特商法)。
 * 本文はスマホと共通のコンポーネント (components/support/SupportDoc) を使う。
 */

import type { ReactNode } from 'react';
import { DesktopHeader } from '@/components/desktop/DesktopChrome';
import {
  ContactBody,
  LegalDocBody,
  TokushoBody,
  type LegalArticle,
  type TokushoSection,
} from '@/components/support/SupportDoc';
import { Icon } from '@/components/ui/Icon';

export type { TokushoSection };

function DesktopStandaloneShell({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className="hidden h-screen lg:block">
      <div className="ds-app">
        <DesktopHeader />
        <div className="ds-main">
          <div className="ds-top">
            <button type="button" className="ds-iconbtn" onClick={onBack} style={{ width: 38, height: 38 }} aria-label="戻る">
              <Icon name="arrow_back" />
            </button>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="crumb">設定 / サポート</div>
              <h1>{title}</h1>
            </div>
          </div>
          <div className="ds-scroll">
            <div style={{ width: 'min(100%, 680px)', margin: '0 auto', paddingBottom: 48 }}>{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DesktopContactView({ onBack }: { onBack: () => void }) {
  return (
    <DesktopStandaloneShell title="お問い合わせ" onBack={onBack}>
      <ContactBody />
    </DesktopStandaloneShell>
  );
}

export function DesktopLegalDocView({
  title,
  updated,
  intro,
  articles,
  onBack,
}: {
  title: string;
  updated: string;
  intro: string;
  /** 目次は本文側で articles から組むので受け取るだけ（呼び出し側の互換用）。 */
  toc?: string[];
  articles: LegalArticle[];
  onBack: () => void;
}) {
  return (
    <DesktopStandaloneShell title={title} onBack={onBack}>
      <LegalDocBody intro={intro} articles={articles} updated={updated} />
    </DesktopStandaloneShell>
  );
}

export function DesktopTokushoView({
  onBack,
  sections,
  updated,
}: {
  onBack: () => void;
  sections: TokushoSection[];
  updated: string;
}) {
  return (
    <DesktopStandaloneShell title="特定商取引法に基づく表記" onBack={onBack}>
      <TokushoBody sections={sections} updated={updated} />
    </DesktopStandaloneShell>
  );
}
