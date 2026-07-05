import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import type { Article, ArticleBlock } from '@/lib/marketing/articles';

function formatUpdated(updated: string): string {
  const [year, month, day] = updated.split('-');
  return `${year}年${Number(month)}月${Number(day)}日`;
}

function Block({ block }: { block: ArticleBlock }) {
  switch (block.type) {
    case 'h2':
      return (
        <h2 className="mt-10 mb-3 font-display text-xl md:text-2xl font-extrabold text-[var(--color-foreground)]">
          {block.text}
        </h2>
      );
    case 'p':
      return <p className="mb-4 text-[15px] leading-8 text-[var(--color-foreground)]/85">{block.text}</p>;
    case 'list':
      return (
        <ul className="mb-4 space-y-2 pl-1">
          {block.items.map((item) => (
            <li key={item} className="flex gap-2 text-[15px] leading-7 text-[var(--color-foreground)]/85">
              <span className="mt-[9px] inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-primary)]" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
    case 'note':
      return (
        <div className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <p className="text-sm leading-7 text-[var(--color-foreground)]/85">
            <span className="mr-1.5 font-bold text-[var(--color-primary)]">POINT</span>
            {block.text}
          </p>
        </div>
      );
  }
}

export function ArticlePage({
  article,
  sectionHref,
  sectionLabel,
  related,
}: {
  article: Article;
  sectionHref: string;
  sectionLabel: string;
  related: Article[];
}) {
  return (
    <article className="max-w-3xl mx-auto px-4 py-10">
      <nav className="mb-6 flex items-center gap-1.5 text-xs text-[var(--color-muted)]" aria-label="パンくず">
        <Link href="/" className="hover:text-[var(--color-foreground)]">ホーム</Link>
        <Icon name="chevron_right" size={12} />
        <Link href={sectionHref} className="hover:text-[var(--color-foreground)]">{sectionLabel}</Link>
      </nav>

      <h1 className="font-display text-2xl md:text-[32px] font-extrabold leading-[1.3] text-[var(--color-foreground)]">
        {article.title}
      </h1>
      <p className="mt-3 text-xs text-[var(--color-muted)]">最終更新 {formatUpdated(article.updated)}</p>

      <div className="mt-8">
        {article.blocks.map((block, index) => (
          <Block key={index} block={block} />
        ))}
      </div>

      <div className="mt-12 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center">
        <p className="font-display text-lg font-extrabold text-[var(--color-foreground)]">
          写真から単語帳を作って、間隔反復で覚える
        </p>
        <p className="mt-2 text-sm leading-7 text-[var(--color-muted)]">
          MERKENは無料で始められます。共有ライブラリの単語帳を取り込んで、今日から学習をスタート。
        </p>
        <Link
          href="/signup?redirect=/"
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--color-primary)] px-6 py-2.5 text-sm font-bold text-white"
        >
          無料で始める
          <Icon name="arrow_forward" size={16} />
        </Link>
      </div>

      {related.length > 0 && (
        <div className="mt-12">
          <h2 className="mb-4 font-display text-lg font-extrabold text-[var(--color-foreground)]">あわせて読む</h2>
          <div className="grid gap-3">
            {related.map((item) => (
              <ArticleCard key={item.slug} article={item} href={`${sectionHref}/${item.slug}`} />
            ))}
          </div>
        </div>
      )}
    </article>
  );
}

export function ArticleCard({ article, href }: { article: Article; href: string }) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 transition-colors hover:border-[var(--color-primary)]"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-light)] text-[var(--color-primary)]">
        <Icon name={article.icon} size={22} />
      </div>
      <div className="min-w-0">
        <h3 className="font-display text-base font-bold leading-6 text-[var(--color-foreground)] group-hover:text-[var(--color-primary)]">
          {article.title}
        </h3>
        <p className="mt-1.5 text-sm leading-6 text-[var(--color-muted)]">{article.description}</p>
      </div>
    </Link>
  );
}

export function ArticleIndex({
  heading,
  lead,
  articles,
  basePath,
}: {
  heading: string;
  lead: string;
  articles: Article[];
  basePath: string;
}) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="font-display text-2xl md:text-[32px] font-extrabold text-[var(--color-foreground)]">{heading}</h1>
      <p className="mt-3 max-w-2xl text-[15px] leading-8 text-[var(--color-muted)]">{lead}</p>
      <div className="mt-8 grid gap-4">
        {articles.map((article) => (
          <ArticleCard key={article.slug} article={article} href={`${basePath}/${article.slug}`} />
        ))}
      </div>
    </div>
  );
}
