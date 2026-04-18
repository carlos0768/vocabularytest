'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { CollectionItemSummary, LearningAssetKind } from '@/types';
import { Icon } from '@/components/ui';
import { getNotebookCreateHref } from '@/lib/notebook';
import { cn } from '@/lib/utils';

type NotebookHeaderAction = {
  icon: string;
  label: string;
  onClick?: () => void;
  href?: string;
  active?: boolean;
};

type NotebookActionStripItem = {
  icon: string;
  label: string;
  sub?: string;
  badge?: string;
  href?: string;
  onClick?: () => void;
};

type NotebookChromeProps = {
  collectionId: string;
  currentKind?: LearningAssetKind;
  items: CollectionItemSummary[];
  title: string;
  subtitle?: string;
  crumbLabel?: string;
  actionStripItems?: NotebookActionStripItem[];
  headerActions?: NotebookHeaderAction[];
  backHref?: string;
  children: ReactNode;
};

const APP_TABS = [
  { id: 'home', icon: 'home', label: 'ホーム', href: '/' },
  { id: 'notes', icon: 'menu_book', label: 'ノート', href: '/collections' },
  { id: 'stats', icon: 'bar_chart', label: '進歩', href: '/stats' },
  { id: 'me', icon: 'person', label: '自分', href: '/settings' },
] as const;

function NotebookComposerModal({
  collectionId,
  open,
  onClose,
}: {
  collectionId: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();

  if (!open) return null;

  const modes = [
    {
      kind: 'vocabulary_project' as const,
      icon: 'menu_book',
      title: '単語帳',
      sub: 'スキャン・手動・自動生成',
      blurb: '写真から単語を抽出、手動で追加、または既出語から例文を生成。',
    },
    {
      kind: 'structure_document' as const,
      icon: 'account_tree',
      title: '構造解析',
      sub: '準1級レベルの構文を抽出',
      blurb: '句ごとに折りたたみ。どこが一括りか、一目でわかる。',
    },
    {
      kind: 'correction_document' as const,
      icon: 'spellcheck',
      title: '添削',
      sub: '誤用を洗い出し、文法化',
      blurb: '間違いはすべて指摘。語法ごとにカード化して復習へ。',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/35 px-3 pb-3 backdrop-blur-sm notebook-sans"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[420px] rounded-[4px] border border-[var(--notebook-rule)] bg-white p-5 shadow-[0_24px_40px_-20px_rgba(0,0,0,0.4)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--notebook-muted)]">新規作成</div>
            <div className="mt-1 text-[20px] font-extrabold tracking-tight text-[var(--notebook-ink)]">
              何を作りますか？
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="notebook-press flex h-9 w-9 items-center justify-center rounded-full text-[var(--notebook-ink)] hover:bg-black/5"
            aria-label="閉じる"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="grid gap-2.5">
          {modes.map((mode) => (
            <button
              key={mode.kind}
              type="button"
              onClick={() => {
                onClose();
                router.push(getNotebookCreateHref(collectionId, mode.kind));
              }}
              className="notebook-press flex items-start gap-4 rounded-[4px] border border-[var(--notebook-rule)] bg-white p-4 text-left hover:border-[var(--notebook-ink)]"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[2px] bg-[var(--notebook-ink)] text-white">
                <Icon name={mode.icon} size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-[16px] font-bold tracking-tight text-[var(--notebook-ink)]">{mode.title}</div>
                  <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--notebook-muted)]">{mode.sub}</div>
                </div>
                <div className="mt-1 text-[11.5px] leading-relaxed text-[var(--notebook-muted)]">{mode.blurb}</div>
              </div>
              <Icon name="arrow_forward" size={18} className="mt-1 text-[var(--notebook-muted)]" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function NotebookBottomTabs() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--notebook-rule)] bg-white/95 px-3 pt-2 backdrop-blur notebook-sans">
      <div className="mx-auto grid max-w-[420px] grid-cols-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        {APP_TABS.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className={cn(
              'notebook-press flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-semibold',
              item.id === 'notes' ? 'text-[var(--notebook-ink)]' : 'text-[var(--notebook-muted)]',
            )}
          >
            <Icon name={item.icon} size={22} filled={item.id === 'notes'} />
            <span>{item.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}

function NotebookActionStrip({ items }: { items: NotebookActionStripItem[] }) {
  return (
    <div className="mt-1 mb-3 grid grid-cols-3 gap-2 px-5 notebook-sans">
      {items.map((item) => {
        const content = (
          <>
            <div className="flex h-11 w-11 items-center justify-center rounded-[2px] bg-[var(--notebook-ink)] text-white">
              <Icon name={item.icon} size={18} />
            </div>
            <div>
              <div className="text-[12px] font-semibold leading-tight text-[var(--notebook-ink)]">{item.label}</div>
              {item.sub && <div className="mt-0.5 text-[9.5px] text-[var(--notebook-muted)]">{item.sub}</div>}
            </div>
            {item.badge && (
              <span className="absolute top-2 right-2 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--notebook-muted)]">
                {item.badge}
              </span>
            )}
          </>
        );

        const className = 'notebook-press relative flex min-h-[76px] flex-col items-start justify-between rounded-[4px] border border-[var(--notebook-rule)] bg-white p-3 text-left hover:border-[var(--notebook-ink)]';

        if (item.href) {
          return (
            <Link key={`${item.icon}-${item.label}`} href={item.href} className={className}>
              {content}
            </Link>
          );
        }

        return (
          <button key={`${item.icon}-${item.label}`} type="button" onClick={item.onClick} className={className}>
            {content}
          </button>
        );
      })}
    </div>
  );
}

export function NotebookChrome({
  collectionId,
  currentKind: _currentKind,
  items: _items,
  title,
  subtitle,
  crumbLabel,
  actionStripItems,
  headerActions = [],
  backHref = `/collections/${collectionId}`,
  children,
}: NotebookChromeProps) {
  const [composerOpen, setComposerOpen] = useState(false);

  return (
    <>
      <div className="flex min-h-screen flex-col bg-white pb-28">
        <header className="sticky top-0 z-30 border-b border-[var(--notebook-rule)] bg-white/95 backdrop-blur">
          <div className="mx-auto max-w-[420px] px-4 pb-3 pt-2">
            <div className="flex items-center justify-between">
              <Link
                href={backHref}
                className="notebook-press flex h-9 w-9 items-center justify-center rounded-full text-[var(--notebook-ink)] hover:bg-black/5"
                aria-label="戻る"
              >
                <Icon name="arrow_back_ios_new" size={16} />
              </Link>
              <div className="flex items-center gap-0.5">
                {headerActions.map((action) => {
                  const className = cn(
                    'notebook-press flex h-9 w-9 items-center justify-center rounded-full',
                    action.active
                      ? 'bg-[var(--notebook-ink)] text-white'
                      : 'text-[var(--notebook-ink)] hover:bg-black/5',
                  );

                  if (action.href) {
                    return (
                      <Link key={`${action.icon}-${action.label}`} href={action.href} className={className} aria-label={action.label}>
                        <Icon name={action.icon} size={18} />
                      </Link>
                    );
                  }

                  return (
                    <button key={`${action.icon}-${action.label}`} type="button" onClick={action.onClick} className={className} aria-label={action.label}>
                      <Icon name={action.icon} size={18} />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-2 px-1">
              {subtitle && <div className="notebook-top-sub">{subtitle}</div>}
              <h1 className="notebook-title mt-1">{title}</h1>
            </div>

            <div className="notebook-crumb mt-3 flex items-center gap-1.5 px-1">
              <Icon name="folder_open" size={12} />
              <span>{crumbLabel ?? title}</span>
            </div>
          </div>
        </header>

        <main className="mx-auto flex w-full max-w-[420px] flex-1 flex-col">
          {actionStripItems && actionStripItems.length > 0 && <NotebookActionStrip items={actionStripItems} />}
          <div className="notebook-screenpad space-y-5">{children}</div>
        </main>

        <button
          type="button"
          onClick={() => setComposerOpen(true)}
          className="notebook-press fixed right-5 bottom-24 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--notebook-ink)] text-white shadow-[0_12px_26px_-8px_rgba(0,0,0,0.45)]"
          aria-label="追加"
        >
          <Icon name="add" size={26} />
        </button>
      </div>

      <NotebookBottomTabs />
      <NotebookComposerModal collectionId={collectionId} open={composerOpen} onClose={() => setComposerOpen(false)} />
    </>
  );
}

export function NotebookCard({
  title,
  subtitle,
  children,
  right,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <section className="rounded-[4px] border border-[var(--notebook-rule)] bg-white notebook-sans">
      {(title || subtitle || right) && (
        <div className="flex items-start justify-between gap-3 border-b border-[var(--notebook-rule)] px-4 py-3">
          <div className="min-w-0 flex-1">
            {title && <div className="text-[13px] font-bold text-[var(--notebook-ink)]">{title}</div>}
            {subtitle && <div className="mt-0.5 text-[11px] leading-relaxed text-[var(--notebook-muted)]">{subtitle}</div>}
          </div>
          {right}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}
