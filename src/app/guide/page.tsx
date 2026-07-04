import type { Metadata } from 'next';
import { MarketingShell, ArticleIndex } from '@/components/marketing';
import { GUIDES } from '@/lib/marketing/articles';

export const metadata: Metadata = {
  title: '使い方ガイド | MERKEN',
  description:
    'MERKENの使い方ガイド一覧。無料での始め方、AIスキャンの抽出モード、クイズ・フラッシュカード、習得度の見方まで、学習の流れを順番に解説します。',
  alternates: {
    canonical: '/guide',
  },
  openGraph: {
    title: '使い方ガイド | MERKEN',
    description: '登録からスキャン、クイズ、学習記録の見方まで。MERKENの使い方をまとめて解説。',
    url: 'https://www.merken.jp/guide',
    siteName: 'MERKEN',
    type: 'website',
    locale: 'ja_JP',
  },
};

export default function GuideIndexPage() {
  return (
    <MarketingShell active="guide">
      <ArticleIndex
        heading="使い方ガイド"
        lead="MERKENの機能を、学習の流れに沿って解説します。初めての方は「無料で始める」から順に読むのがおすすめです。"
        articles={GUIDES}
        basePath="/guide"
      />
    </MarketingShell>
  );
}
