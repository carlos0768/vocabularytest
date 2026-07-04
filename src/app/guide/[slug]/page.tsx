import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MarketingShell, ArticlePage } from '@/components/marketing';
import { GUIDES, getGuide } from '@/lib/marketing/articles';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return GUIDES.map((article) => ({ slug: article.slug }));
}

export const dynamicParams = false;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = getGuide(slug);
  if (!article) return {};
  return {
    title: `${article.title} | MERKEN使い方ガイド`,
    description: article.description,
    alternates: {
      canonical: `/guide/${article.slug}`,
    },
    openGraph: {
      title: article.title,
      description: article.description,
      url: `https://www.merken.jp/guide/${article.slug}`,
      siteName: 'MERKEN',
      type: 'article',
      locale: 'ja_JP',
    },
  };
}

export default async function GuideArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = getGuide(slug);
  if (!article) notFound();

  const related = GUIDES.filter((item) => item.slug !== article.slug).slice(0, 3);

  return (
    <MarketingShell active="guide">
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
            mainEntityOfPage: `https://www.merken.jp/guide/${article.slug}`,
          }),
        }}
      />
      <ArticlePage article={article} sectionHref="/guide" sectionLabel="使い方ガイド" related={related} />
    </MarketingShell>
  );
}
