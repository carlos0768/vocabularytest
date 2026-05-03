'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/use-auth';
import { getRepository, hybridRepository } from '@/lib/db';
import { localRepository } from '@/lib/db/local-repository';
import { remoteRepository } from '@/lib/db/remote-repository';
import { invalidateHomeCache } from '@/lib/home-cache';
import { markProjectVisited } from '@/lib/project-visit';
import { getGuestUserId } from '@/lib/utils';
import type { Project, SubscriptionStatus, Word, WordStatus } from '@/types';

const THUMBS = ['#137FEC', '#664DB3', '#228B22', '#2E66BF', '#D97340', '#3373B3', '#CC4D59', '#3DA1B8'];

function thumbColor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return THUMBS[Math.abs(h) % THUMBS.length];
}

function isOwnedBy(project: Project | undefined | null, expectedUserId: string): project is Project {
  return Boolean(project && project.userId === expectedUserId);
}

function nextStatus(current: WordStatus): WordStatus {
  if (current === 'new') return 'review';
  if (current === 'review') return 'mastered';
  return 'new';
}

export default function ProjectPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const { user, subscription, loading: authLoading } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [wordsLoaded, setWordsLoaded] = useState(false);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);
  const mutationRepository = useMemo(
    () => (subscriptionStatus === 'active' ? hybridRepository : repository),
    [repository, subscriptionStatus],
  );

  const loadProject = useCallback(async () => {
    if (authLoading) return;
    setLoading(true);
    setError(null);

    try {
      const expectedUserId = user ? user.id : getGuestUserId();
      let loadedProject: Project | undefined;
      let loadedWords: Word[] = [];

      try {
        const localProject = await localRepository.getProject(projectId);
        if (isOwnedBy(localProject, expectedUserId)) {
          loadedProject = localProject;
          setProject(localProject);
          setLoading(false);
          loadedWords = await localRepository.getWords(projectId);
          setWords(loadedWords);
          setWordsLoaded(true);
        }
      } catch (localError) {
        console.error('Local project load failed:', localError);
      }

      if (user && navigator.onLine) {
        try {
          const remoteProject = await remoteRepository.getProject(projectId);
          if (isOwnedBy(remoteProject, user.id)) {
            loadedProject = remoteProject;
            setProject(remoteProject);
            setLoading(false);
            loadedWords = await remoteRepository.getWords(projectId);
            setWords(loadedWords);
            setWordsLoaded(true);
          }
        } catch (remoteError) {
          console.error('Remote project load failed:', remoteError);
        }
      }

      if (!loadedProject) {
        const fallback = await repository.getProject(projectId);
        if (isOwnedBy(fallback, expectedUserId)) {
          loadedProject = fallback;
          setProject(fallback);
          loadedWords = await repository.getWords(projectId);
          setWords(loadedWords);
          setWordsLoaded(true);
        }
      }

      if (!loadedProject) {
        setError('単語帳が見つかりません');
      }
    } catch (loadError) {
      console.error('Failed to load project:', loadError);
      setError('単語帳の読み込みに失敗しました');
    } finally {
      setLoading(false);
      setWordsLoaded(true);
    }
  }, [authLoading, projectId, repository, user]);

  useEffect(() => {
    void loadProject();
  }, [loadProject]);

  useEffect(() => {
    if (project?.id) markProjectVisited(project.id);
  }, [project?.id]);

  const counts = useMemo(() => {
    const mastered = words.filter((word) => word.status === 'mastered').length;
    const learning = words.filter((word) => word.status === 'review').length;
    const newCount = words.filter((word) => word.status === 'new').length;
    return { total: words.length, mastered, learning, newCount };
  }, [words]);

  const filteredWords = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return words;
    return words.filter(
      (word) =>
        word.english.toLowerCase().includes(normalized) ||
        word.japanese.toLowerCase().includes(normalized),
    );
  }, [query, words]);

  const handleCycleStatus = async (word: Word) => {
    const status = nextStatus(word.status);
    setWords((prev) => prev.map((item) => (item.id === word.id ? { ...item, status } : item)));
    try {
      await mutationRepository.updateWord(word.id, { status });
      invalidateHomeCache();
    } catch (updateError) {
      console.error('Failed to update word status:', updateError);
      setWords((prev) => prev.map((item) => (item.id === word.id ? word : item)));
    }
  };

  const handleToggleFavorite = async (word: Word) => {
    const isFavorite = !word.isFavorite;
    setWords((prev) => prev.map((item) => (item.id === word.id ? { ...item, isFavorite } : item)));
    try {
      await mutationRepository.updateWord(word.id, { isFavorite });
      invalidateHomeCache();
    } catch (updateError) {
      console.error('Failed to toggle favorite:', updateError);
      setWords((prev) => prev.map((item) => (item.id === word.id ? word : item)));
    }
  };

  if (loading && !project) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)] text-[var(--color-muted)]">
        <Icon name="progress_activity" size={22} className="animate-spin" />
        <span className="ml-2 text-sm">読み込み中...</span>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-background)] px-6 text-center">
        <h1 className="font-display text-2xl font-extrabold text-[var(--solid-ink)]">単語帳が見つかりません</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">{error || '一覧から選び直してください。'}</p>
        <Link href="/projects" className="solid-link-primary mt-5">
          <Icon name="arrow_back" size={16} />
          単語帳一覧へ
        </Link>
      </div>
    );
  }

  const bg = thumbColor(project.id);

  return (
    <div className="relative flex min-h-screen flex-col bg-[var(--color-background)] font-[var(--font-body)]">
      <div className="flex items-center justify-between px-4 pt-[58px] lg:hidden" style={{ marginTop: 6 }}>
        <HeaderBtn onClick={() => router.back()} aria-label="戻る">
          <Icon name="chevron_left" size={16} />
        </HeaderBtn>
        <div className="flex gap-2">
          <HeaderBtn aria-label="検索" onClick={() => document.getElementById('project-word-search')?.focus()}>
            <Icon name="search" size={15} />
          </HeaderBtn>
          <HeaderBtn aria-label="メニュー">
            <Icon name="more_horiz" size={16} />
          </HeaderBtn>
        </div>
      </div>

      <div className="flex items-start gap-3.5 px-5 pb-2.5 pt-[18px] lg:pt-8">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[13px] border-[1.25px] bg-center bg-cover font-display text-[28px] font-extrabold text-white"
          style={{
            backgroundColor: bg,
            backgroundImage: project.iconImage ? `url(${project.iconImage})` : undefined,
            borderColor: 'var(--solid-ink)',
            boxShadow: '2.5px 2.5px 0 var(--solid-ink)',
          }}
        >
          {!project.iconImage && project.title.charAt(0)}
        </div>
        <div className="flex-1 pt-0.5">
          <div className="font-mono text-[10px] font-semibold tracking-[0.04em] text-[var(--color-muted)]">
            BOOK · {counts.total} words
          </div>
          <h1 className="mt-0.5 font-display text-2xl font-extrabold leading-[1.15] tracking-[-0.01em] text-[var(--solid-ink)]">
            {project.title}
          </h1>
          {project.description && (
            <p className="mt-1 text-xs leading-5 text-[var(--color-muted)]">{project.description}</p>
          )}
        </div>
      </div>

      <div className="px-5 pb-3.5">
        <StackedBar total={counts.total} m={counts.mastered} l={counts.learning} n={counts.newCount} />
      </div>

      <div className="flex gap-2 px-[18px] pb-4">
        <div className="relative flex-1">
          <div className="pointer-events-none absolute inset-0 rounded-[10px] bg-[var(--color-accent)]" style={{ transform: 'translate(2px, 2px)' }} />
          <Link
            href={`/quiz/${projectId}`}
            className="relative flex w-full items-center justify-center gap-1.5 rounded-[10px] border-[1.25px] border-[var(--color-accent)] bg-[var(--color-accent)] py-[11px] text-[13px] font-bold text-white transition-all duration-100 active:translate-x-px active:translate-y-px"
          >
            <Icon name="check" size={14} />
            クイズを始める
          </Link>
        </div>
        <div className="relative">
          <div className="pointer-events-none absolute inset-0 rounded-[10px] bg-[var(--solid-ink)]" style={{ transform: 'translate(2px, 2px)' }} />
          <Link
            href={`/flashcard/${projectId}`}
            className="relative flex items-center gap-1.5 rounded-[10px] border-[1.25px] border-[var(--solid-ink)] bg-white px-[14px] py-[11px] text-[13px] font-bold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
          >
            <Icon name="style" size={14} />
            カード
          </Link>
        </div>
      </div>

      <div className="flex items-center justify-between px-5 pb-2">
        <div className="flex gap-1.5">
          <ToolChip icon="search" label="検索" />
          <label className="sr-only" htmlFor="project-word-search">単語を検索</label>
          <input
            id="project-word-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="単語を検索"
            className="w-[130px] rounded-full border-[1.25px] border-[var(--color-border)] bg-white px-3 py-1.5 text-[12px] text-[var(--solid-ink)] outline-none placeholder:text-[var(--color-muted)]"
          />
        </div>
        <span className="font-mono text-[11px] tabular-nums text-[var(--color-muted)]">
          {filteredWords.length} / {counts.total}
        </span>
      </div>

      <div className="flex flex-col gap-2 px-4 pb-[160px]">
        {!wordsLoaded ? (
          <div className="flex items-center justify-center py-12 text-[var(--color-muted)]">
            <Icon name="progress_activity" size={20} className="animate-spin" />
            <span className="ml-2 text-sm">単語を読み込み中...</span>
          </div>
        ) : filteredWords.length === 0 ? (
          <div className="rounded-xl border-[1.25px] border-[var(--color-border)] bg-white px-4 py-10 text-center text-sm text-[var(--color-muted)]">
            {query ? '一致する単語がありません' : '単語がありません'}
          </div>
        ) : (
          filteredWords.map((word) => (
            <WordRow
              key={word.id}
              word={word}
              onCycleStatus={() => void handleCycleStatus(word)}
              onToggleFavorite={() => void handleToggleFavorite(word)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function HeaderBtn({
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
      className="flex h-[38px] w-[38px] items-center justify-center rounded-[19px] border-[1.25px] border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] shadow-[2px_2px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
    >
      {children}
    </button>
  );
}

function ToolChip({ icon, label }: { icon: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-[5px] rounded-full border-[1.25px] border-[var(--color-border)] bg-white px-2.5 py-1.5 text-[12px] font-semibold text-[var(--color-muted)]">
      <Icon name={icon} size={12} />
      <span className="text-[#4a4a4a]">{label}</span>
    </span>
  );
}

function StackedBar({ total, m, l, n }: { total: number; m: number; l: number; n: number }) {
  const pctM = total ? (m / total) * 100 : 0;
  const pctL = total ? (l / total) * 100 : 0;
  const pctN = total ? (n / total) * 100 : 0;

  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full border-[1.25px] border-[var(--solid-ink)] bg-white">
        <div style={{ width: `${pctM}%`, background: 'var(--color-success)' }} />
        <div style={{ width: `${pctL}%`, background: 'var(--color-warning)' }} />
        <div style={{ width: `${pctN}%`, background: 'rgba(26,26,26,0.12)' }} />
      </div>
      <div className="mt-[7px] flex gap-3.5 font-[var(--font-body)]">
        <BarDot color="var(--color-success)" label="習得" count={m} />
        <BarDot color="var(--color-warning)" label="学習中" count={l} />
        <BarDot color="rgba(26,26,26,0.35)" label="未学習" count={n} />
      </div>
    </div>
  );
}

function BarDot({ color, label, count }: { color: string; label: string; count: number }) {
  return (
    <span className="inline-flex items-center gap-[5px]">
      <span className="h-[7px] w-[7px] rounded-[3.5px]" style={{ background: color }} />
      <span className="text-[11px] font-semibold text-[#4a4a4a]">{label}</span>
      <span className="font-mono text-[11px] tabular-nums text-[var(--color-muted)]">{count}</span>
    </span>
  );
}

function StatusPill({ kind }: { kind: WordStatus }) {
  const config = {
    new: { t: '未学習', bg: '#fff', fg: 'var(--color-muted)', bd: 'var(--color-border)' },
    review: { t: '学習中', bg: 'rgba(19,127,236,0.1)', fg: '#137fec', bd: '#137fec' },
    mastered: { t: '習得', bg: 'rgba(61,122,78,0.12)', fg: 'var(--color-success)', bd: 'var(--color-success)' },
  }[kind];

  return (
    <span
      className="whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-bold leading-none"
      style={{ color: config.fg, background: config.bg, border: `1px solid ${config.bd}` }}
    >
      {config.t}
    </span>
  );
}

function WordRow({
  word,
  onCycleStatus,
  onToggleFavorite,
}: {
  word: Word;
  onCycleStatus: () => void;
  onToggleFavorite: () => void;
}) {
  const pos = word.partOfSpeechTags?.slice(0, 2) ?? [];
  return (
    <div className="relative">
      <div className="absolute inset-0 rounded-xl bg-[var(--solid-ink)]" style={{ transform: 'translate(2px, 2px)' }} />
      <div className="relative rounded-xl border-[1.25px] border-[var(--solid-ink)] bg-white px-[13px] py-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onCycleStatus}
            className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded border-[1.5px] border-[var(--solid-ink)] text-white"
            style={{ background: word.status === 'mastered' ? 'var(--solid-ink)' : '#fff' }}
            aria-label="ステータスを変更"
          >
            {word.status === 'mastered' && <Icon name="check" size={10} />}
          </button>

          <Link href={`/word/${word.id}?from=${encodeURIComponent(`/project/${word.projectId}`)}`} className="min-w-0 flex-1">
            <div className="flex items-baseline gap-1.5">
              <span className="truncate font-display text-[15px] font-bold text-[var(--solid-ink)]">{word.english}</span>
              {pos.length > 0 && (
                <span className="font-mono text-[9px] text-[var(--color-muted)]">{pos.join('/')}</span>
              )}
            </div>
            <div className="mt-px truncate text-[11px] text-[var(--color-muted)]">{word.japanese}</div>
          </Link>

          <StatusPill kind={word.status} />
          <button type="button" onClick={onToggleFavorite} className="inline-flex text-[var(--color-accent)]" aria-label="お気に入りを切り替え">
            <Icon name="bookmark" size={15} filled={word.isFavorite} />
          </button>
        </div>
      </div>
    </div>
  );
}
