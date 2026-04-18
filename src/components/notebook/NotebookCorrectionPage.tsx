'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MerkenPlusModal, type MerkenNotebookScreenId } from '@/components/notebook/MerkenPlusModal';
import {
  BottomTabs,
  Fab,
  FolderCrumb,
  MerkenIcon,
  StatusBar,
  TopNav,
} from '@/components/notebook/merken-primitives';
import {
  NotebookAuthRequiredState,
  NotebookErrorState,
  NotebookLoadingState,
} from '@/components/notebook/NotebookPageState';
import { useAuth } from '@/hooks/use-auth';
import { useNotebookBinding } from '@/hooks/use-notebook-binding';
import { useCorrectionDocument } from '@/hooks/use-correction-documents';
import {
  getNotebookCreateHref,
  getStandaloneCorrectionHref,
} from '@/lib/notebook';
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
    | { type: 'annotation'; id: string; value: string; label: string; message: string; suggestedText?: string }
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

function resolveBottomTabHref(id: 'home' | 'notes' | 'stats' | 'me', collectionId?: string) {
  switch (id) {
    case 'home':
      return '/';
    case 'stats':
      return '/stats';
    case 'me':
      return '/settings';
    case 'notes':
    default:
      return collectionId ? `/collections/${collectionId}/notes` : '/projects';
  }
}

export function NotebookCorrectionPage({
  collectionId,
  assetId,
}: {
  collectionId?: string;
  assetId: string;
}) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { asset, document, findings, reviewItems, loading, error, reanalyze } = useCorrectionDocument(assetId);
  const { binding } = useNotebookBinding(collectionId, {
    assetId: collectionId ? assetId : null,
  });

  const [showFixed, setShowFixed] = useState(false);
  const [textOpen, setTextOpen] = useState(true);
  const [openAnnotationId, setOpenAnnotationId] = useState<string | null>(null);
  const [expandedFindingId, setExpandedFindingId] = useState<string | null>(findings[1]?.id ?? null);
  const [showPlusModal, setShowPlusModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
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
    } catch (requestError) {
      window.alert(requestError instanceof Error ? requestError.message : '添削結果の更新に失敗しました。');
    } finally {
      setReanalyzing(false);
    }
  };

  const resolveScreenHref = (screen: MerkenNotebookScreenId) => {
    if (!asset) return '/collections';

    if (!collectionId) {
      if (screen === 'correction') {
        return getStandaloneCorrectionHref(asset.id);
      }
      return '/projects';
    }

    if (screen === 'wordbook') {
      return binding?.wordbookAssetId
        ? `/collections/${collectionId}/notes/wordbook/${binding.wordbookAssetId}`
        : getNotebookCreateHref(collectionId, 'vocabulary_project');
    }

    if (screen === 'structure') {
      return binding?.structureAssetId
        ? `/collections/${collectionId}/notes/structure/${binding.structureAssetId}`
        : binding?.wordbookAssetId
          ? getNotebookCreateHref(collectionId, 'structure_document', { wordbookAssetId: binding.wordbookAssetId })
          : getNotebookCreateHref(collectionId, 'structure_document');
    }

    return binding?.correctionAssetId
      ? `/collections/${collectionId}/notes/correction/${binding.correctionAssetId}`
      : binding?.wordbookAssetId
        ? getNotebookCreateHref(collectionId, 'correction_document', { wordbookAssetId: binding.wordbookAssetId })
        : getNotebookCreateHref(collectionId, 'correction_document');
  };

  if (authLoading || loading) {
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
          message={error || '指定した添削アセットが見つかりません。'}
          action={
            <Link
              href={collectionId ? `/collections/${collectionId}/notes` : '/projects'}
              className="inline-flex items-center justify-center rounded-xl bg-[var(--color-foreground)] px-5 py-2.5 font-semibold text-white transition hover:opacity-90"
            >
              戻る
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <>
      <div className="flex min-h-screen flex-col bg-white">
        <div className="mx-auto flex h-screen w-full max-w-[420px] flex-col overflow-hidden bg-white relative">
          <StatusBar />
          <div className="relative">
            <TopNav
              variant="swiss"
              onBack={() => router.push(collectionId ? `/collections/${collectionId}/notes` : '/projects')}
              sub="ノート · 添削"
              title={asset.title}
              trailing={(
                <>
                  <button
                    className={cn('press flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/5', showFixed && 'bg-black/5')}
                    onClick={() => setShowFixed((current) => !current)}
                  >
                    <MerkenIcon name="compare_arrows" size={18} />
                  </button>
                  <button
                    className={cn('press flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/5', showMenu && 'border-[3px] border-[#1662d9]')}
                    onClick={() => setShowMenu((current) => !current)}
                  >
                    <MerkenIcon name="more_horiz" size={18} />
                  </button>
                </>
              )}
            />

            {showMenu && (
              <div className="absolute right-4 top-16 z-40 w-44 border border-bd bg-white p-1 shadow-[0_14px_24px_-12px_rgba(0,0,0,0.3)]" style={{ borderRadius: 4 }}>
                <button
                  className="press flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-semibold hover:bg-black/5"
                  onClick={() => {
                    setShowMenu(false);
                    void handleReanalyze();
                  }}
                >
                  <MerkenIcon name={reanalyzing ? 'progress_activity' : 'autorenew'} size={16} className={reanalyzing ? 'animate-spin' : undefined} />
                  再解析
                </button>
                {binding?.wordbookAssetId && (
                  <button
                    className="press flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-semibold hover:bg-black/5"
                    onClick={() => {
                      setShowMenu(false);
                      router.push(`/collections/${collectionId}/notes/wordbook/${binding.wordbookAssetId}`);
                    }}
                  >
                    <MerkenIcon name="menu_book" size={16} />
                    単語帳へ
                  </button>
                )}
              </div>
            )}
          </div>

          <FolderCrumb
            variant="swiss"
            path={collectionId ? ['フォルダ', '添削'] : ['ノート', '添削']}
          />

          <div className="screenpad no-sb pb-[120px]">
            <div className="mb-3 flex items-center gap-2">
              <div
                className="bg-ink px-2.5 py-1 text-[10px] font-bold text-paper"
                style={{ borderRadius: 2, fontFamily: '"Inter Tight"', letterSpacing: '.08em' }}
              >
                {findings.length} 件の指摘
              </div>
              <div className="text-[10px] uppercase tracking-[.14em] text-muted font-semibold" style={{ fontFamily: '"Inter Tight"' }}>
                {document.lastAnalyzedAt
                  ? `${new Date(document.lastAnalyzedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} に提出`
                  : `${reviewItems.length} 件の復習`}
              </div>
              <div className="flex-1" />
              <button
                onClick={() => setShowFixed((current) => !current)}
                className="press border border-bd px-2.5 py-1 text-[11px]"
                style={{ borderRadius: 2, fontFamily: '"Inter Tight"' }}
              >
                {showFixed ? '元の文' : '修正版を表示'}
              </button>
            </div>

            <div className="overflow-hidden border border-bd bg-white" style={{ borderRadius: 3 }}>
              <button
                onClick={() => setTextOpen((current) => !current)}
                className={cn('press flex w-full items-center gap-2 p-3 text-left', textOpen && 'border-b border-bd')}
              >
                <MerkenIcon name={textOpen ? 'expand_more' : 'chevron_right'} size={18} />
                <div className="flex-1 text-[10px] font-bold uppercase tracking-[.14em] text-ink" style={{ fontFamily: '"Inter Tight"' }}>
                  あなたの文章
                </div>
                <span className="text-[10px] text-muted" style={{ fontFamily: '"Inter Tight"' }}>
                  {document.originalText.length} 文字
                </span>
              </button>

              {textOpen && (
                <div className="a-fadeup p-4">
                  <p className="font-sans text-[15px] leading-[1.95]">
                    {showFixed ? (
                      document.correctedText
                    ) : (
                      originalSegments.map((segment, index) => {
                        if (segment.type === 'text') {
                          return <span key={`text-${index}`}>{segment.value}</span>;
                        }

                        const isOpen = openAnnotationId === segment.id;
                        return (
                          <span key={segment.id} className="relative">
                            <span className="err" onClick={() => setOpenAnnotationId(isOpen ? null : segment.id)}>
                              {segment.value}
                            </span>
                            {isOpen && (
                              <span
                                className="bubble a-fadeup block"
                                style={{ top: '28px', left: '-40px', right: 'auto', width: '240px' }}
                              >
                                <span className="mb-1 block text-[9.5px] tracking-[.2em] opacity-70" style={{ fontFamily: '"Inter Tight"' }}>
                                  {segment.label}
                                </span>
                                <span className="block">{segment.message}</span>
                                {segment.suggestedText && <span className="mt-1.5 block text-[#5ddc8a]">→ {segment.suggestedText}</span>}
                              </span>
                            )}
                          </span>
                        );
                      })
                    )}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center gap-2 text-[10px] text-muted uppercase tracking-[.14em] font-semibold" style={{ fontFamily: '"Inter Tight"' }}>
                <span>抽出された文法</span>
                <span className="h-px flex-1 bg-rule" />
                <span>タップで展開</span>
              </div>

              <div className="border-l border-r border-t border-bd overflow-hidden" style={{ borderRadius: 3 }}>
                {findings.map((finding, index) => {
                  const open = expandedFindingId === finding.id;
                  return (
                    <div key={finding.id} className={cn('a-fadeup border-b border-bd', index === findings.length - 1 && 'border-b-0')} style={{ animationDelay: `${index * 50}ms` }}>
                      <button onClick={() => setExpandedFindingId(open ? null : finding.id)} className="press flex w-full items-start gap-3 p-3 text-left">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center bg-ink text-[11px] font-bold text-paper" style={{ borderRadius: 2, fontFamily: '"Inter Tight"' }}>
                          {index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-sans text-[13.5px] font-bold tracking-tight">{finding.ruleNameJa}</div>
                          <div className="mt-0.5 truncate text-[11px] text-muted">{finding.suggestedText}</div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          {Array.from({ length: 3 }).map((_, barIndex) => (
                            <span key={barIndex} className={cn('h-3 w-1 rounded-sm', barIndex < finding.difficulty ? 'bg-ink' : 'bg-rule')} />
                          ))}
                          <MerkenIcon name={open ? 'expand_less' : 'expand_more'} size={18} className="ml-1 text-muted" />
                        </div>
                      </button>

                      {open && (
                        <div className="a-fadeup px-3 pb-3">
                          <div className="grid grid-cols-[80px_1fr] gap-x-3 gap-y-2 text-[12px]">
                            <div className="self-center text-[10px] uppercase tracking-[.14em] text-muted font-bold" style={{ fontFamily: '"Inter Tight"' }}>
                              正しい使い方
                            </div>
                            <div className="leading-relaxed">{finding.formalUsageJa}</div>

                            <div className="self-center text-[10px] uppercase tracking-[.14em] text-muted font-bold" style={{ fontFamily: '"Inter Tight"' }}>
                              例文
                            </div>
                            <div className="font-mono text-[11.5px] leading-relaxed">
                              {finding.exampleSentence || '例文はまだありません。'}
                            </div>

                            <div className="self-center text-[10px] uppercase tracking-[.14em] text-muted font-bold" style={{ fontFamily: '"Inter Tight"' }}>
                              あなたの誤用
                            </div>
                            <div className="leading-relaxed">
                              <span className="err decoration-[#ef4444]">{finding.incorrectText}</span>
                            </div>

                            <div className="self-center text-[10px] uppercase tracking-[.14em] text-muted font-bold" style={{ fontFamily: '"Inter Tight"' }}>
                              助言
                            </div>
                            <div className="leading-relaxed text-ink">{finding.learnerAdvice}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <Fab onClick={() => setShowPlusModal(true)} />
          <BottomTabs
            active="notes"
            variant="swiss"
            onSelect={(id) => router.push(resolveBottomTabHref(id, collectionId))}
          />
          <MerkenPlusModal
            open={showPlusModal}
            onClose={() => setShowPlusModal(false)}
            onPick={(screen) => router.push(resolveScreenHref(screen))}
            variant="swiss"
          />
        </div>
      </div>
    </>
  );
}
