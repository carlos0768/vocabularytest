'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/use-auth';

const SAMPLE_TEXT = `Although she had never spoken in public before, she delivered the speech that changed the company's direction with confidence that surprised everyone in the room.`;
const MAX_CHARS = 1200;

const DEPTH_OPTIONS = [
  { k: 'simple' as const, label: 'SVOのみ', pro: false },
  { k: 'clause' as const, label: '節を分ける', pro: false },
  { k: 'tree' as const, label: 'ツリー詳細', pro: true },
];

export default function ParserInputPage() {
  const router = useRouter();
  const { user, isPro, loading: authLoading } = useAuth();
  const [text, setText] = useState(SAMPLE_TEXT);
  const [depth, setDepth] = useState<'simple' | 'clause' | 'tree'>('clause');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login?redirect=/parser/new');
    }
  }, [authLoading, router, user]);

  async function submit() {
    if (!user || submitting) return;
    if (!isPro) {
      router.push('/subscription');
      return;
    }
    const normalized = text.trim();
    if (normalized.length < 10) {
      setError('10文字以上の英文を入力してください');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/parser/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: normalized, depth }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        if (payload.code === 'PRO_REQUIRED') {
          router.push('/subscription');
          return;
        }
        throw new Error(payload.error || '解析に失敗しました');
      }
      router.push(`/parser/result?id=${payload.result.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '解析に失敗しました');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-full flex-col pt-3 font-[var(--font-body)] lg:pt-0" style={{ background: 'var(--color-background)' }}>
      <div className="flex items-center gap-2.5 px-[14px] pb-1.5 pt-1">
        <button type="button" onClick={() => router.back()} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center border-none bg-transparent p-0 text-[var(--solid-ink)]">
          <Icon name="chevron_left" size={18} />
        </button>
        <div className="mr-8 flex-1 text-center text-base font-bold text-[var(--solid-ink)]" style={{ fontFamily: 'var(--font-display)' }}>英文の構造解析</div>
      </div>

      <div className="px-[18px] pb-3 pt-2">
        <div className="inline-flex items-center gap-[5px] rounded bg-[var(--solid-ink)] px-2 py-[3px] font-mono text-[9px] font-bold tracking-[0.08em] text-white">
          <Icon name="account_tree" size={11} />
          PARSER · NEW
        </div>
        <div className="mt-2 text-[22px] font-extrabold leading-[1.25] tracking-[-0.02em] text-[var(--solid-ink)]" style={{ fontFamily: 'var(--font-display)' }}>
          長文を、SVOで<br />分解する。
        </div>
        <div className="mt-1.5 text-xs leading-[1.5] text-[var(--color-muted)]">
          主節・従属節を色で分け、SVOC を即座に可視化。難解な英文を構造から読み解く。
        </div>
      </div>

      <div className="px-[18px] pb-3">
        <div className="grid grid-cols-2 rounded-[10px] border-[1.25px] border-[var(--solid-ink)] bg-[rgba(26,26,26,0.05)] p-[3px]">
          <div className="flex items-center justify-center gap-1.5 rounded-[7px] py-2 text-xs font-bold text-[var(--color-muted)]">
            <Icon name="photo_camera" size={13} /> スキャン
          </div>
          <div className="flex items-center justify-center gap-1.5 rounded-[7px] border-[1.25px] border-[var(--solid-ink)] bg-white py-2 text-xs font-bold text-[var(--solid-ink)] shadow-[1.5px_1.5px_0_var(--solid-ink)]">
            <Icon name="edit" size={13} /> 直接入力
          </div>
        </div>
      </div>

      <div className="px-[18px] pb-3">
        <div className="mb-1.5 pl-0.5 font-mono text-[9px] font-bold tracking-[0.08em] text-[var(--color-muted)]">解析の深さ</div>
        <div className="flex flex-wrap gap-[5px]">
          {DEPTH_OPTIONS.map((option) => (
            <button
              key={option.k}
              type="button"
              onClick={() => setDepth(option.k)}
              className="inline-flex items-center gap-1 rounded-full border-[1.25px] border-[var(--solid-ink)] px-2.5 py-1.5 text-[11px] font-bold"
              style={{ background: depth === option.k ? 'var(--solid-ink)' : '#fff', color: depth === option.k ? '#fff' : 'var(--solid-ink)' }}
            >
              {option.label}
              {option.pro && <span className="font-mono text-[8px] font-bold tracking-[0.06em] text-[var(--color-accent)]">PRO</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 px-[18px] pb-3">
        <div className="relative w-full">
          <div className="absolute inset-0 rounded-xl bg-[var(--solid-ink)]" style={{ transform: 'translate(2.5px,2.5px)' }} />
          <div className="relative min-h-[220px] rounded-xl border-[1.25px] border-[var(--solid-ink)] bg-white px-3.5 pb-9 pt-3.5">
            <textarea
              value={text}
              maxLength={MAX_CHARS}
              onChange={(event) => setText(event.target.value)}
              className="min-h-[165px] w-full resize-none border-none bg-transparent p-0 text-[13px] leading-[1.7] text-[var(--solid-ink)] outline-none"
              placeholder="解析したい英文を入力"
            />
            <div className="absolute bottom-2.5 right-3 font-mono text-[10px] tabular-nums text-[var(--color-muted)]">
              <span className="font-bold text-[var(--solid-ink)]">{text.length}</span> / {MAX_CHARS}
            </div>
          </div>
        </div>
      </div>

      {error && <div className="px-[18px] pb-2 text-center text-xs font-bold text-[var(--color-error)]">{error}</div>}

      <div className="px-[18px] pb-7 pt-1">
        <button type="button" onClick={submit} disabled={submitting || authLoading} className="relative block w-full disabled:opacity-60">
          <span className="absolute inset-0 rounded-xl bg-[var(--solid-ink)]" style={{ transform: 'translate(2.5px,2.5px)' }} />
          <span className="relative flex items-center justify-center gap-2 rounded-xl border-[1.25px] border-[var(--solid-ink)] bg-[var(--solid-ink)] py-3.5 text-sm font-bold text-white">
            <Icon name={submitting ? 'progress_activity' : 'account_tree'} size={15} />
            {submitting ? '解析中...' : isPro ? '解析する' : 'Proで解析する'}
          </span>
        </button>
      </div>
    </div>
  );
}
