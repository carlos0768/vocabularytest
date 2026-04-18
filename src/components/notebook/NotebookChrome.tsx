'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { CollectionItemSummary, LearningAssetKind } from '@/types';
import { Icon } from '@/components/ui';
import {
  NOTEBOOK_KIND_ORDER,
  findNotebookItemByKind,
  getNotebookAssetHref,
  getNotebookCreateHref,
  getNotebookKindLabel,
} from '@/lib/notebook';
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

  const items = useMemo(
    () => [
      {
        kind: 'vocabulary_project' as const,
        icon: 'menu_book',
        title: '単語帳',
        sub: 'スキャン・手動・自動生成',
        blurb: '写真から単語を抽出し、単語帳として整理します。',
      },
      {
        kind: 'structure_document' as const,
        icon: 'account_tree',
        title: '構造解析',
        sub: '準1級レベルの構文を抽出',
        blurb: '句ごとのまとまりを折りたたみながら読めます。',
      },
      {
        kind: 'correction_document' as const,
        icon: 'spellcheck',
        title: '添削',
        sub: '誤用を洗い出して復習へ',
        blurb: '指摘、修正文、復習カードを一気通貫で保存します。',
      },
    ],
    [],
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-3" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-[28px] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--color-muted)]">新規作成</p>
            <h2 className="mt-1 text-[22px] font-extrabold tracking-tight text-[var(--color-foreground)]">
              何を作りますか？
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--color-muted)] transition hover:bg-black/5 hover:text-[var(--color-foreground)]"
            aria-label="閉じる"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div className="grid gap-3">
          {items.map((item) => (
            <button
              key={item.kind}
              type="button"
              onClick={() => {
                onClose();
                router.push(getNotebookCreateHref(collectionId, item.kind));
              }}
              className="flex items-start gap-4 rounded-[24px] border border-[var(--color-border)] bg-[var(--color-surface-secondary)] p-4 text-left transition hover:border-[var(--color-foreground)]"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] bg-[var(--color-foreground)] text-white">
                <Icon name={item.icon} size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-[16px] font-bold tracking-tight text-[var(--color-foreground)]">{item.title}</div>
                  <div className="text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
                    {item.sub}
                  </div>
                </div>
                <div className="mt-1 text-[12px] leading-relaxed text-[var(--color-muted)]">{item.blurb}</div>
              </div>
              <Icon name="arrow_forward" size={18} className="mt-1 text-[var(--color-muted)]" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function NotebookKindSwitch({
  collectionId,
  currentKind,
  items,
}: {
  collectionId: string;
  currentKind?: LearningAssetKind;
  items: CollectionItemSummary[];
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {NOTEBOOK_KIND_ORDER.map((kind) => {
        const item = findNotebookItemByKind(items, kind);
        const href = item
          ? getNotebookAssetHref(collectionId, item)
          : getNotebookCreateHref(collectionId, kind);
        const active = currentKind === kind;

        return (
          <Link
            key={kind}
            href={href}
            className={cn(
              'inline-flex items-center gap-2 rounded-[4px] border px-3 py-2 text-[11px] font-semibold tracking-[0.12em] uppercase transition',
              active
                ? 'border-[var(--color-foreground)] bg-[var(--color-foreground)] text-white'
                : 'border-[var(--color-border)] bg-transparent text-[var(--color-muted)] hover:border-[var(--color-foreground)] hover:text-[var(--color-foreground)]',
            )}
          >
            {getNotebookKindLabel(kind)}
            {!item && <Icon name="add" size={14} />}
          </Link>
        );
      })}
    </div>
  );
}

function NotebookBottomTabs() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur">
      <div className="mx-auto grid max-w-xl grid-cols-4 px-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-2">
        {APP_TABS.map((item) => (
          <Link
            key={item.id}
            href={item.href}
            className={cn(
              'flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 text-[10px] font-semibold transition',
              item.id === 'notes'
                ? 'text-[var(--color-foreground)]'
                : 'text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--color-foreground)]',
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

export function NotebookChrome({
  collectionId,
  currentKind,
  items,
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
      <div className="min-h-screen bg-[var(--color-background)] pb-36">
        <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-background)]/95 backdrop-blur">
          <div className="mx-auto max-w-xl px-4 pb-4 pt-3">
            <div className="flex items-center justify-between gap-3">
              <Link
                href={backHref}
                className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--color-foreground)] transition hover:bg-black/5"
                aria-label="戻る"
              >
                <Icon name="arrow_back_ios_new" size={16} />
              </Link>
              <div className="flex items-center gap-1">
                {headerActions.map((action) => {
                  if (action.href) {
                    return (
                      <Link
                        key={`${action.icon}-${action.label}`}
                        href={action.href}
                        className={cn(
                          'flex h-10 w-10 items-center justify-center rounded-full transition',
                          action.active
                            ? 'bg-[var(--color-foreground)] text-white'
                            : 'text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--color-foreground)]',
                        )}
                        aria-label={action.label}
                      >
                        <Icon name={action.icon} size={18} />
                      </Link>
                    );
                  }

                  return (
                    <button
                      key={`${action.icon}-${action.label}`}
                      type="button"
                      onClick={action.onClick}
                      className={cn(
                        'flex h-10 w-10 items-center justify-center rounded-full transition',
                        action.active
                          ? 'bg-[var(--color-foreground)] text-white'
                          : 'text-[var(--color-muted)] hover:bg-black/5 hover:text-[var(--color-foreground)]',
                      )}
                      aria-label={action.label}
                    >
                      <Icon name={action.icon} size={18} />
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-3">
              {subtitle && (
                <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">
                  {subtitle}
                </div>
              )}
              <h1 className="mt-1 text-[24px] font-extrabold tracking-tight text-[var(--color-foreground)]">{title}</h1>
            </div>

            <div className="mt-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">
              <Icon name="folder_open" size={12} />
              <span>ノート</span>
              <span>/</span>
              <span>{crumbLabel ?? title}</span>
            </div>

            <div className="mt-4">
              <NotebookKindSwitch collectionId={collectionId} currentKind={currentKind} items={items} />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-xl space-y-5 px-4 py-5">
          {actionStripItems && actionStripItems.length > 0 && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {actionStripItems.map((item) => {
                const content = (
                  <>
                    <div className="flex h-11 w-11 items-center justify-center rounded-[4px] bg-[var(--color-foreground)] text-white">
                      <Icon name={item.icon} size={20} />
                    </div>
                    <div>
                      <div className="text-[12px] font-semibold text-[var(--color-foreground)]">{item.label}</div>
                      {item.sub && <div className="mt-0.5 text-[10px] text-[var(--color-muted)]">{item.sub}</div>}
                    </div>
                    {item.badge && (
                      <div className="absolute right-3 top-3 text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--color-muted)]">
                        {item.badge}
                      </div>
                    )}
                  </>
                );

                const classes = 'relative flex min-h-[84px] flex-col justify-between rounded-[4px] border border-[var(--color-border)] bg-[var(--color-surface-secondary)] p-3 text-left transition hover:border-[var(--color-foreground)]';

                if (item.href) {
                  return (
                    <Link key={`${item.icon}-${item.label}`} href={item.href} className={classes}>
                      {content}
                    </Link>
                  );
                }

                return (
                  <button key={`${item.icon}-${item.label}`} type="button" onClick={item.onClick} className={classes}>
                    {content}
                  </button>
                );
              })}
            </div>
          )}

          {children}
        </main>

        <button
          type="button"
          onClick={() => setComposerOpen(true)}
          className="fixed bottom-24 right-5 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-foreground)] text-white shadow-[0_16px_32px_rgba(0,0,0,0.24)] transition hover:opacity-90"
          aria-label="新規作成"
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
    <section className="rounded-[4px] border border-[var(--color-border)] bg-[var(--color-surface)]">
      {(title || subtitle || right) && (
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
          <div>
            {title && <div className="text-[13px] font-bold text-[var(--color-foreground)]">{title}</div>}
            {subtitle && <div className="mt-0.5 text-[11px] text-[var(--color-muted)]">{subtitle}</div>}
          </div>
          {right}
        </div>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}
