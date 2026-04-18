'use client';

import { useState } from 'react';
import Link from 'next/link';
import { NotebookAuthRequiredState, NotebookChrome, NotebookErrorState, NotebookLoadingState } from '@/components/notebook';
import { Icon, useToast } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { useCollectionItems } from '@/hooks/use-collection-items';
import { useStructureDocument } from '@/hooks/use-structure-documents';
import type { StructureNode } from '@/types';
import { cn } from '@/lib/utils';

function StructureTreeNode({
  node,
  depth = 0,
}: {
  node: StructureNode;
  depth?: number;
}) {
  const hasChildren = node.children.length > 0;
  const defaultOpen = node.collapsible ? depth === 0 : true;
  const [open, setOpen] = useState(defaultOpen);

  if (!hasChildren) {
    const content = node.text?.trim() || node.label.trim();
    return (
      <span className="inline text-[16px] leading-[1.95] text-[var(--notebook-ink)]">
        {content}
        {' '}
      </span>
    );
  }

  return (
    <span className="inline">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="notebook-press inline-flex items-center gap-1.5 rounded-[3px] border border-[var(--notebook-ink)] px-2 py-[2px] align-baseline text-[13px] font-bold uppercase tracking-[0.1em] text-[var(--notebook-ink)] notebook-sans"
      >
        <Icon name={open ? 'expand_more' : 'chevron_right'} size={14} />
        <span>{node.label}</span>
        {!open && <span className="text-[var(--notebook-muted)]">…</span>}
      </button>
      {open && (
        <span className="animate-fade-in inline">
          <span className="mx-[1px] rounded-[2px] bg-[var(--notebook-warm)] px-1.5 py-[1px]">
            {node.children.map((child) => (
              <StructureTreeNode key={child.id} node={child} depth={depth + 1} />
            ))}
          </span>
        </span>
      )}
      {' '}
    </span>
  );
}

export function NotebookStructurePage({
  collectionId,
  assetId,
}: {
  collectionId: string;
  assetId: string;
}) {
  const { user, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { items, loading: itemsLoading, error: itemsError } = useCollectionItems(collectionId);
  const { asset, document, loading, error, reanalyze } = useStructureDocument(assetId);
  const [reanalyzing, setReanalyzing] = useState(false);

  const handleReanalyze = async () => {
    try {
      setReanalyzing(true);
      await reanalyze();
      showToast({ message: '構造解析を更新しました', type: 'success' });
    } catch (requestError) {
      showToast({
        message: requestError instanceof Error ? requestError.message : '構造解析の更新に失敗しました。',
        type: 'error',
      });
    } finally {
      setReanalyzing(false);
    }
  };

  if (authLoading || loading || itemsLoading) {
    return <NotebookLoadingState />;
  }

  if (!user) {
    return <NotebookAuthRequiredState />;
  }

  if (!asset || !document) {
    return (
      <div className="mx-auto max-w-xl px-4 py-6">
        <NotebookErrorState
          title="構造解析を開けませんでした"
          message={error || itemsError || '指定した構造解析アセットが見つかりません。'}
          action={
            <Link
              href={`/collections/${collectionId}/notes`}
              className="inline-flex items-center justify-center rounded-xl bg-[var(--color-foreground)] px-5 py-2.5 font-semibold text-white transition hover:opacity-90"
            >
              ノート一覧へ戻る
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <NotebookChrome
      collectionId={collectionId}
      currentKind="structure_document"
      items={items}
      title={asset.title}
      subtitle="ノート · 構造解析"
      crumbLabel="構造解析"
      backHref={`/collections/${collectionId}/notes`}
      headerActions={[
        {
          icon: reanalyzing ? 'progress_activity' : 'autorenew',
          label: '再解析',
          onClick: handleReanalyze,
        },
      ]}
    >
      <section className="notebook-sans">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--notebook-muted)]">
          <span>英文</span>
          <span className="h-px flex-1 bg-[var(--notebook-rule)]" />
          <span>句をタップで折りたたみ</span>
        </div>

        <div className="rounded-[4px] border border-[var(--notebook-rule)] bg-white p-4">
          {document.parseTree.length === 0 ? (
            <p className="text-[16px] leading-[1.95] text-[var(--notebook-ink)]">{document.normalizedText}</p>
          ) : (
            <div className="text-[16px] leading-[1.95] text-[var(--notebook-ink)]">
              {document.parseTree.map((node) => (
                <StructureTreeNode key={node.id} node={node} />
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="notebook-sans">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--notebook-muted)]">
          解説
        </div>
        {document.analysisSummary.notes.length === 0 ? (
          <div className="text-sm leading-relaxed text-[var(--notebook-muted)]">{document.analysisSummary.overview}</div>
        ) : (
          <div className="space-y-2">
            {document.analysisSummary.notes.map((note, index) => (
              <div
                key={`${note.label}-${note.body}`}
                className={cn(
                  'animate-fade-in-up flex gap-3 rounded-[4px] border border-[var(--notebook-rule)] p-3',
                  index % 2 === 0 ? 'bg-[var(--notebook-cream)]' : 'bg-white',
                )}
              >
                <div className="w-10 shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--notebook-ink)]">
                  {note.shortLabel || note.label}
                </div>
                <div className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-[var(--notebook-ink)]">
                  {note.body}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="notebook-sans">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--notebook-muted)]">
          <span>この英文に登場する単語</span>
          <span className="h-px flex-1 bg-[var(--notebook-rule)]" />
        </div>
        {document.mentionedTerms.length === 0 ? (
          <div className="text-sm text-[var(--notebook-muted)]">重要語句はまだ抽出されていません。</div>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {document.mentionedTerms.map((term) => (
              <span
                key={term}
                className={cn(
                  'notebook-highlight text-[12.5px] text-[var(--notebook-ink)]',
                  /\s/.test(term) && 'notebook-highlight-idiom text-[#9d1a5b]',
                )}
              >
                {term}
              </span>
            ))}
          </div>
        )}
      </section>
    </NotebookChrome>
  );
}
