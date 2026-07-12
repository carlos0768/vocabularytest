import type { MetadataRoute } from 'next';
import { isBillingEnabled } from '@/lib/billing/feature';
import { COLUMNS, GUIDES } from '@/lib/marketing/articles';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://www.merken.jp';

  const entries: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${baseUrl}/features`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    // 語彙力レベル診断のLPのみ索引させる(/level-test/r/* の結果ページはnoindex)
    {
      url: `${baseUrl}/level-test`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
  ];

  // /pricing redirects to / when billing is disabled — keep it out of the sitemap then.
  if (isBillingEnabled()) {
    entries.push({
      url: `${baseUrl}/pricing`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    });
  }

  entries.push(
    {
      url: `${baseUrl}/guide`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...GUIDES.map((article) => ({
      url: `${baseUrl}/guide/${article.slug}`,
      lastModified: new Date(article.updated),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    {
      url: `${baseUrl}/column`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.8,
    },
    ...COLUMNS.map((article) => ({
      url: `${baseUrl}/column/${article.slug}`,
      lastModified: new Date(article.updated),
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    {
      url: `${baseUrl}/terms`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: `${baseUrl}/tokusho`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.4,
    },
    {
      url: `${baseUrl}/login`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/signup`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
  );

  return entries;
}
