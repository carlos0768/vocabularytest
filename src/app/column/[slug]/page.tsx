import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MarketingShell, ArticlePage } from '@/components/marketing';
import { COLUMNS, getColumn } from '@/lib/marketing/articles';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return COLUMNS.map((article) => ({ slug: article.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = getColumn(slug);
  if (!article) return {};
  return {
    title: `${article.title} | MERKEN学習コラム`,
    description: article.description,
    alternates: {
      canonical: `/column/${article.slug}`,
    },
    openGraph: {
      title: article.title,
      description: article.description,
      url: `https://www.merken.jp/column/${article.slug}`,
      siteName: 'MERKEN',
      type: 'article',
      locale: 'ja_JP',
    },
  };
}

export default async function ColumnArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = getColumn(slug);
  if (!article) notFound();

  const related = COLUMNS.filter((item) => item.slug !== article.slug).slice(0, 3);

  return (
    <MarketingShell active="column">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: article.title,
            description: article.description,
            dateModified: article.updated,
            inLanguage: 'ja',
            author: { '@type': 'Organization', name: 'MERKEN' },
            publisher: { '@type': 'Organization', name: 'MERKEN', url: 'https://www.merken.jp' },
            mainEntityOfPage: `https://www.merken.jp/column/${article.slug}`,
          }),
        }}
      />
      <ArticlePage article={article} sectionHref="/column" sectionLabel="学習コラム" related={related} />
    </MarketingShell>
  );
}
