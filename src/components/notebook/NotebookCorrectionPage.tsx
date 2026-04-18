'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { NotebookAuthRequiredState, NotebookChrome, NotebookErrorState, NotebookLoadingState } from '@/components/notebook';
import { Icon, useToast } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { useCollectionItems } from '@/hooks/use-collection-items';
import { useCorrectionDocument } from '@/hooks/use-correction-documents';
import { cn } from '@/lib/utils';

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
  const [textOpen, setTextOpen] = useState(true);
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
      backHref={`/collections/${collectionId}/notes`}
      headerActions={[
        {
          icon: 'compare_arrows',
          label: showFixed ? '原文を表示' : '修正版を表示',
          onClick: () => setShowFixed((current) => !current),
          active: showFixed,
        },
        {
          icon: reanalyzing ? 'progress_activity' : 'more_horiz',
          label: '再解析',
          onClick: handleReanalyze,
        },
      ]}
    >
      <div className="flex items-center gap-2 notebook-sans">
        <div className="notebook-chip">
          {findings.length} 件の指摘
        </div>
        {document.lastAnalyzedAt && (
          <div className="text-[10px] uppercase tracking-[0.14em] text-[var(--notebook-muted)]">
            {new Date(document.lastAnalyzedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} に提出
          </div>
        )}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setShowFixed((current) => !current)}
          className="notebook-press rounded-[4px] border border-[var(--notebook-rule)] px-2.5 py-1 text-[11px] text-[var(--notebook-ink)]"
        >
          {showFixed ? '元の文' : '修正版を表示'}
        </button>
      </div>

      <div className="overflow-hidden rounded-[4px] border border-[var(--notebook-rule)] bg-white notebook-sans">
        <button
          type="button"
          onClick={() => setTextOpen((current) => !current)}
          className={cn(
            'notebook-press flex w-full items-center gap-2 p-3 text-left',
            textOpen && 'border-b border-[var(--notebook-rule)]',
          )}
        >
          <Icon name={textOpen ? 'expand_more' : 'chevron_right'} size={18} />
          <div className="flex-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--notebook-ink)]">
            あなたの文章
          </div>
          <span className="text-[10px] text-[var(--notebook-muted)]">{document.originalText.length} 文字</span>
        </button>

        {textOpen && (
          <div className="animate-fade-in-up p-4">
            {showFixed ? (
              <p className="text-[15px] leading-[1.95] text-[var(--notebook-ink)]">{document.correctedText}</p>
            ) : (
              <p className="text-[15px] leading-[1.95] text-[var(--notebook-ink)]">
                {originalSegments.map((segment, index) => {
                  if (segment.type === 'text') {
                    return <span key={`text-${index}`}>{segment.value}</span>;
                  }

                  const open = openAnnotationId === segment.id;
                  return (
                    <span key={segment.id} className="relative">
                      <span
                        onClick={() => setOpenAnnotationId(open ? null : segment.id)}
                        className="notebook-error"
                      >
                        {segment.value}
                      </span>
                      {open && (
                        <span className="notebook-bubble left-0 top-[calc(100%+0.75rem)] block w-60">
                          <span className="block text-[9.5px] uppercase tracking-[0.2em] text-white/70">{segment.label}</span>
                          <span className="mt-1 block">{segment.message}</span>
                          {segment.suggestedText && (
                            <span className="mt-1.5 block text-[#5ddc8a]">→ {segment.suggestedText}</span>
                          )}
                        </span>
                      )}
                    </span>
                  );
                })}
              </p>
            )}
          </div>
        )}
      </div>

      <section className="notebook-sans">
        <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--notebook-muted)]">
          <span>抽出された文法</span>
          <span className="h-px flex-1 bg-[var(--notebook-rule)]" />
          <span>復習 {reviewItems.length} 件</span>
        </div>

        <div className="overflow-hidden rounded-[4px] border border-[var(--notebook-rule)] bg-white">
          {findings.map((finding, index) => {
            const open = expandedFindingId === finding.id;

            return (
              <div key={finding.id} className={cn('border-b border-[var(--notebook-rule)] last:border-b-0', index === 0 && 'animate-fade-in-up')}>
                <button
                  type="button"
                  onClick={() => setExpandedFindingId(open ? null : finding.id)}
                  className="notebook-press flex w-full items-start gap-3 p-3 text-left"
                >
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[2px] bg-[var(--notebook-ink)] text-[11px] font-bold text-white">
                    {index + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-bold tracking-tight text-[var(--notebook-ink)]">
                      {finding.ruleNameJa}
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-[var(--notebook-muted)]">{finding.suggestedText}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {Array.from({ length: 3 }).map((_, barIndex) => (
                      <span
                        key={barIndex}
                        className={cn(
                          'h-3 w-1 rounded-sm',
                          barIndex < finding.difficulty ? 'bg-[var(--notebook-ink)]' : 'bg-[var(--notebook-rule)]',
                        )}
                      />
                    ))}
                    <Icon name={open ? 'expand_less' : 'expand_more'} size={18} className="ml-1 text-[var(--notebook-muted)]" />
                  </div>
                </button>

                {open && (
                  <div className="animate-fade-in-up grid gap-y-2 gap-x-3 px-3 pb-3 text-[12px] leading-relaxed sm:grid-cols-[80px_1fr]">
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--notebook-muted)]">正しい使い方</div>
                    <div className="text-[var(--notebook-ink)]">{finding.formalUsageJa}</div>

                    {finding.exampleSentence && (
                      <>
                        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--notebook-muted)]">例文</div>
                        <div className="text-[var(--notebook-ink)]">
                          {finding.exampleSentence}
                          {finding.exampleSentenceJa && (
                            <div className="mt-1 text-[11px] text-[var(--notebook-muted)]">{finding.exampleSentenceJa}</div>
                          )}
                        </div>
                      </>
                    )}

                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--notebook-muted)]">あなたの誤用</div>
                    <div className="text-[var(--color-error)]">{finding.incorrectText}</div>

                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--notebook-muted)]">助言</div>
                    <div className="text-[var(--notebook-ink)]">{finding.learnerAdvice}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </NotebookChrome>
  );
}
