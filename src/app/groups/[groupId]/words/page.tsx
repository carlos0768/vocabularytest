'use client';

/**
 * グループの単語一覧。
 *
 * グループに共有された単語帳の単語をまとめて眺める画面。読み込みは開いたとき
 * の1回だけで、検索・絞り込み・並べ替えはすべてメモリ上で完結する（/words と
 * 同じ方針）。「苦手」はグループ内で2人以上が間違えた単語で、旧「みんなが
 * 苦戦中」ページの中身をこの絞り込みとして取り込んでいる。
 */

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import {
  GroupPageEmpty,
  GroupPageLoading,
  GroupPageShell,
} from '@/components/groups/GroupPageShell';
import { Icon } from '@/components/ui/Icon';
import { WordListFrame } from '@/components/words/WordListFrame';
import { speakEnglish } from '@/lib/speech';
import type { StudyGroupSummary, StudyGroupWord } from '@/lib/shared-projects/types';

type SortKey = 'struggling' | 'alpha' | 'book';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'struggling', label: '苦手順' },
  { key: 'alpha', label: 'ABC順' },
  { key: 'book', label: '単語帳順' },
];

type WordsResponse = {
  success?: boolean;
  group?: StudyGroupSummary;
  words?: StudyGroupWord[];
  error?: string;
};

export default function GroupWordsPage() {
  return (
    <Suspense fallback={null}>
      <GroupWordsView />
    </Suspense>
  );
}

function GroupWordsView() {
  const params = useParams<{ groupId: string }>();
  const groupId = params?.groupId ?? '';
  const searchParams = useSearchParams();

  const [group, setGroup] = useState<StudyGroupSummary | null>(null);
  const [words, setWords] = useState<StudyGroupWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [query, setQuery] = useState('');
  // デスクトップの「みんなが苦戦中 → すべて見る」からは苦手だけを開く。
  const [strugglingOnly, setStrugglingOnly] = useState(
    () => searchParams?.get('filter') === 'struggling',
  );
  const [projectId, setProjectId] = useState<string>('');
  const [sort, setSort] = useState<SortKey>(
    () => (searchParams?.get('filter') === 'struggling' ? 'struggling' : 'book'),
  );

  useEffect(() => {
    if (!groupId) return;
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch(
          `/api/shared-projects/groups/${encodeURIComponent(groupId)}/words`,
          { cache: 'no-store' },
        );
        const payload = await response.json().catch(() => null) as WordsResponse | null;
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || 'group_words_failed');
        }
        if (cancelled) return;
        setGroup(payload.group ?? null);
        setWords(payload.words ?? []);
      } catch (loadError) {
        console.warn('Failed to load group words:', loadError);
        if (!cancelled) setError('単語一覧を読み込めませんでした。');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [groupId]);

  const books = useMemo(() => {
    const byId = new Map<string, { id: string; title: string; count: number }>();
    for (const word of words) {
      const current = byId.get(word.projectId);
      if (current) current.count += 1;
      else byId.set(word.projectId, { id: word.projectId, title: word.projectTitle, count: 1 });
    }
    return Array.from(byId.values()).sort((a, b) => b.count - a.count);
  }, [words]);

  const strugglingCount = useMemo(
    () => words.filter((word) => word.missCount > 0).length,
    [words],
  );

  const visibleWords = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = words.filter((word) => {
      if (strugglingOnly && word.missCount <= 0) return false;
      if (projectId && word.projectId !== projectId) return false;
      if (!needle) return true;
      return word.english.toLowerCase().includes(needle) || word.japanese.includes(query.trim());
    });

    return filtered.sort((a, b) => {
      if (sort === 'struggling') {
        return b.missCount - a.missCount
          || b.learnerCount - a.learnerCount
          || a.english.localeCompare(b.english);
      }
      if (sort === 'alpha') return a.english.localeCompare(b.english);
      return a.projectTitle.localeCompare(b.projectTitle) || a.english.localeCompare(b.english);
    });
  }, [words, query, strugglingOnly, projectId, sort]);

  return (
    <GroupPageShell
      eyebrow="GROUP WORDS"
      title={group?.name ?? '単語一覧'}
      backHref={`/groups/${encodeURIComponent(groupId)}`}
      headerExtra={
        words.length > 0 ? (
          <div className="mt-2.5 flex flex-col gap-2">
            <label className="flex min-w-0 items-center gap-2 rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-2 text-[var(--color-muted)]">
              <Icon name="search" size={16} />
              <span className="sr-only">グループの単語を検索</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="英単語・意味で検索"
                className="min-w-0 flex-1 bg-transparent text-[14px] font-bold text-[var(--solid-ink)] outline-none placeholder:font-bold placeholder:text-[var(--color-muted)]"
              />
            </label>

            {/* 絞り込みは横1行に収める（縦にカードを積まない） */}
            <div className="no-scrollbar -mx-[14px] flex gap-1.5 overflow-x-auto px-[14px] pb-0.5">
              <FilterChip
                active={strugglingOnly}
                icon="local_fire_department"
                label={`苦手 ${strugglingCount}`}
                onClick={() => setStrugglingOnly((current) => !current)}
              />
              {SORT_OPTIONS.map((option) => (
                <FilterChip
                  key={option.key}
                  active={sort === option.key}
                  label={option.label}
                  onClick={() => setSort(option.key)}
                />
              ))}
              {books.length > 1 && (
                <select
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                  aria-label="単語帳で絞り込む"
                  className="h-[30px] shrink-0 rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-2 font-display text-[12px] font-extrabold text-[var(--solid-ink)]"
                >
                  <option value="">すべての単語帳</option>
                  {books.map((book) => (
                    <option key={book.id} value={book.id}>
                      {book.title}（{book.count}）
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        ) : undefined
      }
    >
      {loading && words.length === 0 ? (
        <GroupPageLoading />
      ) : error ? (
        <GroupPageEmpty icon="error" message={error} />
      ) : words.length === 0 ? (
        <GroupPageEmpty
          icon="menu_book"
          message="グループに共有された単語帳がまだありません。"
        />
      ) : visibleWords.length === 0 ? (
        <GroupPageEmpty icon="search_off" message="条件に合う単語がありません。" />
      ) : (
        <>
          <p className="mb-2 px-1 font-mono text-[10px] font-bold tracking-[0.06em] text-[var(--color-muted)]">
            {visibleWords.length} / {words.length} WORDS
          </p>
          {/* 枠は /words と同じ（区切り線だけ）。fullBleed で画面の端まで伸ばす */}
          <WordListFrame fullBleed>
            {visibleWords.map((word) => (
              <GroupWordRow key={word.id} word={word} />
            ))}
          </WordListFrame>
        </>
      )}
    </GroupPageShell>
  );
}

function FilterChip({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon?: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex h-[30px] shrink-0 items-center gap-1 rounded-full border-2 px-3 font-display text-[12px] font-extrabold transition-colors duration-100 ${
        active
          ? 'border-[var(--solid-ink)] bg-[var(--solid-ink)] text-[var(--color-surface)]'
          : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]'
      }`}
    >
      {icon && <Icon name={icon} size={14} />}
      {label}
    </button>
  );
}

/** 行の見た目も /words の WordRow に合わせる（枠は WordListFrame が持つ）。 */
function GroupWordRow({ word }: { word: StudyGroupWord }) {
  return (
    <div className="flex items-center gap-3 px-[14px] py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-display text-[15px] font-bold text-[var(--solid-ink)]">
            {word.english}
          </span>
          {word.missCount > 0 && (
            <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[var(--color-error-light)] px-1.5 py-px font-mono text-[9.5px] font-bold text-[var(--color-error)]">
              <Icon name="local_fire_department" size={11} />
              {word.missCount}
            </span>
          )}
        </div>
        <div className="truncate text-[12.5px] font-bold text-[var(--color-muted)]">{word.japanese}</div>
        <div className="truncate font-mono text-[9.5px] font-bold text-[var(--color-muted)] opacity-80">
          {word.projectTitle}
          {word.ownerUsername ? ` · @${word.ownerUsername}` : ''}
        </div>
      </div>
      <button
        type="button"
        onClick={() => speakEnglish(word.english)}
        aria-label={`${word.english} を読み上げる`}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-secondary)] text-[var(--color-muted)]"
      >
        <Icon name="volume_up" size={15} />
      </button>
    </div>
  );
}
