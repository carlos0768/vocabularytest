'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Icon } from '@/components/ui';
import type { StudyGroupStrugglingWord, StudyGroupSummary } from '@/lib/shared-projects/types';

type GroupStrugglingResponse = {
  success?: boolean;
  group?: StudyGroupSummary;
  words?: StudyGroupStrugglingWord[];
  totalCount?: number;
  error?: string;
};

function getParamValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function GroupStrugglingClient() {
  const params = useParams();
  const groupId = getParamValue(params.groupId);
  const [group, setGroup] = useState<StudyGroupSummary | null>(null);
  const [words, setWords] = useState<StudyGroupStrugglingWord[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/shared-projects/groups/${encodeURIComponent(groupId)}/struggling-words?all=1`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json().catch(() => null) as GroupStrugglingResponse | null;
        if (!response.ok || !payload?.success) throw new Error(payload?.error || 'group_struggling_failed');
        if (cancelled) return;
        setGroup(payload.group ?? null);
        setWords(payload.words ?? []);
        setTotalCount(payload.totalCount ?? payload.words?.length ?? 0);
      })
      .catch((loadError) => {
        if (cancelled) return;
        console.error('Failed to load group struggling words:', loadError);
        setError(loadError instanceof Error ? loadError.message : '苦戦中の単語を読み込めませんでした。');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const lowestMissCount = useMemo(
    () => words.length > 0 ? words[words.length - 1]!.wrongCount : 0,
    [words],
  );

  return (
    <main className="min-h-screen bg-[var(--color-background)] pb-24 pt-5 text-[var(--solid-ink)]">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 px-4">
        <Link href={`/groups/${encodeURIComponent(groupId)}`} className="inline-flex w-fit items-center gap-1 text-[13px] font-bold text-[var(--color-accent)]">
          <Icon name="arrow_back" size={15} />
          グループへ戻る
        </Link>

        <section className="rounded-[14px] border-2 border-[var(--solid-ink)] bg-white p-4 shadow-[4px_4px_0_var(--solid-ink)]">
          <div className="flex flex-col gap-1">
            <div className="text-xs font-black text-[var(--color-muted)]">みんなが苦戦中の単語</div>
            <h1 className="font-display text-2xl font-black">{group?.name ?? 'グループ'}</h1>
            <p className="text-xs font-bold text-[var(--color-muted)]">
              間違い回数が多い順に全{totalCount}件を表示{lowestMissCount > 0 ? `・最低${lowestMissCount}回まで` : ''}
            </p>
          </div>
        </section>

        <section className="rounded-[14px] border-2 border-[var(--solid-ink)] bg-white p-4 shadow-[4px_4px_0_var(--solid-ink)]">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm font-bold text-[var(--color-muted)]">
              <Icon name="progress_activity" className="animate-spin" size={18} />
              読み込み中...
            </div>
          ) : error ? (
            <div className="py-8 text-center text-sm font-bold text-[var(--color-error)]">{error}</div>
          ) : words.length === 0 ? (
            <div className="py-8 text-center text-sm font-bold text-[var(--color-muted)]">まだ苦戦中の単語はありません</div>
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {words.map((word, index) => (
                <div key={word.key} className="grid grid-cols-[42px_minmax(0,1fr)_auto] items-center gap-3 py-3">
                  <div className="font-mono text-xs font-black text-[var(--color-muted)]">#{index + 1}</div>
                  <div className="min-w-0">
                    <div className="truncate text-base font-black">{word.english}</div>
                    <div className="mt-0.5 truncate text-xs font-bold text-[var(--color-muted)]">{word.japanese}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="rounded-[9px] border-2 border-[var(--solid-ink)] bg-[var(--color-error)] px-2 py-1 text-xs font-black text-white">
                      {word.wrongCount}回
                    </span>
                    <span className="text-[11px] font-bold text-[var(--color-muted)]">
                      {word.learnerCount}人・{formatDate(word.lastWrongAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
