'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { DesktopSharedDetailView } from '@/components/desktop/DesktopSharedDetail';
import { TranslationDisplay } from '@/components/word/TranslationDisplay';
import { Icon } from '@/components/ui/Icon';
import { SolidButton, SolidPanel } from '@/components/redesign/SolidPage';
import { useRewardedDownloadAd } from '@/components/ads/useRewardedDownloadAd';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { isBillingEnabled } from '@/lib/billing/feature';
import { getRepository } from '@/lib/db';
import { invalidateHomeCache } from '@/lib/home-cache';
import { getPartOfSpeechLabel } from '@/lib/part-of-speech-labels';
import { saveSharedWordbookTags } from '@/lib/shared-projects/client';
import type { SharedProjectPreviewPayload } from '@/lib/shared-projects/types';
import type { Project, Word } from '@/types';
import { formatSharedTag, parseSharedTagsInput } from '../../../../shared/shared-tags';

const SHARE_PREVIEW_CLEAR_WORD_COUNT = 5;

type SharedProjectPreviewResponse =
  | ({ success: true } & SharedProjectPreviewPayload)
  | { success: false; error?: string };

const BLURRED_PREVIEW_ENGLISH = [
  'anchor',
  'breeze',
  'canvas',
  'drift',
  'echo',
  'fable',
  'glimpse',
  'harbor',
  'ivory',
  'jigsaw',
  'kindle',
  'lantern',
  'meadow',
  'notion',
  'orbit',
  'parcel',
  'quartz',
  'ripple',
  'summit',
  'thrive',
  'uplift',
  'velvet',
  'willow',
  'zenith',
] as const;

const BLURRED_PREVIEW_JAPANESE = [
  '手がかり',
  '余韻',
  '輪郭',
  '記憶',
  '予感',
  '視点',
  '響き',
  '断片',
  '余白',
  '気配',
  '流れ',
  '光景',
] as const;

const BLURRED_PREVIEW_POS = ['noun', 'verb', 'adjective', 'adverb'] as const;

function randomItem<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function createBlurredPreviewWords(projectId: string, count: number): Word[] {
  const createdAt = new Date().toISOString();
  return Array.from({ length: count }, (_, index) => ({
    id: `blurred-preview-${projectId}-${index}-${Math.random().toString(36).slice(2)}`,
    projectId,
    english: randomItem(BLURRED_PREVIEW_ENGLISH),
    japanese: randomItem(BLURRED_PREVIEW_JAPANESE),
    vocabularyType: randomItem(['active', 'passive'] as const),
    distractors: [],
    status: 'new',
    createdAt,
    easeFactor: 2.5,
    intervalDays: 0,
    repetition: 0,
    isFavorite: false,
    partOfSpeechTags: [randomItem(BLURRED_PREVIEW_POS)],
  }));
}

async function fetchSharedProjectPreview(shareId: string): Promise<SharedProjectPreviewPayload | null> {
  const response = await fetch(
    `/api/shared-projects/share/${encodeURIComponent(shareId)}?limit=${SHARE_PREVIEW_CLEAR_WORD_COUNT}`,
    { cache: 'no-store' },
  );
  const payload = await response.json().catch(() => null) as SharedProjectPreviewResponse | null;

  if (response.status === 404) {
    return null;
  }
  if (!response.ok || !payload || payload.success !== true) {
    const message = payload && 'error' in payload ? payload.error : undefined;
    throw new Error(message || 'shared_project_preview_failed');
  }

  return payload;
}

export default function SharedDetailPage() {
  const router = useRouter();
  const params = useParams();
  const shareId = params.shareId as string;
  const { user, subscription, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const billingEnabled = isBillingEnabled();
  const {
    isConfigured: rewardedDownloadConfigured,
    isPreparing: preparingRewardedDownloadAd,
    showRewardedDownloadAd,
  } = useRewardedDownloadAd();

  const [project, setProject] = useState<Project | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [ownerUsername, setOwnerUsername] = useState<string | null>(null);
  const [ownerAccountId, setOwnerAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedWordIds, setSelectedWordIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importedProjectId, setImportedProjectId] = useState<string | null>(null);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [totalWordCount, setTotalWordCount] = useState(0);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [ownerActionBusy, setOwnerActionBusy] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [tagsDraft, setTagsDraft] = useState('');
  const [tagsSaving, setTagsSaving] = useState(false);

  const subscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const isOwner = Boolean(user && project && project.userId === user.id);
  // Shared wordbooks are open to all logged-in users (free included); only
  // logged-out visitors get the limited blurred preview.
  const isPreviewLocked = !user;

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const previewData = await fetchSharedProjectPreview(shareId);
        if (!previewData) {
          if (!cancelled) setError('この単語帳は存在しないか、共有が解除されています');
          return;
        }

        if (cancelled) return;
        setProject(previewData.project);
        setWords(previewData.words);
        setTotalWordCount(previewData.totalWordCount);
        setLikeCount(previewData.likeCount);
        setOwnerUsername(previewData.ownerUsername);
        setOwnerAccountId(previewData.ownerAccountId);
      } catch (loadError) {
        console.error('Failed to load shared project:', loadError);
        if (!cancelled) setError('単語帳の読み込みに失敗しました');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [shareId]);

  useEffect(() => {
    if (authLoading || !user || !project?.id) return;

    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(
          `/api/shared-projects/share/${encodeURIComponent(shareId)}/words`,
          { cache: 'no-store' },
        );
        if (!response.ok) return;
        const payload = await response.json().catch(() => null) as { success?: boolean; words?: Word[] } | null;
        if (cancelled || !payload?.success || !Array.isArray(payload.words)) return;
        setWords(payload.words);
        setTotalWordCount(payload.words.length);
      } catch (loadError) {
        console.error('Failed to load full shared project words:', loadError);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, user, project?.id, shareId]);

  useEffect(() => {
    if (!project || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/shared-projects/share/${encodeURIComponent(shareId)}/like`);
        if (response.ok && !cancelled) {
          const data = await response.json();
          setLiked(Boolean(data.liked));
          setLikeCount(data.likeCount ?? 0);
        }
      } catch {
        // Like status is optional.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project, user, shareId]);

  const selectedWords = useMemo(
    () => words.filter((word) => selectedWordIds.has(word.id)),
    [selectedWordIds, words],
  );
  const importTargetWords = user ? (selectMode ? selectedWords : words) : [];
  const importBusy = importing || preparingRewardedDownloadAd;
  const ownerLabel = ownerAccountId ? `@${ownerAccountId}` : ownerUsername ? `@${ownerUsername}` : '共有ユーザー';
  const loginRedirectHref = `/login?redirect=${encodeURIComponent(`/share/${shareId}`)}`;
  const lockedPreviewWordCount = isPreviewLocked
    ? Math.max(0, totalWordCount - Math.min(SHARE_PREVIEW_CLEAR_WORD_COUNT, totalWordCount))
    : 0;
  const displayWords = useMemo(() => {
    if (!isPreviewLocked || !project?.id) return words;
    const placeholderCount = Math.max(0, totalWordCount - words.length);
    if (placeholderCount === 0) return words;
    return [
      ...words,
      ...createBlurredPreviewWords(project.id, placeholderCount),
    ];
  }, [isPreviewLocked, project?.id, totalWordCount, words]);

  const performImport = async (targetWords: Word[]) => {
    if (!user || !project || targetWords.length === 0) return;

    setImporting(true);
    try {
      const repo = getRepository(subscriptionStatus, wasPro);
      const newProject = await repo.createProject({
        title: project.title,
        userId: user.id,
        importedFromShareId: shareId,
        iconImage: project.iconImage,
        description: project.description,
      });

      await repo.createWords(
        targetWords.map((word) => ({
          projectId: newProject.id,
          english: word.english,
          japanese: word.japanese,
          translations: word.translations,
          distractors: word.distractors ?? [],
          exampleSentence: word.exampleSentence ?? undefined,
          exampleSentenceJa: word.exampleSentenceJa ?? undefined,
          pronunciation: word.pronunciation ?? undefined,
          partOfSpeechTags: word.partOfSpeechTags ?? undefined,
          vocabularyType: word.vocabularyType ?? undefined,
          wordOrderQuiz: word.wordOrderQuiz ?? undefined,
        })),
      );

      setImportedProjectId(newProject.id);
      setSelectMode(false);
      setSelectedWordIds(new Set());
      invalidateHomeCache();
      showToast({ message: `${targetWords.length}語を追加しました`, type: 'success' });

      // Best-effort: let the original owner know their wordbook was imported.
      // Failure here must not affect the import itself.
      fetch(`/api/shared-projects/share/${encodeURIComponent(shareId)}/imported`, { method: 'POST' })
        .catch(() => { /* ignore */ });
    } catch (importError) {
      console.error('Failed to import shared project:', importError);
      showToast({ message: 'インポートに失敗しました', type: 'error' });
    } finally {
      setImporting(false);
    }
  };

  const handleImport = async () => {
    if (!user) {
      router.push(`/login?redirect=/share/${shareId}`);
      return;
    }
    // Downgraded (ex-Pro) accounts get the read-only remote repository, so
    // writes would fail — guide them back to Pro instead.
    if (wasPro) {
      showToast({ message: '解約後は読み取り専用のため、インポートにはProプランへの再登録が必要です。', type: 'warning' });
      if (billingEnabled) {
        router.push('/subscription');
      }
      return;
    }
    if (!project || importTargetWords.length === 0 || importBusy) return;

    if (!rewardedDownloadConfigured) {
      await performImport(importTargetWords);
      return;
    }

    const outcome = await showRewardedDownloadAd();
    if (outcome === 'granted' || outcome === 'unavailable') {
      await performImport(importTargetWords);
      return;
    }

    showToast({ message: '動画広告を最後まで視聴すると追加できます', type: 'warning' });
  };

  const handleToggleLike = async () => {
    if (!user || !project) return;
    const nextLiked = !liked;
    setLiked(nextLiked);
    setLikeCount((prev) => Math.max(0, prev + (nextLiked ? 1 : -1)));

    try {
      const response = await fetch(`/api/shared-projects/share/${encodeURIComponent(shareId)}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ liked: nextLiked }),
      });
      if (!response.ok) throw new Error('like_failed');
      const data = await response.json();
      setLikeCount(data.likeCount ?? 0);
    } catch {
      setLiked(!nextLiked);
      setLikeCount((prev) => Math.max(0, prev + (nextLiked ? -1 : 1)));
      showToast({ message: 'いいねに失敗しました', type: 'error' });
    }
  };

  const handleToggleSelect = (wordId: string) => {
    if (!selectMode) return;
    setSelectedWordIds((prev) => {
      const next = new Set(prev);
      if (next.has(wordId)) next.delete(wordId);
      else next.add(wordId);
      return next;
    });
  };

  const handleOpenRename = () => {
    setRenameDraft(project?.title ?? '');
    setRenameOpen(true);
  };

  const handleRename = async () => {
    if (!project || ownerActionBusy) return;
    const nextTitle = renameDraft.trim();
    if (!nextTitle || nextTitle === project.title) {
      setRenameOpen(false);
      return;
    }
    setOwnerActionBusy(true);
    try {
      const response = await fetch(`/api/shared-projects/share-wordbook/${encodeURIComponent(project.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: nextTitle }),
      });
      const payload = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'rename_failed');
      }
      setProject((current) => (current ? { ...current, title: nextTitle } : current));
      setRenameOpen(false);
      showToast({ message: '名前を変更しました', type: 'success' });
    } catch (renameError) {
      console.error('Failed to rename shared wordbook:', renameError);
      showToast({ message: '名前の変更に失敗しました', type: 'error' });
    } finally {
      setOwnerActionBusy(false);
    }
  };

  const handleOpenTags = () => {
    setTagsDraft((project?.sharedTags ?? []).map(formatSharedTag).join(', '));
    setTagsOpen(true);
  };

  const handleSaveTags = async () => {
    if (!project || tagsSaving) return;
    setTagsSaving(true);
    try {
      const nextTags = parseSharedTagsInput(tagsDraft);
      const savedTags = await saveSharedWordbookTags(project.id, nextTags);
      setProject((current) => (current ? { ...current, sharedTags: savedTags } : current));
      setTagsOpen(false);
      showToast({ message: 'タグを保存しました', type: 'success' });
    } catch (tagsError) {
      console.error('Failed to update shared wordbook tags:', tagsError);
      showToast({ message: 'タグの保存に失敗しました', type: 'error' });
    } finally {
      setTagsSaving(false);
    }
  };

  const handleUnpublish = async () => {
    if (!project || ownerActionBusy) return;
    if (typeof window !== 'undefined' && !window.confirm('この単語帳の公開を停止しますか？共有ページから削除されます。')) {
      return;
    }
    setOwnerActionBusy(true);
    try {
      const response = await fetch(`/api/shared-projects/share-wordbook/${encodeURIComponent(project.id)}`, {
        method: 'DELETE',
      });
      const payload = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'unpublish_failed');
      }
      showToast({ message: '公開を停止しました', type: 'success' });
      router.push('/shared');
    } catch (unpublishError) {
      console.error('Failed to unpublish shared wordbook:', unpublishError);
      showToast({ message: '公開の停止に失敗しました', type: 'error' });
      setOwnerActionBusy(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)] text-[var(--color-muted)]">
        <Icon name="progress_activity" size={20} className="animate-spin" />
        <span className="ml-2 text-sm">読み込み中...</span>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-background)] px-6 text-center">
        <h1 className="font-display text-xl font-bold text-[var(--solid-ink)]">単語帳が見つかりません</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">{error || '一覧から選び直してください。'}</p>
        <Link href="/shared" className="solid-link-primary mt-5">
          共有一覧へ戻る
        </Link>
      </div>
    );
  }

  return (
    <>
      <DesktopSharedDetailView
        project={project}
        words={displayWords}
        ownerLabel={ownerLabel}
        selectMode={selectMode}
        selectedWordIds={selectedWordIds}
        likeCount={likeCount}
        liked={liked}
        importing={importBusy}
        importedProjectId={importedProjectId}
        isPreviewLocked={isPreviewLocked}
        totalWordCount={totalWordCount}
        previewClearWordCount={SHARE_PREVIEW_CLEAR_WORD_COUNT}
        lockedCtaHref={loginRedirectHref}
        onToggleLike={() => void handleToggleLike()}
        onToggleSelectMode={() => {
          setSelectMode((current) => !current);
          setSelectedWordIds(new Set());
        }}
        onToggleWord={handleToggleSelect}
        onImport={() => void handleImport()}
        onClearSelection={() => setSelectedWordIds(new Set())}
      />
      <div className="relative flex min-h-screen flex-col bg-[var(--color-background)] pb-[160px] font-[var(--font-body)] lg:hidden">
      <div className="flex items-center justify-between px-3.5 pb-2 pt-2">
        <SharedHeaderBtn onClick={() => router.back()} aria-label="戻る">
          <Icon name="chevron_left" size={16} />
        </SharedHeaderBtn>
        <div className="flex gap-2">
          <SharedHeaderBtn
            onClick={handleToggleLike}
            aria-label={liked ? 'いいねを取り消す' : 'いいね'}
          >
            <div className="flex items-center gap-1">
              <Icon name="thumb_up" size={14} filled={liked} />
              {likeCount > 0 && <span className="font-mono text-[9px] font-bold">{likeCount}</span>}
            </div>
          </SharedHeaderBtn>
        </div>
      </div>

      <div className="px-[18px] pb-3.5 pt-1">
        <SolidPanel
          className="!rounded-[16px] overflow-hidden"
          faceClassName="!p-4 relative [background:linear-gradient(135deg,oklch(0.94_0.04_14),#fff)]"
        >
          <div className="flex items-center gap-1.5 text-[var(--color-muted)]">
            <Icon name="public" size={13} />
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.08em]">SHARED</span>
          </div>

          <h1 className="mt-2 break-all font-display text-[22px] font-extrabold leading-[1.2] tracking-[-0.02em] text-[var(--solid-ink)]">
            {project.title}
          </h1>

          <div className="mt-2 flex items-center gap-1.5">
            <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded-full border border-[var(--solid-ink)] bg-[var(--color-surface-secondary)] font-mono text-[10px] font-bold text-[var(--solid-ink)]">
              {ownerLabel.charAt(0).replace('@', '').toUpperCase()}
            </span>
            <span className="font-mono text-[11px] font-semibold text-[var(--color-muted)]">{ownerLabel}</span>
            <span className="text-[11px] text-[var(--color-muted)]">·</span>
            <span className="font-mono text-[10px] text-[var(--color-muted)]">
              作成 {new Date(project.createdAt).toLocaleDateString('ja-JP')}
            </span>
          </div>

          {project.description && (
            <p className="mt-2.5 text-xs leading-[1.55] text-[var(--color-muted)]">{project.description}</p>
          )}

          {((project.sharedTags?.length ?? 0) > 0 || isOwner) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {(project.sharedTags ?? []).map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-white px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--color-muted)]"
                >
                  {formatSharedTag(tag)}
                </span>
              ))}
              {isOwner && (
                <button
                  type="button"
                  onClick={handleOpenTags}
                  className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-[var(--color-border)] bg-white px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--color-muted)]"
                >
                  <Icon name="edit" size={11} />
                  {(project.sharedTags?.length ?? 0) > 0 ? 'タグを編集' : 'タグを追加'}
                </button>
              )}
            </div>
          )}

          <div className="mt-3 flex gap-2.5 border-t border-dashed border-[var(--color-border)] pt-3">
            <Stat label="単語数" value={totalWordCount.toLocaleString()} />
            <Stat
              label="いいね"
              value={likeCount.toLocaleString()}
              iconBefore={<Icon name="thumb_up" size={11} filled={liked} className="text-[var(--color-warning)]" />}
            />
          </div>
        </SolidPanel>
      </div>

      <div className="flex items-center justify-between px-[18px] pb-2.5">
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
          {isPreviewLocked ? `単語プレビュー · ${SHARE_PREVIEW_CLEAR_WORD_COUNT}語まで表示` : `単語プレビュー · 全 ${totalWordCount} 語`}
        </div>
      </div>

      <div className="flex flex-col gap-1 px-3.5 pb-[130px]">
        {displayWords.map((word, i) => {
          const selected = selectedWordIds.has(word.id);
          const locked = isPreviewLocked && i >= SHARE_PREVIEW_CLEAR_WORD_COUNT;
          const previewTextClass = locked ? 'select-none blur-[3.5px]' : '';
          return (
            <button
              key={word.id}
              type="button"
              onClick={() => {
                if (!locked) handleToggleSelect(word.id);
              }}
              disabled={locked}
              className="flex items-center gap-2.5 rounded-lg border-2 bg-[var(--color-surface)] px-3 py-2.5 text-left"
              style={{
                borderColor: selected ? 'var(--solid-ink)' : 'var(--color-border)',
                opacity: locked ? 0.82 : 1,
              }}
            >
              <span className="min-w-[16px] font-mono text-[9px] font-bold tabular-nums text-[var(--color-muted)]">
                {selectMode ? (selected ? '✓' : String(i + 1).padStart(2, '0')) : String(i + 1).padStart(2, '0')}
              </span>
              <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-1.5">
                <span className={`font-display text-[14px] font-bold text-[var(--solid-ink)] ${previewTextClass}`}>{word.english}</span>
                {word.partOfSpeechTags?.[0] && (
                  <span className={`text-[10px] font-bold text-[var(--color-muted)] ${previewTextClass}`}>{getPartOfSpeechLabel(word.partOfSpeechTags[0])}</span>
                )}
                <span className={`ml-1 truncate text-[11px] text-[var(--color-muted)] ${previewTextClass}`}>
                  <TranslationDisplay word={word} compact />
                </span>
              </div>
              {locked && <Icon name="lock" size={13} className="text-[var(--color-muted)]" />}
            </button>
          );
        })}
        {isPreviewLocked && lockedPreviewWordCount > 0 && (
          <div className="px-2 py-3 text-center font-mono text-[10px] font-semibold text-[var(--color-muted)]">
            {`残り ${lockedPreviewWordCount.toLocaleString()} 語はログインすると表示できます`}
          </div>
        )}
      </div>

      <div
        className="fixed bottom-0 left-0 right-0 z-30 px-4 pt-3"
        style={{ background: 'linear-gradient(to top, var(--color-background) 70%, transparent)', paddingBottom: 'max(1.625rem, env(safe-area-inset-bottom))' }}
      >
        {isOwner ? (
          <>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={handleOpenRename}
                disabled={ownerActionBusy}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-[12px] border-2 border-[var(--solid-ink)] bg-white px-4 py-3 text-[14px] font-extrabold text-[var(--solid-ink)] disabled:opacity-50"
              >
                <Icon name="edit" size={16} />
                名前を変更
              </button>
              <button
                type="button"
                onClick={() => void handleUnpublish()}
                disabled={ownerActionBusy}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-[12px] border-2 border-[var(--color-error)] bg-white px-4 py-3 text-[14px] font-extrabold text-[var(--color-error)] disabled:opacity-50"
              >
                <Icon name={ownerActionBusy ? 'progress_activity' : 'public_off'} size={16} className={ownerActionBusy ? 'animate-spin' : undefined} />
                公開を停止
              </button>
            </div>
            <p className="mt-2 text-center font-mono text-[10px] font-semibold text-[var(--color-muted)]">
              あなたが共有している単語帳です
            </p>
          </>
        ) : isPreviewLocked ? (
          <SolidButton href={loginRedirectHref} variant="inverse" size="lg" iconLeft="login" className="w-full" faceClassName="!w-full !justify-center">
            ログインして単語を見る
          </SolidButton>
        ) : importedProjectId ? (
          <SolidButton href={`/project/${importedProjectId}`} variant="inverse" size="lg" iconLeft="check_circle" className="w-full" faceClassName="!w-full !justify-center">
            追加済み — 単語帳を開く
          </SolidButton>
        ) : (
          <SolidButton
            variant="inverse"
            size="lg"
            iconLeft={importBusy ? 'progress_activity' : 'download'}
            className="w-full"
            faceClassName="!w-full !justify-center"
            disabled={importBusy || importTargetWords.length === 0}
            onClick={() => void handleImport()}
          >
            {importBusy ? (preparingRewardedDownloadAd ? '広告を準備中...' : '追加中...') : `${importTargetWords.length}語をインポート`}
          </SolidButton>
        )}
        {!isOwner && (
          <p className="mt-2 text-center font-mono text-[10px] font-semibold text-[var(--color-muted)]">
            {isPreviewLocked ? '一部だけプレビューしています' : 'オリジナルは変更されません'}
          </p>
        )}
      </div>

      {renameOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center px-6" style={{ fontFamily: 'var(--font-body)' }}>
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="閉じる"
            onClick={() => setRenameOpen(false)}
            style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
          />
          <div
            className="relative w-full animate-fade-in-up"
            style={{
              maxWidth: 360,
              background: '#faf7f1',
              border: '2px solid var(--solid-ink)',
              borderRadius: 18,
              padding: '18px',
              boxShadow: '0 12px 32px rgba(26,26,26,0.22)',
            }}
          >
            <div className="mb-3 font-display text-[17px] font-extrabold text-[var(--solid-ink)]">名前を変更</div>
            <input
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
              maxLength={80}
              autoFocus
              className="mb-3 w-full rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2.5 text-[14px] font-bold text-[var(--solid-ink)] outline-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRenameOpen(false)}
                className="inline-flex h-[44px] flex-1 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-white text-[13px] font-extrabold text-[var(--solid-ink)]"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => void handleRename()}
                disabled={ownerActionBusy || !renameDraft.trim()}
                className="inline-flex h-[44px] flex-1 items-center justify-center gap-1.5 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] text-[13px] font-extrabold text-white disabled:opacity-45"
              >
                <Icon name={ownerActionBusy ? 'progress_activity' : 'check'} size={15} className={ownerActionBusy ? 'animate-spin' : undefined} />
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {tagsOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center px-6" style={{ fontFamily: 'var(--font-body)' }}>
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="閉じる"
            onClick={() => setTagsOpen(false)}
            style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
          />
          <div
            className="relative w-full animate-fade-in-up"
            style={{
              maxWidth: 360,
              background: '#faf7f1',
              border: '2px solid var(--solid-ink)',
              borderRadius: 18,
              padding: '18px',
              boxShadow: '0 12px 32px rgba(26,26,26,0.22)',
            }}
          >
            <div className="mb-3 font-display text-[17px] font-extrabold text-[var(--solid-ink)]">タグを編集</div>
            <input
              value={tagsDraft}
              onChange={(event) => setTagsDraft(event.target.value)}
              placeholder="例: #TOEIC, #熟語, #高校英語"
              autoFocus
              className="mb-3 w-full rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2.5 text-[14px] font-bold text-[var(--solid-ink)] outline-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setTagsOpen(false)}
                className="inline-flex h-[44px] flex-1 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-white text-[13px] font-extrabold text-[var(--solid-ink)]"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => void handleSaveTags()}
                disabled={tagsSaving}
                className="inline-flex h-[44px] flex-1 items-center justify-center gap-1.5 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] text-[13px] font-extrabold text-white disabled:opacity-45"
              >
                <Icon name={tagsSaving ? 'progress_activity' : 'check'} size={15} className={tagsSaving ? 'animate-spin' : undefined} />
                保存
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
}

function SharedHeaderBtn({
  children,
  onClick,
  'aria-label': ariaLabel,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  'aria-label'?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="flex h-[38px] min-w-[38px] items-center justify-center rounded-[19px] border-2 border-[var(--solid-ink)] bg-white px-2 text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
    >
      {children}
    </button>
  );
}

function Stat({
  label,
  value,
  suffix,
  iconBefore,
}: {
  label: string;
  value: string | number;
  suffix?: string;
  iconBefore?: React.ReactNode;
}) {
  return (
    <div className="flex-1">
      <div className="font-mono text-[9px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
        {label}
      </div>
      <div className="mt-0.5 flex items-baseline gap-1">
        {iconBefore}
        <span className="font-display text-[18px] font-extrabold tracking-[-0.01em] tabular-nums text-[var(--solid-ink)]">
          {value}
        </span>
        {suffix && <span className="text-[11px] font-semibold text-[var(--color-muted)]">{suffix}</span>}
      </div>
    </div>
  );
}
