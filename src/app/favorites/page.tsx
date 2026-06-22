'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { DesktopFavoritesView, DesktopWrongAnswersView } from '@/components/desktop/DesktopFavorites';
import { Icon } from '@/components/ui/Icon';
import { WordDetailView } from '@/components/word/WordDetailView';
import { useAuth } from '@/hooks/use-auth';
import { isBillingEnabled } from '@/lib/billing/feature';
import { getRepository } from '@/lib/db';
import { invalidateHomeCache } from '@/lib/home-cache';
import { getFavoritesQuizStorageKey } from '@/lib/quiz/quiz-state';
import { getGuestUserId, getWrongAnswers, type WrongAnswer } from '@/lib/utils';
import { getNextVocabularyType } from '@/lib/vocabulary-type';
import type { SubscriptionStatus, Word } from '@/types';

type FavoriteWord = Word & {
  projectTitle: string;
};

type WrongAnswerRow = WrongAnswer & {
  projectTitle?: string;
};

type SortKey = 'alpha' | 'status' | 'project';

function StatusPill({ kind }: { kind: Word['status'] }) {
  const config = {
    new: { t: '未学習', bg: '#fff', fg: 'var(--color-muted)', bd: 'var(--color-border)' },
    review: { t: '学習中', bg: 'rgba(19,127,236,0.1)', fg: '#137fec', bd: '#137fec' },
    mastered: { t: '習得', bg: 'rgba(61,122,78,0.12)', fg: 'var(--color-success)', bd: 'var(--color-success)' },
  }[kind];

  return (
    <span
      className="whitespace-nowrap rounded-full px-2 py-[3px] text-[10px] font-bold leading-none"
      style={{ color: config.fg, background: config.bg, border: `1px solid ${config.bd}` }}
    >
      {config.t}
    </span>
  );
}

function FavoritesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, subscription, loading: authLoading, isPro } = useAuth();
  const billingEnabled = isBillingEnabled();
  const [favorites, setFavorites] = useState<FavoriteWord[]>([]);
  const [wrongAnswers, setWrongAnswers] = useState<WrongAnswer[]>([]);
  const [projectTitlesById, setProjectTitlesById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [activeSort, setActiveSort] = useState<SortKey>('alpha');
  const [error, setError] = useState<string | null>(null);
  const mode = searchParams.get('mode');
  const [selectedWord, setSelectedWord] = useState<FavoriteWord | null>(null);
  const [deleteWordTarget, setDeleteWordTarget] = useState<FavoriteWord | null>(null);
  const [deleteWordLoading, setDeleteWordLoading] = useState(false);

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);

  const loadFavorites = useCallback(async () => {
    if (authLoading) return;
    setLoading(true);
    setError(null);

    try {
      const userId = user ? user.id : getGuestUserId();
      const projects = await repository.getProjects(userId);
      const projectIds = projects.map((project) => project.id);
      const titleByProjectId = new Map(projects.map((project) => [project.id, project.title]));
      setProjectTitlesById(Object.fromEntries(titleByProjectId));

      const repoWithBulk = repository as typeof repository & {
        getAllWordsByProjectIds?: (ids: string[]) => Promise<Record<string, Word[]>>;
        getAllWordsByProject?: (ids: string[]) => Promise<Record<string, Word[]>>;
      };

      let wordsByProject: Record<string, Word[]> = {};
      if (projectIds.length > 0 && repoWithBulk.getAllWordsByProjectIds) {
        wordsByProject = await repoWithBulk.getAllWordsByProjectIds(projectIds);
      } else if (projectIds.length > 0 && repoWithBulk.getAllWordsByProject) {
        wordsByProject = await repoWithBulk.getAllWordsByProject(projectIds);
      } else if (projectIds.length > 0) {
        const arrays = await Promise.all(projectIds.map((projectId) => repository.getWords(projectId)));
        wordsByProject = Object.fromEntries(projectIds.map((projectId, index) => [projectId, arrays[index] ?? []]));
      }

      const nextFavorites = projectIds.flatMap((projectId) =>
        (wordsByProject[projectId] ?? [])
          .filter((word) => word.isFavorite)
          .map((word) => ({
            ...word,
            projectTitle: titleByProjectId.get(projectId) ?? '',
          })),
      );

      setFavorites(nextFavorites);
    } catch (loadError) {
      console.error('Failed to load favorites:', loadError);
      setError('保存済み単語の読み込みに失敗しました');
      setFavorites([]);
      setProjectTitlesById({});
    } finally {
      setLoading(false);
    }
  }, [authLoading, repository, user]);

  useEffect(() => {
    void loadFavorites();
  }, [loadFavorites]);

  useEffect(() => {
    setWrongAnswers(getWrongAnswers());
  }, [mode]);

  const sortedFavorites = useMemo(() => {
    const statusOrder: Record<Word['status'], number> = { review: 0, new: 1, mastered: 2 };
    return [...favorites].sort((a, b) => {
      if (activeSort === 'status') return statusOrder[a.status] - statusOrder[b.status];
      if (activeSort === 'project') return a.projectTitle.localeCompare(b.projectTitle, 'ja') || a.english.localeCompare(b.english);
      return a.english.localeCompare(b.english);
    });
  }, [activeSort, favorites]);

  const counts = useMemo(() => {
    const mastered = favorites.filter((word) => word.status === 'mastered').length;
    const review = favorites.filter((word) => word.status === 'review').length;
    const newCount = favorites.filter((word) => word.status === 'new').length;
    return { mastered, review, newCount };
  }, [favorites]);

  const handleToggleFavorite = async (word: FavoriteWord) => {
    setFavorites((prev) => prev.filter((item) => item.id !== word.id));
    if (selectedWord?.id === word.id) setSelectedWord(null);
    try {
      await repository.updateWord(word.id, { isFavorite: false });
    } catch (toggleError) {
      console.error('Failed to remove favorite:', toggleError);
      setFavorites((prev) => [...prev, word]);
    }
  };

  const handleCycleVocabularyType = async (word: FavoriteWord) => {
    const vocabularyType = getNextVocabularyType(word.vocabularyType);
    setFavorites((prev) => prev.map((item) => (
      item.id === word.id ? { ...item, vocabularyType } : item
    )));
    if (selectedWord?.id === word.id) {
      setSelectedWord({ ...selectedWord, vocabularyType });
    }
    try {
      try {
        sessionStorage.removeItem(getFavoritesQuizStorageKey(word.projectId));
        sessionStorage.removeItem(getFavoritesQuizStorageKey('all'));
      } catch {
        /* ignore */
      }
      await repository.updateWord(word.id, { vocabularyType });
      invalidateHomeCache();
    } catch (updateError) {
      console.error('Failed to update vocabulary type:', updateError);
      setFavorites((prev) => prev.map((item) => (
        item.id === word.id ? { ...item, vocabularyType: word.vocabularyType } : item
      )));
      if (selectedWord?.id === word.id) {
        setSelectedWord(word);
      }
    }
  };

  const isWrongMode = mode === 'wrong';
  const returnPath = encodeURIComponent(isWrongMode ? '/favorites?mode=wrong' : '/favorites');
  const wrongAnswersWithProjectTitles = useMemo<WrongAnswerRow[]>(
    () =>
      wrongAnswers.map((word) => ({
        ...word,
        projectTitle: word.projectId ? projectTitlesById[word.projectId] : undefined,
      })),
    [projectTitlesById, wrongAnswers],
  );

  const handleConfirmWordDelete = async () => {
    if (!deleteWordTarget || deleteWordLoading) return;
    setDeleteWordLoading(true);
    try {
      await repository.deleteWord(deleteWordTarget.id);
      setFavorites((prev) => prev.filter((w) => w.id !== deleteWordTarget.id));
      if (selectedWord?.id === deleteWordTarget.id) setSelectedWord(null);
      setDeleteWordTarget(null);
    } catch (deleteError) {
      console.error('Failed to delete word:', deleteError);
    } finally {
      setDeleteWordLoading(false);
    }
  };

  return (
    <>
      {isWrongMode ? (
        <DesktopWrongAnswersView wrongAnswers={wrongAnswersWithProjectTitles} returnPath={returnPath} />
      ) : (
        <DesktopFavoritesView
          favorites={sortedFavorites}
          loading={loading}
          error={error}
          isPro={isPro}
          returnPath={returnPath}
          onToggleFavorite={(word) => void handleToggleFavorite(word)}
          onCycleVocabularyType={(word) => void handleCycleVocabularyType(word)}
        />
      )}
      {isWrongMode ? (
        <MobileWrongAnswersView
          wrongAnswers={wrongAnswersWithProjectTitles}
          returnPath={returnPath}
          onBack={() => router.back()}
        />
      ) : (
        <div className="flex min-h-screen flex-col bg-[var(--color-background)] pt-3 font-[var(--font-body)] lg:hidden">
          <div className="flex items-center gap-2.5 px-[14px] pb-2.5 pt-2 lg:hidden">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex h-[38px] w-[38px] items-center justify-center rounded-[19px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
              aria-label="戻る"
            >
              <Icon name="chevron_left" size={18} />
            </button>
            <div className="flex-1 text-base font-bold text-[var(--solid-ink)]">
              保存済み
            </div>
          </div>

          <div className="px-[18px] pb-3.5 pt-1 lg:pt-4">
            <div>
              <div className="overflow-hidden rounded-2xl border-2 border-[var(--solid-ink)] bg-white p-4">
                <div className="pointer-events-none absolute -right-3.5 -top-4 opacity-10 text-[var(--color-accent)]">
                  <Icon name="bookmark" size={120} filled />
                </div>

                <div className="flex items-center gap-1.5 text-[var(--color-accent)]">
                  <Icon name="bookmark" size={13} filled />
                  <span className="font-mono text-[10px] font-bold tracking-[0.08em]">SAVED</span>
                </div>

                <div className="mt-2.5 flex items-baseline gap-1.5">
                  <span className="font-display text-[38px] font-extrabold leading-none tabular-nums text-[var(--solid-ink)]">
                    {favorites.length}
                  </span>
                  <span className="text-sm font-bold text-[var(--solid-ink)]">語</span>
                </div>

                <div className="mt-3 flex h-1.5 overflow-hidden rounded-sm border border-[var(--color-border)]">
                  <div style={{ flex: counts.mastered, background: 'var(--color-success)' }} />
                  <div style={{ flex: counts.review, background: '#137fec' }} />
                  <div style={{ flex: counts.newCount, background: 'rgba(26,26,26,0.15)' }} />
                </div>

                <div className="mt-2 flex gap-3 font-mono text-[10px]">
                  <span className="font-bold text-[var(--color-success)]">● 習得 {counts.mastered}</span>
                  <span className="font-bold text-[#137fec]">● 学習中 {counts.review}</span>
                  <span className="font-bold text-[var(--color-muted)]">● 未学習 {counts.newCount}</span>
                </div>

                <div className="mt-3.5 flex gap-2">
                  <ActionLink href={isPro ? `/flashcard/all?favorites=true&from=${returnPath}` : billingEnabled ? '/subscription' : '/favorites'} icon="style" label="カード" accent />
                  <ActionLink href={isPro ? `/quiz/all?favorites=1&count=10&from=${returnPath}` : billingEnabled ? '/subscription' : '/favorites'} icon="quiz" label="クイズ" />
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-1.5 overflow-x-auto px-[14px] pb-2.5">
            {([
              { k: 'alpha', label: 'ABC順' },
              { k: 'status', label: 'ステータス順' },
              { k: 'project', label: '単語帳順' },
            ] as const).map((c) => (
              <button
                key={c.k}
                type="button"
                onClick={() => setActiveSort(c.k)}
                className="shrink-0 whitespace-nowrap rounded-full px-[11px] py-1.5 text-[11px] font-bold"
                style={{
                  background: c.k === activeSort ? 'var(--solid-ink)' : '#fff',
                  color: c.k === activeSort ? '#fff' : 'var(--solid-ink)',
                  border: `1.25px solid ${c.k === activeSort ? 'var(--solid-ink)' : 'var(--color-border)'}`,
                }}
              >
                {c.label}
              </button>
            ))}
          </div>

          {error && <p className="px-[14px] pb-2 text-xs font-bold text-[var(--color-error)]">{error}</p>}

          <div className="flex flex-col gap-1.5 px-[14px] pb-[110px]">
            {loading ? (
              <div className="flex items-center justify-center py-16 text-[var(--color-muted)]">
                <Icon name="progress_activity" size={20} className="animate-spin" />
                <span className="ml-2 text-sm">読み込み中...</span>
              </div>
            ) : sortedFavorites.length === 0 ? (
              <div className="rounded-[10px] border-2 border-[var(--color-border)] bg-white px-4 py-10 text-center text-sm text-[var(--color-muted)]">
                保存済み単語はまだありません
              </div>
            ) : (
              sortedFavorites.map((word) => (
                <div
                  key={word.id}
                  className="flex items-center gap-2.5 rounded-[10px] border-2 bg-white px-3 py-[11px]"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <button
                    type="button"
                    onClick={() => setSelectedWord(word)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex items-baseline gap-1.5">
                      <span className="truncate font-display text-[15px] font-bold text-[var(--solid-ink)]">
                        {word.english}
                      </span>
                      {word.partOfSpeechTags?.[0] && (
                        <span className="font-mono text-[9px] text-[var(--color-muted)]">{word.partOfSpeechTags[0]}</span>
                      )}
                    </div>
                    <div className="mt-px truncate text-[11px] text-[var(--color-muted)]">{word.japanese}</div>
                    <div className="mt-[3px] truncate font-mono text-[9px] text-[var(--color-muted)]">{word.projectTitle}</div>
                  </button>
                  <StatusPill kind={word.status} />
                  <button type="button" onClick={() => void handleToggleFavorite(word)} className="inline-flex text-[var(--color-accent)]" aria-label="保存済みから外す">
                    <Icon name="bookmark" size={15} filled />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}
      {selectedWord && (
        <div className="fixed inset-0 z-[80]" style={{ fontFamily: 'var(--font-body)' }}>
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
            onClick={() => setSelectedWord(null)}
          />
          <div className="absolute inset-0 flex items-center justify-center px-4 py-10">
            <div
              className="w-full overflow-y-auto"
              style={{
                maxWidth: 480,
                maxHeight: '80dvh',
                background: '#faf7f1',
                border: '2px solid var(--solid-ink)',
                borderRadius: 20,
                boxShadow: '4px 5px 0 var(--solid-ink)',
              }}
            >
              <WordDetailView
                wordId={selectedWord.id}
                variant="modal"
                initialWord={selectedWord}
                onClose={() => setSelectedWord(null)}
                onWordUpdated={(updated) => {
                  setFavorites((prev) =>
                    prev.map((w) =>
                      w.id === updated.id
                        ? { ...updated, projectTitle: prev.find((x) => x.id === updated.id)?.projectTitle ?? '' }
                        : w,
                    ),
                  );
                  setSelectedWord((current) => (current ? { ...updated, projectTitle: current.projectTitle } : null));
                }}
                onDelete={(wordId) => setDeleteWordTarget(favorites.find((w) => w.id === wordId) ?? null)}
              />
            </div>
          </div>
        </div>
      )}

      {deleteWordTarget && (
        <div className="fixed inset-0 z-[100]" style={{ fontFamily: 'var(--font-body)' }}>
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="閉じる"
            onClick={() => {
              if (!deleteWordLoading) setDeleteWordTarget(null);
            }}
            style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
          />
          <div className="absolute inset-0 flex items-center justify-center px-5">
            <div
              className="w-full max-w-[360px] rounded-[16px] border-2 border-[var(--solid-ink)] bg-white p-5"
              style={{ boxShadow: '3px 4px 0 var(--solid-ink)' }}
            >
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">DELETE</div>
              <h2 className="mt-1 font-display text-[18px] font-extrabold text-[var(--solid-ink)]">単語を削除しますか？</h2>
              <p className="mt-2 text-[11px] leading-[1.5] text-[var(--color-muted)]">
                {deleteWordTarget.english} が削除されます。この操作は取り消せません。
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!deleteWordLoading) setDeleteWordTarget(null);
                  }}
                  disabled={deleteWordLoading}
                  className="flex-1 rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2.5 text-[13px] font-bold text-[var(--solid-ink)] disabled:opacity-50"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirmWordDelete()}
                  disabled={deleteWordLoading}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border-2 border-[var(--solid-ink)] px-3 py-2.5 text-[13px] font-bold text-white disabled:opacity-60"
                  style={{ background: 'var(--color-error, #cc4d59)' }}
                >
                  {deleteWordLoading && <Icon name="progress_activity" size={14} className="animate-spin" />}
                  削除する
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function FavoritesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--color-background)]" />}>
      <FavoritesPageContent />
    </Suspense>
  );
}

function MobileWrongAnswersView({
  wrongAnswers,
  returnPath,
  onBack,
}: {
  wrongAnswers: WrongAnswerRow[];
  returnPath: string;
  onBack: () => void;
}) {
  const totalMisses = wrongAnswers.reduce((total, word) => total + word.wrongCount, 0);
  const averageMisses = wrongAnswers.length > 0 ? Math.round((totalMisses / wrongAnswers.length) * 10) / 10 : 0;
  const rows = [...wrongAnswers].sort((a, b) => b.wrongCount - a.wrongCount || b.lastWrongAt - a.lastWrongAt);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-background)] pt-3 font-[var(--font-body)] lg:hidden">
      <div className="flex items-center gap-2.5 px-[14px] pb-2.5 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="flex h-[38px] w-[38px] items-center justify-center rounded-[19px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
          aria-label="戻る"
        >
          <Icon name="chevron_left" size={18} />
        </button>
        <div className="flex-1 text-base font-bold text-[var(--solid-ink)]">
          間違えた問題
        </div>
      </div>

      <div className="px-[18px] pb-3.5 pt-1">
        <div>
          <div className="overflow-hidden rounded-2xl border-2 border-[var(--solid-ink)] bg-white p-4">
            <div className="flex items-center gap-1.5 text-[var(--color-error)]">
              <Icon name="flag" size={13} filled />
              <span className="font-mono text-[10px] font-bold tracking-[0.08em]">WRONG ANSWERS</span>
            </div>
            <div className="mt-2.5 flex items-baseline gap-1.5">
              <span className="font-display text-[38px] font-extrabold leading-none tabular-nums text-[var(--solid-ink)]">
                {wrongAnswers.length}
              </span>
              <span className="text-sm font-bold text-[var(--solid-ink)]">語</span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-[10px] border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
                <div className="font-mono text-[9px] font-bold text-[var(--color-muted)]">TOTAL</div>
                <div className="mt-1 font-display text-xl font-black text-[var(--color-error)]">{totalMisses}<span className="text-xs text-[var(--color-muted)]"> 回</span></div>
              </div>
              <div className="rounded-[10px] border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
                <div className="font-mono text-[9px] font-bold text-[var(--color-muted)]">AVERAGE</div>
                <div className="mt-1 font-display text-xl font-black text-[var(--solid-ink)]">{averageMisses}<span className="text-xs text-[var(--color-muted)]"> 回/語</span></div>
              </div>
            </div>
            <div className="mt-3.5">
              <ActionLink href={`/quiz/all?wrong=1&count=10&from=${returnPath}`} icon="replay" label="もう一度クイズ" accent />
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 px-[14px] pb-[110px]">
        {rows.length === 0 ? (
          <div className="rounded-[10px] border-2 border-[var(--color-border)] bg-white px-4 py-10 text-center text-sm text-[var(--color-muted)]">
            間違えた問題はまだありません
          </div>
        ) : (
          rows.map((word) => (
            <div
              key={word.wordId}
              className="flex items-center gap-2.5 rounded-[10px] border-2 bg-white px-3 py-[11px]"
              style={{ borderColor: 'var(--color-border)' }}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="truncate font-display text-[15px] font-bold text-[var(--solid-ink)]">
                    {word.english}
                  </span>
                  <span className="font-mono text-[9px] font-bold text-[var(--color-error)]">{word.wrongCount}回</span>
                </div>
                <div className="mt-px truncate text-[11px] text-[var(--color-muted)]">{word.japanese}</div>
              </div>
              <Link
                href={`/flashcard/${word.projectId || 'all'}?from=${returnPath}`}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)]"
                aria-label="復習"
              >
                <Icon name="style" size={14} />
              </Link>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ActionLink({
  href,
  icon,
  label,
  accent,
}: {
  href: string;
  icon: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <Link href={href} className="relative flex-1">
      <span
        className="absolute inset-0 rounded-[10px]"
        style={{ transform: 'translate(2px, 2px)', background: accent ? 'var(--color-accent)' : 'var(--solid-ink)' }}
      />
      <span
        className="relative flex items-center justify-center gap-1.5 rounded-[10px] border-2 py-[11px] text-[13px] font-bold"
        style={{
          background: accent ? 'var(--color-accent)' : '#fff',
          borderColor: accent ? 'var(--color-accent)' : 'var(--solid-ink)',
          color: accent ? '#fff' : 'var(--solid-ink)',
        }}
      >
        <Icon name={icon} size={14} filled={icon === 'play_arrow'} />
        {label}
      </span>
    </Link>
  );
}
