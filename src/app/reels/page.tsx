'use client';

import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks';
import { useReelFeed } from '@/hooks/use-reel-feed';
import { getRepository } from '@/lib/db';
import { invalidateHomeCache } from '@/lib/home-cache';
import { triggerHaptic } from '@/lib/haptics';
import { useToast } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import type { ReelBook } from '@/lib/reels/types';
import type { VocabularyType } from '@/types';
import { ReelFeed } from '@/components/reel/ReelFeed';
import {
  ReelEmptyState,
  ReelErrorState,
  ReelSkeleton,
} from '@/components/reel/ReelStatusCards';

type ImportWordPayload = {
  english: string;
  japanese: string;
  pronunciation?: string;
  exampleSentence?: string;
  exampleSentenceJa?: string;
  partOfSpeechTags?: string[];
  vocabularyType?: string;
  distractors: string[];
};

function normalizeVocabularyType(value: string | undefined): VocabularyType | undefined {
  return value === 'active' || value === 'passive' ? value : undefined;
}

export default function ReelsPage() {
  const router = useRouter();
  const { user, subscription, isPro, loading: authLoading } = useAuth();
  const { showToast } = useToast();
  const {
    items,
    status,
    usage,
    limitReached,
    hasMore,
    loadMore,
    retry,
    likeItem,
    markBookImported,
  } = useReelFeed();
  const [importingBookId, setImportingBookId] = useState<string | null>(null);

  const subscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(
    () => getRepository(subscriptionStatus, wasPro),
    [subscriptionStatus, wasPro],
  );

  const handleImport = useCallback(
    async (book: ReelBook) => {
      if (!user) {
        router.push('/login?redirect=/reels');
        return;
      }
      if (!isPro) {
        showToast({ message: '単語帳のインポートはProプラン限定です。', type: 'warning' });
        router.push('/subscription');
        return;
      }
      if (importingBookId) return;

      const confirmed = window.confirm(
        `「${book.title}」${book.wordCount > 0 ? `（${book.wordCount}語）` : ''}を自分の単語帳に追加しますか？`,
      );
      if (!confirmed) return;

      setImportingBookId(book.id);
      try {
        const bookKey = book.type === 'shared' ? `s:${book.shareId}` : `o:${book.officialSlug}`;
        const response = await fetch(
          `/api/reels/books/${encodeURIComponent(bookKey)}/words`,
          { cache: 'no-store' },
        );
        const payload = (await response.json()) as {
          success: boolean;
          error?: string;
          words?: ImportWordPayload[];
        };
        if (!response.ok || !payload.success || !payload.words) {
          throw new Error(payload.error || 'import_fetch_failed');
        }
        if (payload.words.length === 0) {
          showToast({ message: 'この単語帳には単語がありません。', type: 'warning' });
          return;
        }

        const newProject = await repository.createProject({
          userId: user.id,
          title: book.title,
          iconImage: book.iconImage ?? undefined,
          ...(book.type === 'shared' && book.shareId
            ? { importedFromShareId: book.shareId }
            : {}),
          ...(book.type === 'official' && book.officialSlug
            ? { importedFromOfficialSlug: book.officialSlug }
            : {}),
        });

        await repository.createWords(
          payload.words.map((word) => ({
            projectId: newProject.id,
            english: word.english,
            japanese: word.japanese,
            distractors: word.distractors ?? [],
            pronunciation: word.pronunciation,
            exampleSentence: word.exampleSentence,
            exampleSentenceJa: word.exampleSentenceJa,
            partOfSpeechTags: word.partOfSpeechTags,
            vocabularyType: normalizeVocabularyType(word.vocabularyType),
          })),
        );

        invalidateHomeCache();
        markBookImported(book.id);
        triggerHaptic();
        showToast({ message: `${payload.words.length}語を追加しました`, type: 'success' });
      } catch (error) {
        console.error('Failed to import reel book:', error);
        showToast({ message: 'インポートに失敗しました', type: 'error' });
      } finally {
        setImportingBookId(null);
      }
    },
    [user, isPro, importingBookId, repository, router, showToast, markBookImported],
  );

  if (!authLoading && !user) {
    router.replace('/login?redirect=/reels');
    return null;
  }

  const remainingLabel =
    usage && usage.limit !== null ? `残り${usage.remaining ?? 0}枚` : null;

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-[var(--color-background)]">
      {/* Top bar */}
      <div
        className="flex flex-shrink-0 items-center justify-between px-3 pb-2"
        style={{ paddingTop: 'max(8px, calc(env(safe-area-inset-top) + 8px))' }}
      >
        <button
          type="button"
          aria-label="戻る"
          onClick={() => router.back()}
          className="flex h-10 w-10 items-center justify-center rounded-full text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-surface-secondary)]"
        >
          <Icon name="arrow_back_ios_new" size={20} />
        </button>
        <h1 className="font-display text-base font-bold text-[var(--color-foreground)]">リール</h1>
        <div className="flex h-10 min-w-10 items-center justify-end">
          {remainingLabel && (
            <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-secondary)] px-2.5 py-1 text-xs font-semibold text-[var(--color-secondary-text)]">
              {remainingLabel}
            </span>
          )}
        </div>
      </div>

      {/* Feed area: full-bleed on mobile, centered column on desktop */}
      <div
        className="min-h-0 flex-1 lg:flex lg:justify-center"
        style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
      >
        <div className="h-full w-full lg:max-w-[420px] lg:rounded-[var(--solid-radius)] lg:border-2 lg:border-[var(--solid-ink)] lg:bg-[var(--color-surface)] lg:overflow-hidden">
          {status === 'loading' && items.length === 0 ? (
            <ReelSkeleton />
          ) : status === 'error' && items.length === 0 ? (
            <ReelErrorState onRetry={retry} />
          ) : items.length === 0 && limitReached ? (
            <ReelFeed
              items={[]}
              hasMore={false}
              limitReached
              usageLimit={usage?.limit ?? null}
              importingBookId={null}
              onLoadMore={() => {}}
              onLike={() => {}}
              onImport={() => {}}
            />
          ) : items.length === 0 ? (
            <ReelEmptyState />
          ) : (
            <ReelFeed
              items={items}
              hasMore={hasMore}
              limitReached={limitReached}
              usageLimit={usage?.limit ?? null}
              importingBookId={importingBookId}
              onLoadMore={loadMore}
              onLike={(item) => {
                triggerHaptic();
                void likeItem(item);
              }}
              onImport={(book) => void handleImport(book)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
