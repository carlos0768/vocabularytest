'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Icon } from '@/components/ui';
import type {
  SharedProjectCard,
  StudyGroupStrugglingWord,
  StudyGroupSummary,
} from '@/lib/shared-projects/types';

type GroupProjectsResponse = {
  success?: boolean;
  group?: StudyGroupSummary;
  projects?: SharedProjectCard[];
  error?: string;
};

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
  return date.toLocaleDateString('ja-JP', { month: 'short', day: 'numeric' });
}

function thumbColor(id: string) {
  const colors = ['#137FEC', '#664DB3', '#228B22', '#2E66BF', '#D97340', '#3373B3', '#CC4D59', '#3DA1B8'];
  let h = 0;
  for (let i = 0; i < id.length; i++) h = ((h << 5) - h + id.charCodeAt(i)) | 0;
  return colors[Math.abs(h) % colors.length];
}

export default function GroupDetailClient() {
  const params = useParams();
  const groupId = getParamValue(params.groupId);
  const [group, setGroup] = useState<StudyGroupSummary | null>(null);
  const [projects, setProjects] = useState<SharedProjectCard[]>([]);
  const [strugglingWords, setStrugglingWords] = useState<StudyGroupStrugglingWord[]>([]);
  const [strugglingTotalCount, setStrugglingTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!groupId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      fetch(`/api/shared-projects/groups/${encodeURIComponent(groupId)}/projects`, { cache: 'no-store' })
        .then(async (response) => {
          const payload = await response.json().catch(() => null) as GroupProjectsResponse | null;
          if (!response.ok || !payload?.success) throw new Error(payload?.error || 'group_projects_failed');
          return payload;
        }),
      fetch(`/api/shared-projects/groups/${encodeURIComponent(groupId)}/struggling-words?limit=5`, { cache: 'no-store' })
        .then(async (response) => {
          const payload = await response.json().catch(() => null) as GroupStrugglingResponse | null;
          if (!response.ok || !payload?.success) throw new Error(payload?.error || 'group_struggling_failed');
          return payload;
        }),
    ])
      .then(([projectPayload, strugglingPayload]) => {
        if (cancelled) return;
        setGroup(projectPayload.group ?? strugglingPayload.group ?? null);
        setProjects(projectPayload.projects ?? []);
        setStrugglingWords(strugglingPayload.words ?? []);
        setStrugglingTotalCount(strugglingPayload.totalCount ?? 0);
      })
      .catch((loadError) => {
        if (cancelled) return;
        console.error('Failed to load group:', loadError);
        setError(loadError instanceof Error ? loadError.message : 'グループを読み込めませんでした。');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [groupId]);

  const showMoreStruggling = strugglingTotalCount > strugglingWords.length;
  const lowestShownMissCount = useMemo(
    () => strugglingWords.length > 0 ? strugglingWords[strugglingWords.length - 1]!.wrongCount : 0,
    [strugglingWords],
  );

  return (
    <main className="min-h-screen bg-[var(--color-background)] pb-24 pt-5 text-[var(--solid-ink)]">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4">
        <Link href="/shared" className="inline-flex w-fit items-center gap-1 text-[13px] font-bold text-[var(--color-accent)]">
          <Icon name="arrow_back" size={15} />
          共有ライブラリ
        </Link>

        <section className="rounded-[14px] border-2 border-[var(--solid-ink)] bg-white p-4 shadow-[4px_4px_0_var(--solid-ink)]">
          {loading && !group ? (
            <div className="flex items-center gap-2 text-sm font-bold text-[var(--color-muted)]">
              <Icon name="progress_activity" className="animate-spin" size={18} />
              読み込み中...
            </div>
          ) : error ? (
            <div className="text-sm font-bold text-[var(--color-error)]">{error}</div>
          ) : group ? (
            <div className="flex items-center gap-4">
              <div
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] border-2 border-[var(--solid-ink)] font-display text-2xl font-black text-white"
                style={{ backgroundColor: thumbColor(group.id) }}
              >
                {group.name.charAt(0)}
              </div>
              <div className="min-w-0">
                <h1 className="truncate font-display text-2xl font-black">{group.name}</h1>
                <div className="mt-1 flex flex-wrap gap-3 text-xs font-bold text-[var(--color-muted)]">
                  <span className="inline-flex items-center gap-1"><Icon name="group" size={14} />{group.memberCount}人</span>
                  <span className="inline-flex items-center gap-1"><Icon name="menu_book" size={14} />{group.projectCount}冊</span>
                  {group.ownerUsername && <span>@{group.ownerUsername}</span>}
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-[14px] border-2 border-[var(--solid-ink)] bg-white p-4 shadow-[4px_4px_0_var(--solid-ink)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-xl font-black">みんなが苦戦中の単語</h2>
              {strugglingWords.length > 0 && (
                <p className="mt-1 text-xs font-bold text-[var(--color-muted)]">
                  間違い回数が多い順・上位5件{lowestShownMissCount > 0 ? `（${lowestShownMissCount}回以上）` : ''}
                </p>
              )}
            </div>
            {showMoreStruggling && (
              <Link
                href={`/groups/${encodeURIComponent(groupId)}/struggling`}
                className="inline-flex shrink-0 items-center gap-1 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-accent)] px-3 py-2 text-xs font-black text-white shadow-[2px_2px_0_var(--solid-ink)]"
              >
                もっと見る
                <Icon name="chevron_right" size={14} />
              </Link>
            )}
          </div>

          {strugglingWords.length === 0 ? (
            <div className="rounded-[10px] bg-[var(--color-surface-secondary)] p-4 text-center text-sm font-bold text-[var(--color-muted)]">
              まだ苦戦中の単語はありません
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {strugglingWords.map((word) => (
                <StrugglingWordRow key={word.key} word={word} />
              ))}
            </div>
          )}
        </section>

        <section className="rounded-[14px] border-2 border-[var(--solid-ink)] bg-white p-4 shadow-[4px_4px_0_var(--solid-ink)]">
          <h2 className="mb-3 font-display text-xl font-black">共有中の単語帳</h2>
          {projects.length === 0 ? (
            <div className="rounded-[10px] bg-[var(--color-surface-secondary)] p-4 text-center text-sm font-bold text-[var(--color-muted)]">
              このグループにはまだ単語帳がありません
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((item) => (
                <Link
                  key={item.project.id}
                  href={item.project.shareId ? `/share/${item.project.shareId}` : '/shared'}
                  className="rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface-secondary)] p-3 text-inherit no-underline transition hover:-translate-y-0.5"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-cover bg-center font-display font-black text-white"
                      style={{
                        backgroundColor: thumbColor(item.project.id),
                        backgroundImage: item.project.iconImage ? `url(${item.project.iconImage})` : undefined,
                      }}
                    >
                      {!item.project.iconImage && item.project.title.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-black">{item.project.title}</div>
                      <div className="mt-0.5 text-[11px] font-bold text-[var(--color-muted)]">{item.wordCount ?? 0}語</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function StrugglingWordRow({ word }: { word: StudyGroupStrugglingWord }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 py-3">
      <div className="min-w-0">
        <div className="truncate text-base font-black">{word.english}</div>
        <div className="mt-0.5 truncate text-xs font-bold text-[var(--color-muted)]">{word.japanese}</div>
      </div>
      <div className="flex items-center gap-2 text-right">
        <div className="rounded-[9px] border-2 border-[var(--solid-ink)] bg-[var(--color-error)] px-2 py-1 text-xs font-black text-white">
          {word.wrongCount}回
        </div>
        <div className="hidden text-[11px] font-bold text-[var(--color-muted)] sm:block">
          {word.learnerCount}人・{formatDate(word.lastWrongAt)}
        </div>
      </div>
    </div>
  );
}
