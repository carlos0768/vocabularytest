'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { CorrectionResultPayload } from '@/lib/ai/correction-parser';

type CorrectionIssue = CorrectionResultPayload['issues'][number];

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

/* ---------- HeaderBtn (same style as project page) ---------- */
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
      className="flex h-[38px] w-[38px] items-center justify-center rounded-[19px] border-[1.25px] border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] shadow-[2px_2px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px active:shadow-none"
    >
      {children}
    </button>
  );
}

/* ---------- Highlighted original text with mistakes ---------- */
type TextSegment = { text: string; issueNumber?: number };

function buildTextSegments(inputText: string, issues: CorrectionIssue[]): TextSegment[] {
  let segments: TextSegment[] = [{ text: inputText }];

  issues.forEach((issue, idx) => {
    const search = (issue.from ?? '').trim();
    if (!search) return;

    const next: TextSegment[] = [];
    for (const seg of segments) {
      if (seg.issueNumber !== undefined) { next.push(seg); continue; }
      const pos = seg.text.indexOf(search);
      if (pos === -1) { next.push(seg); continue; }
      if (pos > 0) next.push({ text: seg.text.slice(0, pos) });
      next.push({ text: search, issueNumber: idx + 1 });
      const after = seg.text.slice(pos + search.length);
      if (after) next.push({ text: after });
    }
    segments = next;
  });

  return segments;
}

function HighlightedText({ inputText, issues }: { inputText: string; issues: CorrectionIssue[] }) {
  const segments = buildTextSegments(inputText, issues);
  return (
    <div className="whitespace-pre-wrap rounded-xl border-[1.25px] border-[var(--color-border)] bg-white px-3.5 py-3.5 text-[13px] leading-[1.85] text-[var(--solid-ink)]">
      {segments.map((seg, i) =>
        seg.issueNumber !== undefined ? (
          <span
            key={i}
            className="border-b-2 border-[#c43d3d]"
            style={{ background: 'rgba(196,61,61,0.07)' }}
          >
            {seg.text}
            <sup className="ml-[2px] font-mono text-[9px] font-black text-[#c43d3d]">
              {seg.issueNumber}
            </sup>
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </div>
  );
}

export default function CorrectionResultPage() {
  const router = useRouter();
  const [id, setId] = useState<string | null>(null);
  const [resolvedId, setResolvedId] = useState(false);
  const [result, setResult] = useState<CorrectionResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /* Scroll to top on mount */
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    setId(new URLSearchParams(window.location.search).get('id'));
    setResolvedId(true);
  }, []);

  useEffect(() => {
    if (!resolvedId) return;
    if (!id) { setLoading(false); return; }
    let active = true;
    fetch(`/api/correction/${id}`)
      .then((r) => r.json())
      .then((payload) => {
        if (!active) return;
        if (!payload.success) throw new Error(payload.error || '添削結果の取得に失敗しました');
        setResult(payload.result);
      })
      .catch((e) => { if (active) setError(e instanceof Error ? e.message : '添削結果の取得に失敗しました'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id, resolvedId]);

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
      {/* Header with HeaderBtn back button */}
      <div className="flex items-center gap-2.5 px-[14px] pb-1.5 pt-1">
        <HeaderBtn onClick={() => router.back()} aria-label="戻る">
          <Icon name="chevron_left" size={16} />
        </HeaderBtn>
        <div className="mr-[38px] flex-1 text-center text-base font-bold text-[var(--solid-ink)]" style={{ fontFamily: 'var(--font-display)' }}>添削結果</div>
      </div>

      {/* Score card */}
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

      {/* Original text with mistake highlights */}
      <div className="px-[18px] pb-3.5">
        <div className="mb-[7px] flex items-center justify-between">
          <span className="font-mono text-[9px] font-bold tracking-[0.08em] text-[var(--color-muted)]">添削前</span>
          <span className="font-mono text-[9px] font-bold text-[var(--color-accent)]">{result.purpose}</span>
        </div>
        <HighlightedText inputText={result.inputText} issues={result.issues} />
      </div>

      {/* Issues list (no save-word buttons) */}
      <div className="px-[18px] pb-3.5">
        <div className="mb-[7px] font-mono text-[9px] font-bold tracking-[0.08em] text-[var(--color-muted)]">指摘 ({result.issues.length})</div>
        <div className="flex flex-col gap-2">
          {result.issues.map((issue, idx) => (
            <div key={issue.id} className="flex items-start gap-2.5 rounded-[10px] border-[1.25px] border-[var(--color-border)] bg-white px-3 py-[11px]">
              <span className="shrink-0 rounded px-1.5 py-[3px] font-mono text-[9px] font-bold tracking-[0.06em] text-white" style={{ background: TAG_COLORS[issue.tag] ?? 'var(--solid-ink)' }}>{issue.tag}</span>
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="font-mono font-bold text-[var(--color-muted)]">{idx + 1}</span>
                  <span className="font-mono font-semibold text-[#c43d3d] line-through">{issue.from}</span>
                  <span className="text-[10px] text-[var(--color-muted)]">→</span>
                  <span className="border-b-[1.5px] border-[var(--color-accent)] font-mono font-bold text-[var(--solid-ink)]">{issue.to}</span>
                </div>
                <div className="text-[11px] leading-[1.5] text-[var(--color-muted)]">{issue.why}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {error && <div className="px-[18px] pb-2 text-center text-xs font-bold text-[var(--color-error)]">{error}</div>}

      <div className="pb-7" />
    </div>
  );
}
