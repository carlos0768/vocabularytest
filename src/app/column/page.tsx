import type { Metadata } from 'next';
import { MarketingShell, ArticleIndex } from '@/components/marketing';
import { COLUMNS } from '@/lib/marketing/articles';

export const metadata: Metadata = {
  title: '英語学習コラム | MERKEN',
  description:
    '忘却曲線と間隔反復、英検の級別語彙、例文学習、句動詞の覚え方など、英単語学習に役立つ知識をまとめたコラムです。',
  alternates: {
    canonical: '/column',
  },
  openGraph: {
    title: '英語学習コラム | MERKEN',
    description: '記憶の科学から英検対策まで。英単語学習に役立つコラムを掲載しています。',
    url: 'https://www.merken.jp/column',
    siteName: 'MERKEN',
    type: 'website',
    locale: 'ja_JP',
  },
};

export default function ColumnIndexPage() {
  return (
    <MarketingShell active="column">
      <ArticleIndex
        heading="英語学習コラム"
        lead="単語がなかなか覚えられないのは、記憶力ではなく方法の問題かもしれません。記憶研究の知見や試験対策の考え方など、英単語学習に役立つ知識をまとめています。"
        articles={COLUMNS}
        basePath="/column"
      />
    </MarketingShell>
  );
}
