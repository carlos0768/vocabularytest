'use client';

import Link from 'next/link';
import { NotebookAuthRequiredState, NotebookChrome, NotebookCard, NotebookErrorState, NotebookLoadingState } from '@/components/notebook';
import { Icon } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { useCollectionItems } from '@/hooks/use-collection-items';
import {
  NOTEBOOK_KIND_ORDER,
  findNotebookItemByKind,
  getNotebookAssetHref,
  getNotebookCreateHref,
  getNotebookKindLabel,
} from '@/lib/notebook';

export function NotebookNotesHomePage({
  collectionId,
}: {
  collectionId: string;
}) {
  const { user, loading: authLoading } = useAuth();
  const { items, loading, error } = useCollectionItems(collectionId);

  if (authLoading || loading) {
    return <NotebookLoadingState />;
  }

  if (!user) {
    return <NotebookAuthRequiredState />;
  }

  if (error) {
    return (
      <div className="mx-auto max-w-xl px-4 py-6">
        <NotebookErrorState
          title="ノート一覧を開けませんでした"
          message={error}
          action={
            <Link
              href={`/collections/${collectionId}/manage`}
              className="inline-flex items-center justify-center rounded-xl bg-[var(--color-foreground)] px-5 py-2.5 font-semibold text-white transition hover:opacity-90"
            >
              collection へ戻る
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <NotebookChrome
      collectionId={collectionId}
      items={items}
      title="ノート"
      subtitle="collection notebook"
      crumbLabel="一覧"
      backHref="/collections"
    >
      <NotebookCard title="3つの面を切り替えて学習" subtitle="単語帳 / 構造解析 / 添削">
        <div className="grid gap-3">
          {NOTEBOOK_KIND_ORDER.map((kind) => {
            const item = findNotebookItemByKind(items, kind);
            const href = item ? getNotebookAssetHref(collectionId, item) : getNotebookCreateHref(collectionId, kind);

            return (
              <Link
                key={kind}
                href={href}
                className="flex items-start gap-4 rounded-[4px] border border-[var(--color-border)] bg-[var(--color-surface-secondary)] p-4 transition hover:border-[var(--color-foreground)]"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[4px] bg-[var(--color-foreground)] text-white">
                  <Icon
                    name={
                      kind === 'structure_document'
                        ? 'account_tree'
                        : kind === 'correction_document'
                          ? 'spellcheck'
                          : 'menu_book'
                    }
                    size={22}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[16px] font-bold tracking-tight text-[var(--color-foreground)]">
                    {getNotebookKindLabel(kind)}
                  </div>
                  <div className="mt-1 text-[12px] leading-relaxed text-[var(--color-muted)]">
                    {item ? `${item.asset.title} を開く` : `${getNotebookKindLabel(kind)}を新規作成`}
                  </div>
                </div>
                {!item && (
                  <div className="rounded-full bg-[var(--color-foreground)] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white">
                    New
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </NotebookCard>
    </NotebookChrome>
  );
}
