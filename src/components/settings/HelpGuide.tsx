'use client';

/**
 * 設定 > 使い方ガイド の本文。モバイル / デスクトップの両レイアウトから
 * 同じものを描画する（外側の余白と最大幅だけ呼び出し側が決める）。
 *
 * 囲い（枠線・塗りの箱・角丸のチップ・アコーディオン）は使わない。
 * 区切りは余白と文字の大きさ・太さだけで作る。
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
    <div className="flex flex-col gap-12 pb-4 desktop:gap-14">
      <header>
        <p className="m-0 text-[15px] font-bold leading-[1.8] text-[var(--solid-ink)] desktop:text-[17px]">
          写真から単語帳をつくり、
          <br />
          クイズで繰り返し、覚えた分を記録する。
        </p>
        <p className="m-0 mt-3 text-[12px] leading-[2] text-[var(--color-muted)] desktop:text-[13.5px]">
          MERKENの使い方を、はじめの3ステップと機能ごとの説明にまとめました。
        </p>
      </header>

      <StepList />

      <nav aria-label="目次">
        <p className="m-0 mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-muted)]">
          Contents
        </p>
        <ul className="m-0 flex list-none flex-wrap gap-x-5 gap-y-2 p-0">
          {sections.map((section) => (
            <li key={section.id}>
              <a
                href={`#help-${section.id}`}
                className="text-[13px] font-bold text-[var(--solid-ink)] underline decoration-[var(--color-border)] decoration-2 underline-offset-[5px] desktop:text-[14px]"
              >
                {section.label}
              </a>
            </li>
          ))}
          <li>
            <a
              href="#help-faq"
              className="text-[13px] font-bold text-[var(--solid-ink)] underline decoration-[var(--color-border)] decoration-2 underline-offset-[5px] desktop:text-[14px]"
            >
              よくある質問
            </a>
          </li>
        </ul>
      </nav>

      {sections.map((section) => (
        <HelpSectionBlock key={section.id} section={section} />
      ))}

      <FaqBlock />

      <p className="m-0 text-[12px] leading-[1.9] text-[var(--color-muted)]">
        解決しないときは{' '}
        <Link href="/contact" className="font-bold text-[var(--color-accent)]">
          お問い合わせ
        </Link>{' '}
        から連絡できます。
      </p>
    </div>
  );
}

function StepList() {
  return (
    <section aria-labelledby="help-steps">
      <h2
        id="help-steps"
        className="m-0 mb-5 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-muted)]"
      >
        Getting started
      </h2>
      <ol className="m-0 flex list-none flex-col gap-7 p-0">
        {HELP_STEPS.map((step) => (
          <li key={step.number} className="flex items-start gap-4">
            <span className="w-[44px] shrink-0 font-display text-[34px] font-extrabold leading-none text-[var(--solid-ink)] desktop:w-[52px] desktop:text-[40px]">
              {step.number}
            </span>
            <span className="min-w-0 flex-1 pt-0.5">
              <span className="block font-display text-[17px] font-extrabold text-[var(--solid-ink)] desktop:text-[19px]">
                {step.title}
              </span>
              <span className="mt-1.5 block text-[12.5px] leading-[1.95] text-[var(--color-muted)] desktop:text-[14px]">
                {step.body}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function HelpSectionBlock({ section }: { section: HelpSection }) {
  return (
    <section id={`help-${section.id}`} className="scroll-mt-[72px]">
      <p className="m-0 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-muted)]">
        {section.eyebrow}
      </p>
      <h2 className="m-0 mt-1 font-display text-[22px] font-extrabold leading-tight text-[var(--solid-ink)] desktop:text-[26px]">
        {section.label}
      </h2>
      <p className="m-0 mt-2 text-[12.5px] leading-[1.9] text-[var(--color-muted)] desktop:text-[14px]">
        {section.summary}
      </p>
      <ul className="m-0 mt-7 flex list-none flex-col gap-7 p-0">
        {section.items.map((item) => (
          <HelpItemRow key={item.title} item={item} />
        ))}
      </ul>
    </section>
  );
}

function HelpItemRow({ item }: { item: HelpItem }) {
  return (
    <li className="flex items-start gap-3.5">
      <Icon name={item.icon} size={22} className="mt-px shrink-0 text-[var(--solid-ink)]" />
      <div className="min-w-0 flex-1">
        <h3 className="m-0 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-[15px] font-bold leading-snug text-[var(--solid-ink)] desktop:text-[16px]">
          {item.title}
          {item.badge === 'pro' && (
            <span className="font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-accent)]">PRO</span>
          )}
          {item.badge === 'free-limited' && (
            <span className="text-[11px] font-normal text-[var(--color-muted)]">無料は上限あり</span>
          )}
        </h3>
        <p className="m-0 mt-1.5 text-[12.5px] leading-[2] text-[var(--color-muted)] desktop:text-[14px]">
          {item.body}
        </p>
        {item.href && <TextLink href={item.href} label={item.linkLabel ?? '開く'} />}
      </div>
    </li>
  );
}

function FaqBlock() {
  return (
    <section id="help-faq" className="scroll-mt-[72px]">
      <p className="m-0 font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-muted)]">
        FAQ
      </p>
      <h2 className="m-0 mt-1 font-display text-[22px] font-extrabold leading-tight text-[var(--solid-ink)] desktop:text-[26px]">
        よくある質問
      </h2>
      <dl className="m-0 mt-7 flex flex-col gap-7">
        {HELP_FAQS.map((faq) => (
          <div key={faq.question}>
            <dt className="flex items-baseline gap-2.5 text-[14px] font-bold leading-[1.7] text-[var(--solid-ink)] desktop:text-[15px]">
              <span className="font-display text-[15px] font-extrabold text-[var(--color-accent)]">Q</span>
              {faq.question}
            </dt>
            <dd className="m-0 mt-1.5 pl-[22px]">
              <p className="m-0 text-[12.5px] leading-[2] text-[var(--color-muted)] desktop:text-[14px]">{faq.answer}</p>
              {faq.href && <TextLink href={faq.href} label={faq.linkLabel ?? '開く'} />}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function TextLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="mt-2 inline-flex items-center gap-0.5 text-[12.5px] font-bold text-[var(--color-accent)] desktop:text-[13.5px]"
    >
      {label}
      <Icon name="chevron_right" size={15} />
    </Link>
  );
}
