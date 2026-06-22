'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/use-auth';

const SAMPLE_TEXT = `When I was a child, I have lived in a small town. The town surrounded by mountains and there was a river run through the middle.`;
const MAX_CHARS = 600;

const TOPICS = ['英検 準2', '日常会話', 'ビジネス', '入試英作文'];

export default function CorrectionInputPage() {
  const router = useRouter();
  const { user, isPro, loading: authLoading } = useAuth();
  const [text, setText] = useState(SAMPLE_TEXT);
  const [purpose, setPurpose] = useState(TOPICS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login?redirect=/correction/new');
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
      const response = await fetch('/api/correction/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: normalized, purpose }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        if (payload.code === 'PRO_REQUIRED') {
          router.push('/subscription');
          return;
        }
        throw new Error(payload.error || '添削に失敗しました');
      }
      router.push(`/correction/result?id=${payload.result.id}`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '添削に失敗しました');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="relative flex min-h-full flex-col pt-3 font-[var(--font-body)] lg:pt-0" style={{ background: 'var(--color-background)' }}>
      {submitting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="flex items-center gap-2.5 rounded-2xl border-2 border-[var(--solid-ink)] bg-[#faf7f1] px-5 py-3.5">
            <Icon name="progress_activity" size={16} className="animate-spin text-[var(--solid-ink)]" />
            <span className="text-[13px] font-bold text-[var(--solid-ink)]">添削中...</span>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2.5 px-[14px] pb-1.5 pt-1">
        <button type="button" onClick={() => router.back()} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center border-none bg-transparent p-0 text-[var(--solid-ink)]">
          <Icon name="chevron_left" size={18} />
        </button>
        <div className="mr-8 flex-1 text-center text-base font-bold text-[var(--solid-ink)]" style={{ fontFamily: 'var(--font-display)' }}>英作文の添削</div>
      </div>

      <div className="px-[18px] pb-3 pt-2">
        <div className="inline-flex items-center gap-[5px] rounded bg-[var(--solid-ink)] px-2 py-[3px] font-mono text-[9px] font-bold tracking-[0.08em] text-white">
          <Icon name="edit_note" size={11} />
          CORRECTION · NEW
        </div>
        <div className="mt-2 text-[22px] font-extrabold leading-[1.25] tracking-[-0.02em] text-[var(--solid-ink)]" style={{ fontFamily: 'var(--font-display)' }}>
          書いた英文を、<br />赤ペンで直す。
        </div>
        <div className="mt-1.5 text-xs leading-[1.5] text-[var(--color-muted)]">
          文法・語法・自然さを、根拠付きでチェック。間違いは単語帳に追加できる。
        </div>
      </div>

      <div className="px-[18px] pb-3">
        <div className="grid grid-cols-2 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[rgba(26,26,26,0.05)] p-[3px]">
          <div className="flex items-center justify-center gap-1.5 rounded-[7px] py-2 text-xs font-bold text-[var(--color-muted)]">
            <Icon name="photo_camera" size={13} /> スキャン
          </div>
          <div className="flex items-center justify-center gap-1.5 rounded-[7px] border-2 border-[var(--solid-ink)] bg-white py-2 text-xs font-bold text-[var(--solid-ink)]">
            <Icon name="edit" size={13} /> 直接入力
          </div>
        </div>
      </div>

      <div className="px-[18px] pb-3">
        <div className="mb-1.5 pl-0.5 font-mono text-[9px] font-bold tracking-[0.08em] text-[var(--color-muted)]">目的（任意）</div>
        <div className="flex flex-wrap gap-[5px]">
          {TOPICS.map((topic) => (
            <button
              key={topic}
              type="button"
              onClick={() => setPurpose(topic)}
              className="rounded-full border-2 border-[var(--solid-ink)] px-2.5 py-[5px] text-[11px] font-bold"
              style={{ background: purpose === topic ? 'var(--solid-ink)' : '#fff', color: purpose === topic ? '#fff' : 'var(--solid-ink)' }}
            >
              {topic}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 px-[18px] pb-3">
        <div className="relative w-full">
          <div className="absolute inset-0 rounded-xl bg-[var(--solid-ink)]" style={{ transform: 'translate(2.5px,2.5px)' }} />
          <div className="relative min-h-[220px] rounded-xl border-2 border-[var(--solid-ink)] bg-white px-3.5 pb-9 pt-3.5">
            <textarea
              value={text}
              maxLength={MAX_CHARS}
              onChange={(event) => setText(event.target.value)}
              className="min-h-[165px] w-full resize-none border-none bg-transparent p-0 text-[13px] leading-[1.7] text-[var(--solid-ink)] outline-none"
              placeholder="添削したい英文を入力"
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
          <span className="relative flex items-center justify-center gap-2 rounded-xl border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] py-3.5 text-sm font-bold text-white">
            <Icon name={submitting ? 'progress_activity' : 'auto_awesome'} size={15} />
            {submitting ? '添削中...' : isPro ? '添削する' : 'Proで添削する'}
          </span>
        </button>
        <div className="mt-2 text-center font-mono text-[9px] text-[var(--color-muted)]">所要時間 約 5 秒 · 結果は単語帳に追加可能</div>
      </div>
    </div>
  );
}
