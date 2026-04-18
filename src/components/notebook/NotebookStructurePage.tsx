'use client';

import { useState } from 'react';
import Link from 'next/link';
import { NotebookAuthRequiredState, NotebookChrome, NotebookCard, NotebookErrorState, NotebookLoadingState } from '@/components/notebook';
import { Icon, useToast } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { useCollectionItems } from '@/hooks/use-collection-items';
import { useStructureDocument } from '@/hooks/use-structure-documents';
import type { StructureNode } from '@/types';

function StructureTreeNode({
  node,
  depth = 0,
}: {
  node: StructureNode;
  depth?: number;
}) {
  const [open, setOpen] = useState(depth === 0);
  const hasChildren = node.children.length > 0;

  return (
    <div className="space-y-2">
      <div className="rounded-[4px] border border-[var(--color-border)] bg-[var(--color-surface-secondary)] p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-bold text-[var(--color-foreground)]">{node.label}</div>
            <div className="mt-1 text-[13px] leading-relaxed text-[var(--color-foreground)]">
              {node.text || 'このまとまりの本文がありません。'}
            </div>
          </div>
          {hasChildren && (
            <button
              type="button"
              onClick={() => setOpen((current) => !current)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--color-muted)] transition hover:bg-black/5 hover:text-[var(--color-foreground)]"
              aria-label={open ? '閉じる' : '開く'}
            >
              <Icon name={open ? 'expand_less' : 'expand_more'} size={18} />
            </button>
          )}
        </div>
      </div>

      {hasChildren && open && (
        <div className="space-y-2 border-l border-[var(--color-border)] pl-4">
          {node.children.map((child) => (
            <StructureTreeNode key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
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
      headerActions={[
        {
          icon: reanalyzing ? 'progress_activity' : 'autorenew',
          label: '再解析',
          onClick: handleReanalyze,
        },
      ]}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="rounded-full bg-[var(--color-foreground)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white">
          {document.analysisSummary.detectedPatterns.length} 種の構文
        </div>
        {document.lastAnalyzedAt && (
          <div className="text-[11px] text-[var(--color-muted)]">最終解析 {new Date(document.lastAnalyzedAt).toLocaleString('ja-JP')}</div>
        )}
      </div>

      <NotebookCard title="英文" subtitle="まとまりを見ながら読めます">
        <p className="text-[16px] leading-[1.9] text-[var(--color-foreground)]">{document.normalizedText}</p>
      </NotebookCard>

      <NotebookCard title="構造ブロック" subtitle="タップで展開 / 折りたたみ">
        {document.parseTree.length === 0 ? (
          <div className="text-sm text-[var(--color-muted)]">構造ブロックはまだ生成されていません。</div>
        ) : (
          <div className="space-y-3">
            {document.parseTree.map((node) => (
              <StructureTreeNode key={node.id} node={node} />
            ))}
          </div>
        )}
      </NotebookCard>

      <NotebookCard title="解説" subtitle={document.analysisSummary.overview}>
        {document.analysisSummary.notes.length === 0 ? (
          <div className="text-sm leading-relaxed text-[var(--color-muted)]">{document.analysisSummary.overview}</div>
        ) : (
          <div className="space-y-2">
            {document.analysisSummary.notes.map((note) => (
              <div key={`${note.label}-${note.body}`} className="flex gap-3 rounded-[4px] border border-[var(--color-border)] bg-[var(--color-surface-secondary)] p-3">
                <div className="w-14 shrink-0 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--color-muted)]">
                  {note.shortLabel || note.label}
                </div>
                <div className="min-w-0 flex-1">
                  {!note.shortLabel && <div className="text-[13px] font-semibold text-[var(--color-foreground)]">{note.label}</div>}
                  <div className="text-[13px] leading-relaxed text-[var(--color-foreground)]">{note.body}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </NotebookCard>

      <NotebookCard title="この英文に登場する単語" subtitle="重要語句">
        {document.mentionedTerms.length === 0 ? (
          <div className="text-sm text-[var(--color-muted)]">重要語句はまだ抽出されていません。</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {document.mentionedTerms.map((term) => (
              <span
                key={term}
                className="rounded-full bg-slate-100 px-3 py-1 text-[12px] font-medium text-slate-700"
              >
                {term}
              </span>
            ))}
          </div>
        )}
      </NotebookCard>
    </NotebookChrome>
  );
}
