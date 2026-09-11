'use client';

/**
 * 設定 > 使い方ガイド の本文。モバイル / デスクトップの両レイアウトから
 * 同じものを描画する（外側の余白と最大幅だけ呼び出し側が決める）。
 *
 * 中身の文言は src/lib/help/help-content.ts が単一情報源。
 */

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { useCoins } from '@/hooks/use-coins';
import {
  HELP_FAQS,
  HELP_SECTIONS,
  HELP_STEPS,
  type HelpItem,
  type HelpSection,
} from '@/lib/help/help-content';

export function HelpGuide() {
  // コイン制はサーバー側のフラグで切れることがあるので、オフの環境では
  // コインの説明ごと出さない（/coins も無効時はリダイレクトする）。
  const { enabled: coinsEnabled } = useCoins();

  const sections = HELP_SECTIONS.map((section) =>
    section.id === 'plan' && coinsEnabled !== true
      ? { ...section, items: section.items.filter((item) => item.href !== '/coins') }
      : section,
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-[12px] leading-[1.9] text-[var(--color-muted)] lg:text-[13px]">
        MERKENは、単語帳をつくって覚えるためのアプリです。
        写真から単語帳をつくり、クイズで繰り返し、覚えた分を記録していきます。
        気になるところだけ開いて読んでください。
      </p>

      <StepList />

      <nav aria-label="目次" className="flex flex-wrap gap-1.5">
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#help-${section.id}`}
            className="rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-2.5 py-1 text-[11px] font-bold text-[var(--solid-ink)] lg:text-[12px]"
          >
            {section.label}
          </a>
        ))}
        <a
          href="#help-faq"
          className="rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-2.5 py-1 text-[11px] font-bold text-[var(--solid-ink)] lg:text-[12px]"
        >
          よくある質問
        </a>
      </nav>

      {sections.map((section, index) => (
        <HelpSectionBlock key={section.id} section={section} defaultOpen={index === 0} />
      ))}

      <FaqBlock />

      <div className="pb-2 text-center font-mono text-[9px] tracking-[0.04em] text-[var(--color-muted)]">
        解決しないときは お問い合わせ から連絡できます
      </div>
    </div>
  );
}

function StepList() {
  return (
    <ol className="m-0 flex list-none flex-col gap-2 p-0">
      {HELP_STEPS.map((step) => (
        <li
          key={step.number}
          className="flex items-start gap-3 rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-[13px]"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] text-[var(--color-on-ink)]">
            <Icon name={step.icon} size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline gap-1.5">
              <span className="font-mono text-[10px] font-bold text-[var(--color-muted)]">{step.number}</span>
              <span className="font-display text-[14px] font-extrabold text-[var(--solid-ink)] lg:text-[15px]">{step.title}</span>
            </span>
            <span className="mt-0.5 block text-[11px] leading-[1.8] text-[var(--color-muted)] lg:text-[12px]">{step.body}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function HelpSectionBlock({ section, defaultOpen }: { section: HelpSection; defaultOpen: boolean }) {
  return (
    <details
      id={`help-${section.id}`}
      open={defaultOpen}
      className="group scroll-mt-[72px] overflow-hidden rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)]"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3 py-[13px] [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="font-display text-[15px] font-extrabold text-[var(--solid-ink)] lg:text-[17px]">{section.label}</span>
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
              {section.eyebrow}
            </span>
          </span>
          <span className="mt-px block text-[10px] leading-4 text-[var(--color-muted)] lg:text-[11px]">{section.summary}</span>
        </span>
        <Icon
          name="expand_more"
          size={18}
          className="shrink-0 text-[var(--color-muted)] transition-transform duration-150 group-open:rotate-180"
        />
      </summary>
      <div className="divide-y divide-[var(--color-border)] border-t-2 border-[var(--solid-ink)]">
        {section.items.map((item) => (
          <HelpItemRow key={item.title} item={item} />
        ))}
      </div>
    </details>
  );
}

function HelpItemRow({ item }: { item: HelpItem }) {
  return (
    <div className="flex items-start gap-2.5 px-3 py-[13px]">
      <span className="inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] bg-[color-mix(in_srgb,_var(--solid-ink)_5%,_transparent)] text-[var(--solid-ink)]">
        <Icon name={item.icon} size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[13px] font-bold text-[var(--solid-ink)] lg:text-[14px]">{item.title}</span>
          {item.badge === 'pro' && (
            <span className="inline-flex items-center gap-0.5 rounded-[4px] bg-[var(--solid-ink)] px-[6px] py-[1px] font-mono text-[8px] font-bold tracking-[0.05em] text-[var(--color-on-ink)]">
              <Icon name="auto_awesome" size={9} />
              PRO
            </span>
          )}
          {item.badge === 'free-limited' && (
            <span className="rounded-[4px] border border-[var(--color-border)] px-[6px] py-[1px] font-mono text-[8px] font-bold tracking-[0.05em] text-[var(--color-muted)]">
              無料は上限あり
            </span>
          )}
        </div>
        <p className="mt-[3px] text-[11px] leading-[1.9] text-[var(--color-muted)] lg:text-[12.5px]">{item.body}</p>
        {item.href && (
          <Link
            href={item.href}
            className="mt-1.5 inline-flex items-center gap-0.5 text-[11px] font-bold text-[var(--color-accent)] lg:text-[12px]"
          >
            {item.linkLabel ?? '開く'}
            <Icon name="chevron_right" size={13} />
          </Link>
        )}
      </div>
    </div>
  );
}

function FaqBlock() {
  return (
    <section id="help-faq" className="scroll-mt-[72px]">
      <div className="px-1 pb-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
        FAQ · よくある質問
      </div>
      <div className="divide-y divide-[var(--color-border)] overflow-hidden rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)]">
        {HELP_FAQS.map((faq) => (
          <details key={faq.question} className="group">
            <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3 py-[13px] [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 flex-1 text-[12px] font-bold leading-[1.6] text-[var(--solid-ink)] lg:text-[13.5px]">
                {faq.question}
              </span>
              <Icon
                name="expand_more"
                size={16}
                className="shrink-0 text-[var(--color-muted)] transition-transform duration-150 group-open:rotate-180"
              />
            </summary>
            <div className="px-3 pb-[13px]">
              <p className="m-0 text-[11px] leading-[1.9] text-[var(--color-muted)] lg:text-[12.5px]">{faq.answer}</p>
              {faq.href && (
                <Link
                  href={faq.href}
                  className="mt-1.5 inline-flex items-center gap-0.5 text-[11px] font-bold text-[var(--color-accent)] lg:text-[12px]"
                >
                  {faq.linkLabel ?? '開く'}
                  <Icon name="chevron_right" size={13} />
                </Link>
              )}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
