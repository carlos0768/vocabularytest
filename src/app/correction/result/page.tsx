'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { CorrectionResultPayload } from '@/lib/ai/correction-parser';

type CorrectionResult = CorrectionResultPayload & {
  id: string;
  inputText: string;
  purpose: string;
  savedWordsCount: number;
  createdAt: string;
};

const TAG_COLORS: Record<string, string> = {
  時制: '#c43d3d',
  文法: '#c43d3d',
  語法: 'var(--color-accent)',
  自然さ: '#c8a02e',
};

export default function CorrectionResultPage() {
  const router = useRouter();
  const [id, setId] = useState<string | null>(null);
  const [resolvedId, setResolvedId] = useState(false);
  const [result, setResult] = useState<CorrectionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setId(new URLSearchParams(window.location.search).get('id'));
    setResolvedId(true);
  }, []);

  useEffect(() => {
    if (!resolvedId) return;
    if (!id) {
      setLoading(false);
      return;
    }
    let active = true;
    fetch(`/api/correction/${id}`)
      .then((response) => response.json())
      .then((payload) => {
        if (!active) return;
        if (!payload.success) throw new Error(payload.error || '添削結果の取得に失敗しました');
        setResult(payload.result);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : '添削結果の取得に失敗しました');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, resolvedId]);

  async function saveWords(candidateIds?: string[]) {
    if (!result || saving) return;
    const ids = candidateIds ?? result.wordCandidates.map((candidate) => candidate.id).filter((candidateId) => !savedIds.has(candidateId));
    if (ids.length === 0) return;

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/correction/${result.id}/save-words`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateIds: ids }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || '単語の保存に失敗しました');
      setSavedIds((prev) => new Set([...prev, ...ids]));
      setResult((prev) => prev ? { ...prev, savedWordsCount: payload.savedWordsCount ?? prev.savedWordsCount + ids.length } : prev);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : '単語の保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }

  if (!resolvedId || loading) {
    return <div className="min-h-full bg-[var(--color-background)] px-[18px] pt-5 text-center text-xs font-bold text-[var(--color-muted)]">読み込み中...</div>;
  }

  if (!id || !result) {
    return (
      <div className="min-h-full bg-[var(--color-background)] px-[18px] pt-5 text-center font-[var(--font-body)]">
        <div className="mb-3 text-sm font-bold text-[var(--solid-ink)]">{error || '添削結果が見つかりません'}</div>
        <Link href="/correction/new" className="inline-flex rounded-lg border-[1.25px] border-[var(--solid-ink)] bg-white px-3 py-2 text-xs font-bold text-[var(--solid-ink)]">新しく添削する</Link>
      </div>
    );
  }

  return (
    <div className="relative min-h-full pt-3 font-[var(--font-body)] lg:pt-0" style={{ background: 'var(--color-background)' }}>
      <div className="flex items-center gap-2.5 px-[14px] pb-1.5 pt-1">
        <button type="button" onClick={() => router.back()} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center border-none bg-transparent p-0 text-[var(--solid-ink)]">
          <Icon name="chevron_left" size={18} />
        </button>
        <div className="mr-8 flex-1 text-center text-base font-bold text-[var(--solid-ink)]" style={{ fontFamily: 'var(--font-display)' }}>添削結果</div>
      </div>

      <div className="px-[18px] pb-3.5 pt-2">
        <div className="relative">
          <div className="absolute inset-0 rounded-[14px] bg-[var(--solid-ink)]" style={{ transform: 'translate(2.5px,2.5px)' }} />
          <div className="relative flex items-center gap-3.5 rounded-[14px] border-[1.25px] border-[var(--solid-ink)] bg-white px-4 py-3.5">
            <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-xl bg-[var(--solid-ink)] text-white" style={{ fontFamily: 'var(--font-display)' }}>
              <span className="tabular-nums text-[26px] font-black leading-none">{result.score}</span>
              <span className="mt-0.5 font-mono text-[8px] tracking-[0.06em] text-white/70">SCORE</span>
            </div>
            <div className="flex-1">
              <div className="mb-1 flex items-center gap-1.5">
                <span className="font-mono text-[9px] font-bold tracking-[0.08em] text-[var(--color-muted)]">{result.level}</span>
                <span className="inline-block h-[3px] w-[3px] rounded-full bg-[var(--color-muted)]" />
                <span className="font-mono text-[9px] font-bold tracking-[0.08em] text-[var(--color-muted)]">{result.wordCount}語</span>
              </div>
              <div className="text-[15px] font-bold leading-[1.4] text-[var(--solid-ink)]" style={{ fontFamily: 'var(--font-display)' }}>{result.summary}</div>
              <div className="mt-[3px] text-[11px] text-[var(--color-muted)]">
                文法 <span className="font-mono font-bold text-[#c43d3d]">{result.issueCounts.grammar}</span> · 語法 <span className="font-mono font-bold text-[var(--color-accent)]">{result.issueCounts.usage}</span> · 自然さ <span className="font-mono font-bold text-[#c8a02e]">{result.issueCounts.naturalness}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-[18px] pb-3.5">
        <div className="mb-[7px] flex items-center justify-between">
          <span className="font-mono text-[9px] font-bold tracking-[0.08em] text-[var(--color-muted)]">添削後</span>
          <span className="font-mono text-[9px] font-bold text-[var(--color-accent)]">{result.purpose}</span>
        </div>
        <div className="whitespace-pre-wrap rounded-xl border-[1.25px] border-[var(--color-border)] bg-white px-3.5 py-3.5 text-[13px] leading-[1.85] text-[var(--solid-ink)]">
          {result.correctedText}
        </div>
      </div>

      <div className="px-[18px] pb-3.5">
        <div className="mb-[7px] font-mono text-[9px] font-bold tracking-[0.08em] text-[var(--color-muted)]">指摘 ({result.issues.length})</div>
        <div className="flex flex-col gap-2">
          {result.issues.map((issue) => {
            const candidateId = issue.vocabularyCandidateId;
            const isSaved = Boolean(candidateId && savedIds.has(candidateId));
            return (
              <div key={issue.id} className="flex items-start gap-2.5 rounded-[10px] border-[1.25px] border-[var(--color-border)] bg-white px-3 py-[11px]">
                <span className="shrink-0 rounded px-1.5 py-[3px] font-mono text-[9px] font-bold tracking-[0.06em] text-white" style={{ background: TAG_COLORS[issue.tag] ?? 'var(--solid-ink)' }}>{issue.tag}</span>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="font-mono font-semibold text-[#c43d3d] line-through">{issue.from}</span>
                    <span className="text-[10px] text-[var(--color-muted)]">→</span>
                    <span className="border-b-[1.5px] border-[var(--color-accent)] font-mono font-bold text-[var(--solid-ink)]">{issue.to}</span>
                  </div>
                  <div className="text-[11px] leading-[1.5] text-[var(--color-muted)]">{issue.why}</div>
                </div>
                {candidateId && (
                  <button type="button" onClick={() => saveWords([candidateId])} disabled={saving || isSaved} className="inline-flex shrink-0 items-center gap-[3px] rounded-[6px] border-[1.25px] border-[var(--solid-ink)] px-2 py-[5px] font-mono text-[9px] font-bold tracking-[0.04em] disabled:opacity-70" style={{ background: isSaved ? 'var(--solid-ink)' : '#fff', color: isSaved ? '#fff' : 'var(--solid-ink)' }}>
                    <Icon name={isSaved ? 'check' : 'add'} size={10} /> {isSaved ? '追加済' : '単語帳'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {error && <div className="px-[18px] pb-2 text-center text-xs font-bold text-[var(--color-error)]">{error}</div>}

      <div className="flex gap-2.5 px-[18px] pb-7 pt-2">
        <Link href="/correction/new" className="relative flex-1">
          <span className="absolute inset-0 rounded-xl bg-[var(--solid-ink)]" style={{ transform: 'translate(2px,2px)' }} />
          <span className="relative flex items-center justify-center gap-1.5 rounded-xl border-[1.25px] border-[var(--solid-ink)] bg-white py-[13px] text-[13px] font-bold text-[var(--solid-ink)]">
            <Icon name="edit" size={14} /> 修正
          </span>
        </Link>
        <button type="button" onClick={() => saveWords()} disabled={saving || result.wordCandidates.length === 0} className="relative disabled:opacity-60" style={{ flex: 1.4 }}>
          <span className="absolute inset-0 rounded-xl bg-[var(--solid-ink)]" style={{ transform: 'translate(2px,2px)' }} />
          <span className="relative flex items-center justify-center gap-1.5 rounded-xl border-[1.25px] border-[var(--solid-ink)] bg-[var(--solid-ink)] py-[13px] text-[13px] font-bold text-white">
            <Icon name="menu_book" size={14} /> {saving ? '保存中...' : '単語帳に保存'}
          </span>
        </button>
      </div>
    </div>
  );
}
