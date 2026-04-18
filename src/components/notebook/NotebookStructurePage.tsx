'use client';

import Link from 'next/link';
import { useState } from 'react';
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
import { useStructureDocument } from '@/hooks/use-structure-documents';
import {
  getNotebookCreateHref,
  getStandaloneStructureHref,
} from '@/lib/notebook';
import type { StructureNode } from '@/types';
import { cn } from '@/lib/utils';

type MerkenStructureNode =
  | { kind: 'sentence'; children: MerkenStructureNode[] }
  | { kind: 'leaf'; text: string }
  | { kind: 'punct'; text: string }
  | { kind: 'clause'; label: string; defaultState: 'open' | 'collapsed'; children: MerkenStructureNode[] };

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

function mapToMerkenNode(node: StructureNode, depth = 0): MerkenStructureNode {
  if (node.children.length === 0) {
    const content = node.text?.trim() || node.label.trim();
    if (/^[,.;:!?]$/.test(content)) {
      return { kind: 'punct', text: content };
    }
    return { kind: 'leaf', text: content };
  }

  return {
    kind: 'clause',
    label: node.label,
    defaultState: depth === 0 ? 'open' : 'collapsed',
    children: node.children.map((child) => mapToMerkenNode(child, depth + 1)),
  };
}

function StructureTreeNode({
  node,
  variant = 'swiss',
}: {
  node: MerkenStructureNode;
  variant?: 'editorial' | 'swiss';
}) {
  const editorial = variant === 'editorial';
  const [open, setOpen] = useState(node.kind === 'clause' ? node.defaultState === 'open' : true);

  if (node.kind === 'sentence') {
    return (
      <div className="space-y-1">
        {node.children.map((child, index) => (
          <StructureTreeNode key={index} node={child} variant={variant} />
        ))}
      </div>
    );
  }

  if (node.kind === 'leaf') {
    return (
      <span className={cn(editorial ? 'font-serif' : 'font-sans')} style={{ fontSize: editorial ? 18 : 16, lineHeight: 1.9 }}>
        {node.text}{' '}
      </span>
    );
  }

  if (node.kind === 'punct') {
    return <span>{node.text} </span>;
  }

  return (
    <span className="inline">
      <button
        onClick={() => setOpen((current) => !current)}
        className={cn(
          'press inline-flex items-center gap-1.5 px-2 py-[2px] my-[1px] align-baseline border border-ink',
          editorial ? 'rounded-full bg-[#efead9] border-rule' : '',
        )}
        style={{
          borderRadius: editorial ? 999 : 3,
          fontFamily: editorial ? 'Fraunces, serif' : '"Inter Tight"',
          fontSize: editorial ? 15 : 13,
        }}
      >
        <MerkenIcon name={open ? 'expand_more' : 'chevron_right'} size={14} />
        <span className={editorial ? 'italic' : 'font-bold uppercase tracking-[.1em]'}>{node.label}</span>
        {!open && <span className="text-muted">…</span>}
      </button>

      {open && (
        <span className="a-fadeup inline">
          <span className={cn(editorial ? 'bg-[#fff7e4]' : 'bg-[#f4f4f1]', 'mx-[1px] px-1.5 py-[1px]')} style={{ borderRadius: editorial ? 4 : 2 }}>
            {node.children.map((child, index) => (
              <StructureTreeNode key={index} node={child} variant={variant} />
            ))}
          </span>
        </span>
      )}{' '}
    </span>
  );
}

export function NotebookStructurePage({
  collectionId,
  assetId,
}: {
  collectionId?: string;
  assetId: string;
}) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { asset, document, loading, error, reanalyze } = useStructureDocument(assetId);
  const { binding } = useNotebookBinding(collectionId, {
    assetId: collectionId ? assetId : null,
  });

  const [showPlusModal, setShowPlusModal] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [reanalyzing, setReanalyzing] = useState(false);

  const handleReanalyze = async () => {
    try {
      setReanalyzing(true);
      await reanalyze();
    } catch (requestError) {
      window.alert(requestError instanceof Error ? requestError.message : '構造解析の更新に失敗しました。');
    } finally {
      setReanalyzing(false);
    }
  };

  const resolveScreenHref = (screen: MerkenNotebookScreenId) => {
    if (!asset) return '/collections';

    if (!collectionId) {
      if (screen === 'wordbook') {
        return '/projects';
      }
      if (screen === 'structure') {
        return getStandaloneStructureHref(asset.id);
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
          title="構造解析を開けませんでした"
          message={error || '指定した構造解析アセットが見つかりません。'}
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

  const treeRoot: MerkenStructureNode = {
    kind: 'sentence',
    children: document.parseTree.map((node) => mapToMerkenNode(node)),
  };

  return (
    <>
      <div className="flex min-h-screen flex-col bg-white">
        <div className="mx-auto flex h-screen w-full max-w-[420px] flex-col overflow-hidden bg-white relative">
          <StatusBar />
          <div className="relative">
            <TopNav
              variant="swiss"
              onBack={() => router.push(collectionId ? `/collections/${collectionId}/notes` : '/projects')}
              sub="ノート · 構造解析"
              title={asset.title}
              trailing={(
                <>
                  <button className="press flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/5" onClick={() => void handleReanalyze()}>
                    <MerkenIcon name={reanalyzing ? 'progress_activity' : 'camera_alt'} size={18} className={reanalyzing ? 'animate-spin' : undefined} />
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
                  <MerkenIcon name="autorenew" size={16} />
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
            path={collectionId ? ['フォルダ', '構造解析'] : ['ノート', '構造解析']}
          />

          <div className="screenpad no-sb pb-[120px]">
            <div className="mb-2 flex items-center gap-2 text-[10px] text-muted uppercase tracking-[.14em] font-semibold" style={{ fontFamily: '"Inter Tight"' }}>
              <span>英文</span>
              <span className="h-px flex-1 bg-rule" />
              <span>句をタップで折りたたみ</span>
            </div>

            <div className="border border-bd bg-white p-4" style={{ borderRadius: 3 }}>
              {document.parseTree.length === 0 ? (
                <div className="font-sans text-[16px] leading-[1.95]">{document.normalizedText}</div>
              ) : (
                <div className="font-sans leading-[1.95]">
                  <StructureTreeNode node={treeRoot} variant="swiss" />
                </div>
              )}
            </div>

            <div className="mt-5">
              <div className="mb-2 text-[10px] text-muted uppercase tracking-[.14em] font-semibold" style={{ fontFamily: '"Inter Tight"' }}>
                解説
              </div>
              <div className="space-y-2">
                {(document.analysisSummary.notes.length > 0
                  ? document.analysisSummary.notes
                  : [{ label: 'OVERVIEW', body: document.analysisSummary.overview || 'まだ解説がありません。' }]
                ).map((note, index) => (
                  <div
                    key={`${note.label}-${index}`}
                    className="a-fadeup flex gap-3 border border-bd p-3"
                    style={{ animationDelay: `${index * 50}ms`, borderRadius: 3 }}
                  >
                    <div className="w-10 shrink-0 text-[10px] font-bold uppercase tracking-[.14em] text-ink" style={{ fontFamily: '"Inter Tight"' }}>
                      {note.shortLabel || note.label}
                    </div>
                    <div className="flex-1 text-[12.5px] leading-relaxed">{note.body}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center gap-2 text-[10px] text-muted uppercase tracking-[.14em] font-semibold" style={{ fontFamily: '"Inter Tight"' }}>
                <span>この英文に登場する単語</span>
                <span className="h-px flex-1 bg-rule" />
              </div>
              <div className="flex flex-wrap gap-1.5">
                {document.mentionedTerms.length === 0 ? (
                  <span className="text-[12px] text-muted">重要語句はまだ抽出されていません。</span>
                ) : (
                  document.mentionedTerms.map((term, index) => (
                    <span
                      key={`${term}-${index}`}
                      className={cn('hl text-[12.5px]', /\s/.test(term) && 'hl-idiom')}
                    >
                      {term}
                    </span>
                  ))
                )}
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
