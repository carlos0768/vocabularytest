'use client';

/**
 * 豆知識のトップ。接頭語・接尾語・接中語の各ページはここから開く。
 * 設定ページには「豆知識」の入口だけを置き、中身はこのページにまとめる。
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';
import { getAffixesByKind } from '@/lib/morphology/affix-catalog';

const TIPS: Array<{
  href: string;
  label: string;
  description: string;
  count: number;
}> = [
  {
    href: '/tips/prefixes',
    label: '接頭語（プレフィックス）',
    description: 'un- / re- / pre- など、頭に付くパーツの意味と例',
    count: getAffixesByKind('prefix').length,
  },
  {
    href: '/tips/suffixes',
    label: '接尾語（サフィックス）',
    description: '-tion / -ous / -able など、品詞を決めるパーツ',
    count: getAffixesByKind('suffix').length,
  },
  {
    href: '/tips/infixes',
    label: '接中語（インフィックス）',
    description: 'therm-o-meter の -o- など、語根をつなぐパーツ',
    count: getAffixesByKind('infix').length,
  },
];

export default function TipsIndexPage() {
  const router = useRouter();

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push('/settings');
  };

  return (
    <div className="relative min-h-screen bg-[var(--color-background)] pb-[110px] font-[var(--font-body)]">
      <StickyPageHeader eyebrow="TIPS" title="豆知識" onBack={handleBack} />

      <div className="mx-auto w-full max-w-[560px] px-[18px] pt-3">
        <p className="m-0 text-[12px] leading-[1.8] text-[var(--color-muted)]">
          単語をパーツに分けて覚えるための解説です。接頭語・接尾語・接中語の意味が分かると、
          初見の単語でも意味と品詞を推測できます。
        </p>

        <div className="mt-3.5 divide-y divide-[var(--color-border)] overflow-hidden rounded-[12px] border-2 border-[var(--solid-ink)] bg-white">
          {TIPS.map((tip) => (
            <Link key={tip.href} href={tip.href} className="flex items-center gap-2.5 px-3 py-[13px]">
              <span className="inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] bg-[rgba(26,26,26,0.05)] text-[var(--solid-ink)]">
                <Icon name="text_fields" size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold text-[var(--solid-ink)]">{tip.label}</span>
                <span className="mt-px block truncate text-[10px] leading-4 text-[var(--color-muted)]">
                  {tip.description}
                </span>
              </span>
              <span className="shrink-0 font-mono text-[10px] tabular-nums text-[var(--color-muted)]">
                {tip.count}項目
              </span>
              <Icon name="chevron_right" size={14} className="shrink-0 text-[var(--color-muted)]" />
            </Link>
          ))}
        </div>

        <div className="mt-4 text-center font-mono text-[9px] tracking-[0.04em] text-[var(--color-muted)]">
          MERKEN 豆知識 · 語源で覚える受験英語
        </div>
      </div>
    </div>
  );
}
