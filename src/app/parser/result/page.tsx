'use client';

import { type ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import type { ParserResultPayload, ParserTreeNode } from '@/lib/ai/correction-parser';

type ParserResult = ParserResultPayload & {
  id: string;
  inputText: string;
  savedWordsCount: number;
  createdAt: string;
};

const C = {
  main: { bg: 'rgba(217,119,87,0.14)', bd: 'var(--color-accent)', fg: '#a04822', label: '主節' },
  subordinate: { bg: 'rgba(19,127,236,0.12)', bd: '#137fec', fg: '#0e5fb3', label: '従属節' },
  relative: { bg: 'rgba(61,122,78,0.13)', bd: 'var(--color-success)', fg: '#2c5b3a', label: '関係詞節' },
  phrase: { bg: 'rgba(168,118,31,0.14)', bd: '#a8761f', fg: '#7d5a18', label: '句' },
} as const;

const SVO_COLORS: Record<string, { bg: string; fg: string; bd?: string }> = {
  S: { bg: '#1a1a1a', fg: '#fff' },
  V: { bg: 'var(--color-accent)', fg: '#fff' },
  O: { bg: '#137fec', fg: '#fff' },
  C: { bg: '#a8761f', fg: '#fff' },
  M: { bg: '#fff', fg: 'var(--color-muted)', bd: 'var(--solid-ink)' },
};

function Tag({ k }: { k: string }) {
  const c = SVO_COLORS[k] ?? SVO_COLORS.M;
  return <span className="mr-0.5 inline-flex items-center rounded px-[5px] py-[1.5px] font-mono text-[8.5px] font-bold tracking-[0.04em]" style={{ background: c.bg, color: c.fg, border: c.bd ? `1px solid ${c.bd}` : 'none' }}>{k}</span>;
}

function Tok({ children, kind, role }: { children: ReactNode; kind: keyof typeof C; role?: string }) {
  const band = C[kind];
  return (
    <span className="relative inline-block rounded-[4px]" style={{ padding: '14px 3px 5px', background: band.bg, lineHeight: 1.2 }}>
      {role && <span className="absolute left-0.5 top-0 inline-flex gap-0.5"><Tag k={role} /></span>}
      {children}
    </span>
  );
}

function SVOPill({ k, t }: { k: string; t: string }) {
  const c = SVO_COLORS[k] ?? SVO_COLORS.M;
  return (
    <span className="inline-flex items-center gap-1 rounded bg-white px-1.5 py-0.5" style={{ border: '1px solid var(--color-border)' }}>
      <span className="rounded px-1 py-px font-mono text-[8.5px] font-bold" style={{ background: c.bg, color: c.fg }}>{k}</span>
      <span className="font-mono text-[11.5px] font-semibold text-[var(--solid-ink)]">{t}</span>
    </span>
  );
}

function TreeNode({ node }: { node: ParserTreeNode }) {
  const kind = C[node.kind] ?? C.phrase;
  return (
    <div className="mb-2">
      <div className="flex items-stretch rounded-[6px] px-2.5 py-[7px]" style={{ background: kind.bg, border: `1px solid ${kind.bd}`, borderLeftWidth: 3 }}>
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-[5px] font-mono text-[8.5px] font-bold tracking-[0.06em]" style={{ color: kind.fg }}>
            {node.label}
            {node.prefix && <span className="rounded-[3px] bg-white px-[5px] py-[1.5px] text-[8.5px]" style={{ border: `1px solid ${kind.bd}`, color: kind.fg }}>&ldquo;{node.prefix}&rdquo;</span>}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {node.roles.map((role, i) => <SVOPill key={`${role.role}-${i}`} k={role.role} t={role.text} />)}
          </div>
        </div>
      </div>
      {node.children.length > 0 && (
        <div className="ml-1.5 mt-1.5 pl-4" style={{ borderLeft: '2px dashed var(--color-border)' }}>
          {node.children.map((child) => <TreeNode key={child.id} node={child} />)}
        </div>
      )}
    </div>
  );
}

export default function ParserResultPage() {
  const router = useRouter();
  const [id, setId] = useState<string | null>(null);
  const [resolvedId, setResolvedId] = useState(false);
  const [result, setResult] = useState<ParserResult | null>(null);
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
    fetch(`/api/parser/${id}`)
      .then((response) => response.json())
      .then((payload) => {
        if (!active) return;
        if (!payload.success) throw new Error(payload.error || '解析結果の取得に失敗しました');
        setResult(payload.result);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : '解析結果の取得に失敗しました');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, resolvedId]);

  async function saveWords() {
    if (!result || saving) return;
    const candidateIds = result.wordCandidates.map((candidate) => candidate.id).filter((candidateId) => !savedIds.has(candidateId));
    if (candidateIds.length === 0) return;

    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/parser/${result.id}/save-words`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateIds }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) throw new Error(payload.error || '単語の保存に失敗しました');
      setSavedIds((prev) => new Set([...prev, ...candidateIds]));
      setResult((prev) => prev ? { ...prev, savedWordsCount: payload.savedWordsCount ?? prev.savedWordsCount + candidateIds.length } : prev);
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
        <div className="mb-3 text-sm font-bold text-[var(--solid-ink)]">{error || '解析結果が見つかりません'}</div>
        <Link href="/parser/new" className="inline-flex rounded-lg border-2 border-[var(--solid-ink)] bg-white px-3 py-2 text-xs font-bold text-[var(--solid-ink)]">新しく解析する</Link>
      </div>
    );
  }

  const clauseKindById = new Map(result.clauses.map((clause) => [clause.id, clause.kind]));

  return (
    <div className="relative min-h-full pt-3 font-[var(--font-body)] lg:pt-0" style={{ background: 'var(--color-background)' }}>
      <div className="flex items-center gap-2.5 px-[14px] pb-1.5 pt-1">
        <button type="button" onClick={() => router.back()} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center border-none bg-transparent p-0 text-[var(--solid-ink)]">
          <Icon name="chevron_left" size={18} />
        </button>
        <div className="flex-1 text-center text-base font-bold text-[var(--solid-ink)]" style={{ fontFamily: 'var(--font-display)' }}>構造解析</div>
        <button type="button" className="inline-flex h-8 w-8 cursor-pointer items-center justify-center border-none bg-transparent p-0 text-[var(--solid-ink)]">
          <Icon name="ios_share" size={18} />
        </button>
      </div>

      <div className="px-[18px] pb-2.5 pt-2">
        <div className="mb-[7px] flex items-center justify-between">
          <span className="font-mono text-[9px] font-bold tracking-[0.08em] text-[var(--color-muted)]">① 原文 + 節分け</span>
          <span className="font-mono text-[9px] text-[var(--color-muted)]">{result.wordCount} 語</span>
        </div>
        <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white px-3.5 py-3.5 text-[13.5px] leading-[2.1] tracking-[0.005em] text-[var(--solid-ink)]" style={{ fontFamily: 'IBM Plex Mono, ui-monospace, monospace' }}>
          {result.tokens.map((token, i) => (
            <span key={`${token.text}-${i}`}>
              <Tok kind={(token.clauseId ? clauseKindById.get(token.clauseId) : 'phrase') ?? 'phrase'} role={token.role}>{token.text}</Tok>{' '}
            </span>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {Object.values(C).map((c) => (
            <span key={c.label} className="inline-flex items-center gap-[5px] rounded-full py-[3px] pl-[5px] pr-2 font-mono text-[9px] font-bold tracking-[0.04em]" style={{ background: c.bg, border: `1px solid ${c.bd}`, color: c.fg }}>
              <span className="inline-block h-1.5 w-1.5 rounded-[1px]" style={{ background: c.bd }} />
              {c.label}
            </span>
          ))}
        </div>
      </div>

      <div className="px-[18px] pb-3 pt-3">
        <div className="mb-[7px] flex items-center justify-between">
          <span className="font-mono text-[9px] font-bold tracking-[0.08em] text-[var(--color-muted)]">② 構造ツリー</span>
          <span className="rounded bg-[var(--solid-ink)] px-2 py-[3px] font-mono text-[9px] font-bold tracking-[0.04em] text-white">{result.depth}</span>
        </div>
        <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white px-3.5 py-3.5">
          <TreeNode node={result.tree} />
        </div>
      </div>

      <div className="px-[18px] pb-3 pt-1">
        <div className="mb-[7px] font-mono text-[9px] font-bold tracking-[0.08em] text-[var(--color-muted)]">訳</div>
        <div className="rounded-[10px] border-2 border-[var(--color-border)] bg-[var(--color-background)] px-[13px] py-[11px] text-[12.5px] font-medium leading-[1.65] text-[var(--solid-ink)]">
          {result.translationJa}
        </div>
      </div>

      {result.wordCandidates.length > 0 && (
        <div className="px-[18px] pb-3">
          <div className="mb-[7px] font-mono text-[9px] font-bold tracking-[0.08em] text-[var(--color-muted)]">保存候補 ({result.wordCandidates.length})</div>
          <div className="flex flex-wrap gap-1.5">
            {result.wordCandidates.map((candidate) => (
              <span key={candidate.id} className="rounded-full border border-[var(--color-border)] bg-white px-2.5 py-1 text-[10px] font-bold text-[var(--solid-ink)]">{candidate.english}</span>
            ))}
          </div>
        </div>
      )}

      {error && <div className="px-[18px] pb-2 text-center text-xs font-bold text-[var(--color-error)]">{error}</div>}

      <div className="flex gap-2.5 px-[18px] pb-7 pt-2">
        <button type="button" className="relative flex-1">
          <span className="absolute inset-0 rounded-xl bg-[var(--solid-ink)]" style={{ transform: 'translate(2px,2px)' }} />
          <span className="relative flex items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--solid-ink)] bg-white py-[13px] text-[13px] font-bold text-[var(--solid-ink)]">
            <Icon name="volume_up" size={14} /> 音読
          </span>
        </button>
        <button type="button" onClick={saveWords} disabled={saving || result.wordCandidates.length === 0} className="relative disabled:opacity-60" style={{ flex: 1.4 }}>
          <span className="absolute inset-0 rounded-xl bg-[var(--solid-ink)]" style={{ transform: 'translate(2px,2px)' }} />
          <span className="relative flex items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] py-[13px] text-[13px] font-bold text-white">
            <Icon name="menu_book" size={14} /> {saving ? '保存中...' : '単語帳に保存'}
          </span>
        </button>
      </div>
    </div>
  );
}
