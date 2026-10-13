'use client';

/**
 * 設定 > サポート配下のページ (利用規約 / プライバシーポリシー / 特商法 / お問い合わせ)
 * が共有する、枠なしの本文コンポーネント。スマホ・デスクトップの両方がこれを描く。
 *
 * 囲い（枠線・塗りの箱・角丸チップ）は使わない。区切りは余白と文字の
 * 大きさ・太さだけで作る。
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import { EmphasisText } from '@/components/ui/EmphasisText';
import { Icon } from '@/components/ui/Icon';

export type LegalArticle = {
  h: string;
  p?: string[];
  list?: string[];
};

export type TokushoSection = {
  label: string;
  rows: { label: string; value: ReactNode }[];
};

export const SUPPORT_EMAIL = 'support@merken.jp';
const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?cc=ahoperson@merken.jp`;

const EYEBROW = 'font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--color-muted)]';
const H2 = 'm-0 font-display text-[19px] font-extrabold leading-snug text-[var(--solid-ink)] lg:text-[22px]';
const BODY = 'm-0 text-[13px] leading-[2] text-[var(--solid-ink)] lg:text-[14.5px]';
const MUTED = 'text-[12.5px] leading-[2] text-[var(--color-muted)] lg:text-[14px]';

/** スマホ用のページ枠。戻る・見出し・本文。デスクトップでは使わない。 */
export function SupportMobileFrame({
  title,
  eyebrow,
  onBack,
  children,
}: {
  title: string;
  eyebrow: string;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div className="relative min-h-screen bg-[var(--color-background)] pb-[110px] pt-3 font-[var(--font-body)] lg:hidden">
      <div className="px-[18px]">
        <button
          type="button"
          onClick={onBack}
          className="-ml-2 inline-flex h-11 items-center gap-0.5 pr-3 text-[13px] font-bold text-[var(--color-muted)]"
        >
          <Icon name="chevron_left" size={20} />
          戻る
        </button>
        <p className={`${EYEBROW} m-0 mt-3`}>{eyebrow}</p>
        <h1 className="m-0 mt-1.5 font-display text-[28px] font-extrabold leading-[1.2] tracking-[-0.02em] text-[var(--solid-ink)]">
          {title}
        </h1>
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}

/** 利用規約・プライバシーポリシーの本文。 */
export function LegalDocBody({
  intro,
  articles,
  updated,
}: {
  intro: string;
  articles: LegalArticle[];
  updated: string;
}) {
  return (
    <div className="flex flex-col gap-10">
      <div>
        <p className={`${MUTED} m-0`}>
          <EmphasisText text={intro} />
        </p>
        <p className={`${EYEBROW} m-0 mt-4`}>最終更新 {updated}</p>
      </div>

      <nav aria-label="目次">
        <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
          {articles.map((article, index) => (
            <li key={article.h}>
              <a
                href={`#article-${index + 1}`}
                className="inline-flex items-baseline gap-3 text-[13px] font-bold text-[var(--solid-ink)] lg:text-[14px]"
              >
                <span className="w-5 font-mono text-[11px] text-[var(--color-muted)]">{index + 1}</span>
                {article.h}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {articles.map((article, index) => (
        <section key={article.h} id={`article-${index + 1}`} className="scroll-mt-[72px]">
          <p className={`${EYEBROW} m-0`}>第{index + 1}条</p>
          <h2 className={`${H2} mt-1`}>{article.h}</h2>
          <div className="mt-3 flex flex-col gap-3">
            {article.p?.map((paragraph) => (
              <p key={paragraph} className={BODY}>
                <EmphasisText text={paragraph} />
              </p>
            ))}
            {article.list && (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {article.list.map((item) => (
                  <li key={item} className={`${BODY} flex items-baseline gap-3`}>
                    <span aria-hidden className="text-[var(--color-muted)]">–</span>
                    <span className="min-w-0 flex-1">
                      <EmphasisText text={item} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ))}

      <p className={`${MUTED} m-0`}>
        お問い合わせは{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className="font-mono font-bold text-[var(--color-accent)]">
          {SUPPORT_EMAIL}
        </a>{' '}
        まで。
      </p>
    </div>
  );
}

/** 特定商取引法に基づく表記の本文。 */
export function TokushoBody({ sections, updated }: { sections: TokushoSection[]; updated: string }) {
  return (
    <div className="flex flex-col gap-10">
      <div>
        <p className={`${MUTED} m-0`}>
          特定商取引法第11条に基づき、Pro 購読サービスの提供に関する事項を以下のとおり表示します。
        </p>
        <p className={`${EYEBROW} m-0 mt-4`}>最終更新 {updated}</p>
      </div>

      {sections.map((section) => (
        <section key={section.label}>
          <h2 className={H2}>{section.label}</h2>
          <dl className="m-0 mt-4 flex flex-col gap-5">
            {section.rows.map((row) => (
              <div key={row.label} className="lg:grid lg:grid-cols-[168px_1fr] lg:gap-6">
                <dt className="text-[12px] font-bold text-[var(--color-muted)] lg:text-[13px]">{row.label}</dt>
                <dd className={`${BODY} m-0 mt-1 lg:mt-0`}>{row.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

const CONTACT_KINDS = [
  { key: 'bug', label: '不具合の報告', subject: '【不具合の報告】' },
  { key: 'request', label: '機能のご要望', subject: '【機能のご要望】' },
  { key: 'question', label: '使い方の質問', subject: '【使い方の質問】' },
  { key: 'other', label: 'その他', subject: '【お問い合わせ】' },
] as const;

const CONTACT_FAQS = [
  {
    q: 'Pro を解約したい',
    a: '設定 > プラン・アカウント管理 の「サブスクリプション管理」から、いつでも次回更新をキャンセルできます。解約後も契約期間終了日まではご利用いただけます。',
    href: '/settings/account/plan',
    linkLabel: 'プランを確認する',
  },
  {
    q: '機種変更でデータを移したい',
    a: '同じメールアドレスで再ログインすると、学習データが自動で同期されます。',
  },
  {
    q: 'アカウントを削除したい',
    a: '設定 > プラン・アカウント管理 > アカウント削除 から行えます。すべての関連データが削除され、元に戻せません。',
    href: '/settings/account/delete',
    linkLabel: 'アカウント削除',
  },
];

/** お問い合わせの本文。送信フォームは持たず、メールアプリを開くリンクだけ置く。 */
export function ContactBody() {
  return (
    <div className="flex flex-col gap-12">
      <section>
        <p className={`${MUTED} m-0`}>
          不具合のご報告や機能のご要望をお寄せください。内容を確認のうえ、通常2営業日以内にメールでご返信します。
        </p>
        <a
          href={SUPPORT_MAILTO}
          className="mt-5 inline-flex items-center gap-2 font-mono text-[17px] font-bold text-[var(--color-accent)] lg:text-[20px]"
        >
          <Icon name="mail" size={22} />
          {SUPPORT_EMAIL}
        </a>
      </section>

      <section>
        <h2 className={H2}>種類を選んで送る</h2>
        <p className={`${MUTED} m-0 mt-2`}>選ぶとメールアプリが開き、件名があらかじめ入ります。</p>
        <ul className="m-0 mt-4 flex list-none flex-col p-0">
          {CONTACT_KINDS.map((kind) => (
            <li key={kind.key}>
              <a
                href={`${SUPPORT_MAILTO}&subject=${encodeURIComponent(kind.subject)}`}
                className="flex min-h-[48px] items-center justify-between gap-3 text-[15px] font-bold text-[var(--solid-ink)] lg:text-[16px]"
              >
                {kind.label}
                <Icon name="north_east" size={18} className="text-[var(--color-muted)]" />
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className={H2}>よくある質問</h2>
        <dl className="m-0 mt-5 flex flex-col gap-7">
          {CONTACT_FAQS.map((faq) => (
            <div key={faq.q}>
              <dt className="flex items-baseline gap-2.5 text-[14px] font-bold leading-[1.7] text-[var(--solid-ink)] lg:text-[15px]">
                <span className="font-display text-[15px] font-extrabold text-[var(--color-accent)]">Q</span>
                {faq.q}
              </dt>
              <dd className="m-0 mt-1.5 pl-[22px]">
                <p className={`${MUTED} m-0`}>{faq.a}</p>
                {faq.href && (
                  <Link
                    href={faq.href}
                    className="mt-2 inline-flex items-center gap-0.5 text-[12.5px] font-bold text-[var(--color-accent)] lg:text-[13.5px]"
                  >
                    {faq.linkLabel}
                    <Icon name="chevron_right" size={15} />
                  </Link>
                )}
              </dd>
            </div>
          ))}
        </dl>
        <Link
          href="/settings/help"
          className="mt-7 inline-flex items-center gap-0.5 text-[13px] font-bold text-[var(--color-accent)]"
        >
          使い方ガイドを見る
          <Icon name="chevron_right" size={15} />
        </Link>
      </section>
    </div>
  );
}
