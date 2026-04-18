'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { NotebookAuthRequiredState, NotebookChrome, NotebookCard, NotebookErrorState, NotebookLoadingState } from '@/components/notebook';
import { Icon, useToast } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { useCollectionItems } from '@/hooks/use-collection-items';
import { useCorrectionDocument } from '@/hooks/use-correction-documents';

function segmentText(
  text: string,
  annotations: Array<{
    id: string;
    start: number;
    end: number;
    label: string;
    message: string;
    suggestedText?: string;
  }>,
) {
  const sorted = [...annotations]
    .filter((annotation) => annotation.start >= 0 && annotation.end > annotation.start && annotation.end <= text.length)
    .sort((left, right) => left.start - right.start);

  const result: Array<
    | { type: 'text'; value: string }
    | {
      type: 'annotation';
      id: string;
      value: string;
      label: string;
      message: string;
      suggestedText?: string;
    }
  > = [];

  let cursor = 0;
  for (const annotation of sorted) {
    if (annotation.start < cursor) continue;
    if (cursor < annotation.start) {
      result.push({ type: 'text', value: text.slice(cursor, annotation.start) });
    }
    result.push({
      type: 'annotation',
      id: annotation.id,
      value: text.slice(annotation.start, annotation.end),
      label: annotation.label,
      message: annotation.message,
      suggestedText: annotation.suggestedText,
    });
    cursor = annotation.end;
  }

  if (cursor < text.length) {
    result.push({ type: 'text', value: text.slice(cursor) });
  }

  return result;
}

export function NotebookCorrectionPage({
  collectionId,
  assetId,
}: {
  collectionId: string;
  assetId: string;
}) {
  const { user, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const { items, loading: itemsLoading, error: itemsError } = useCollectionItems(collectionId);
  const { asset, document, findings, reviewItems, loading, error, reanalyze } = useCorrectionDocument(assetId);

  const [showFixed, setShowFixed] = useState(false);
  const [openAnnotationId, setOpenAnnotationId] = useState<string | null>(null);
  const [expandedFindingId, setExpandedFindingId] = useState<string | null>(null);
  const [reanalyzing, setReanalyzing] = useState(false);

  const originalSegments = useMemo(
    () => (document ? segmentText(document.originalText, document.inlineAnnotations) : []),
    [document],
  );

  const handleReanalyze = async () => {
    try {
      setReanalyzing(true);
      await reanalyze();
      setOpenAnnotationId(null);
      setExpandedFindingId(null);
      showToast({ message: '添削結果を更新しました', type: 'success' });
    } catch (requestError) {
      showToast({
        message: requestError instanceof Error ? requestError.message : '添削結果の更新に失敗しました。',
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
          title="添削ノートを開けませんでした"
          message={error || itemsError || '指定した添削アセットが見つかりません。'}
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
      currentKind="correction_document"
      items={items}
      title={asset.title}
      subtitle="ノート · 添削"
      crumbLabel="添削"
      headerActions={[
        {
          icon: 'compare_arrows',
          label: showFixed ? '原文を表示' : '修正版を表示',
          onClick: () => setShowFixed((current) => !current),
          active: showFixed,
        },
        {
          icon: reanalyzing ? 'progress_activity' : 'autorenew',
          label: '再解析',
          onClick: handleReanalyze,
        },
      ]}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="rounded-full bg-[var(--color-foreground)] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] text-white">
          {findings.length} 件の指摘
        </div>
        {document.lastAnalyzedAt && (
          <div className="text-[11px] text-[var(--color-muted)]">最終解析 {new Date(document.lastAnalyzedAt).toLocaleString('ja-JP')}</div>
        )}
      </div>

      <NotebookCard
        title="あなたの文章"
        subtitle={showFixed ? '修正版を表示中' : '指摘箇所をタップしてヒントを表示'}
        right={
          <button
            type="button"
            onClick={() => setShowFixed((current) => !current)}
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-[11px] font-semibold text-[var(--color-muted)] transition hover:border-[var(--color-foreground)] hover:text-[var(--color-foreground)]"
          >
            {showFixed ? '元の文' : '修正版を表示'}
          </button>
        }
      >
        {showFixed ? (
          <p className="text-[15px] leading-[1.95] text-[var(--color-foreground)]">{document.correctedText}</p>
        ) : (
          <p className="text-[15px] leading-[1.95] text-[var(--color-foreground)]">
            {originalSegments.map((segment, index) => {
              if (segment.type === 'text') {
                return <span key={`text-${index}`}>{segment.value}</span>;
              }

              const open = openAnnotationId === segment.id;
              return (
                <span key={segment.id} className="relative">
                  <button
                    type="button"
                    onClick={() => setOpenAnnotationId(open ? null : segment.id)}
                    className="rounded-sm px-[1px] font-medium text-[var(--color-error)] underline decoration-[var(--color-error)] decoration-2 underline-offset-4"
                  >
                    {segment.value}
                  </button>
                  {open && (
                    <span className="absolute left-0 top-[calc(100%+0.5rem)] z-10 block w-60 rounded-xl border border-[var(--color-border)] bg-[var(--color-foreground)] p-3 text-left text-[12px] leading-relaxed text-white shadow-2xl">
                      <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-white/60">{segment.label}</span>
                      <span className="mt-1 block">{segment.message}</span>
                      {segment.suggestedText && (
                        <span className="mt-2 block text-emerald-300">→ {segment.suggestedText}</span>
                      )}
                    </span>
                  )}
                </span>
              );
            })}
          </p>
        )}
      </NotebookCard>

      <NotebookCard
        title="抽出された文法"
        subtitle={document.summary.overview}
        right={<div className="text-[11px] text-[var(--color-muted)]">復習 {reviewItems.length} 件</div>}
      >
        <div className="space-y-2">
          {findings.map((finding, index) => {
            const open = expandedFindingId === finding.id;

            return (
              <div key={finding.id} className="rounded-[4px] border border-[var(--color-border)] bg-[var(--color-surface-secondary)]">
                <button
                  type="button"
                  onClick={() => setExpandedFindingId(open ? null : finding.id)}
                  className="flex w-full items-start gap-3 p-3 text-left"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] bg-[var(--color-foreground)] text-[11px] font-bold text-white">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold tracking-tight text-[var(--color-foreground)]">
                      {finding.ruleNameJa}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-[var(--color-muted)]">{finding.suggestedText}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 3 }).map((_, barIndex) => (
                      <span
                        key={barIndex}
                        className={barIndex < finding.difficulty ? 'h-3 w-1 rounded-sm bg-[var(--color-foreground)]' : 'h-3 w-1 rounded-sm bg-[var(--color-border)]'}
                      />
                    ))}
                    <Icon name={open ? 'expand_less' : 'expand_more'} size={18} className="ml-1 text-[var(--color-muted)]" />
                  </div>
                </button>

                {open && (
                  <div className="grid gap-3 border-t border-[var(--color-border)] px-3 py-3 text-[13px] leading-relaxed">
                    <div className="grid gap-1 sm:grid-cols-[96px_1fr]">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">正しい使い方</div>
                      <div className="text-[var(--color-foreground)]">{finding.formalUsageJa}</div>
                    </div>
                    {finding.exampleSentence && (
                      <div className="grid gap-1 sm:grid-cols-[96px_1fr]">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">例文</div>
                        <div className="text-[var(--color-foreground)]">
                          {finding.exampleSentence}
                          {finding.exampleSentenceJa && (
                            <div className="mt-1 text-[12px] text-[var(--color-muted)]">{finding.exampleSentenceJa}</div>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="grid gap-1 sm:grid-cols-[96px_1fr]">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">あなたの誤用</div>
                      <div className="text-[var(--color-error)]">{finding.incorrectText}</div>
                    </div>
                    <div className="grid gap-1 sm:grid-cols-[96px_1fr]">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">助言</div>
                      <div className="text-[var(--color-foreground)]">{finding.learnerAdvice}</div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </NotebookCard>
    </NotebookChrome>
  );
}
