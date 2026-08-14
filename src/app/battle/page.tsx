'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/use-auth';
import { useProjects } from '@/hooks/use-projects';
import {
  BATTLE_DEFAULT_QUESTION_COUNT,
  BATTLE_DEFAULT_ROUND_DURATION_MS,
  BATTLE_MATCH_POLL_INTERVAL_MS,
  normalizeInviteCode,
} from '@/lib/battle/config';
import type { BattleRoom } from '@/lib/battle/types';

type LobbyMode = 'idle' | 'matching' | 'hosting';

const QUESTION_COUNT_OPTIONS = [5, 10, 20];
const ROUND_DURATION_OPTIONS = [
  { label: '10秒', value: 10_000 },
  { label: '15秒', value: 15_000 },
  { label: '20秒', value: 20_000 },
];

export default function BattleLobbyPage() {
  const router = useRouter();
  const { isAuthenticated, isPro, loading: authLoading } = useAuth();
  const { projects, loading: projectsLoading } = useProjects();

  const [projectId, setProjectId] = useState<string>('');
  const [questionCount, setQuestionCount] = useState(BATTLE_DEFAULT_QUESTION_COUNT);
  const [roundDurationMs, setRoundDurationMs] = useState(BATTLE_DEFAULT_ROUND_DURATION_MS);
  const [mode, setMode] = useState<LobbyMode>('idle');
  const [hostedRoom, setHostedRoom] = useState<BattleRoom | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const modeRef = useRef<LobbyMode>('idle');
  modeRef.current = mode;

  useEffect(() => {
    if (!projectId && projects.length > 0) {
      setProjectId(projects[0].id);
    }
  }, [projects, projectId]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId) ?? null,
    [projects, projectId],
  );

  const postJson = useCallback(async (url: string, body: unknown) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success) {
      throw new Error(payload?.error ?? '通信に失敗しました。');
    }
    return payload;
  }, []);

  const startRandomMatch = useCallback(async () => {
    if (!projectId) return;
    setError(null);
    setBusy(true);
    try {
      const payload = await postJson('/api/battle/match', {
        projectId,
        questionCount,
        roundDurationMs,
      });

      if (payload.matched && payload.roomId) {
        router.push(`/battle/${payload.roomId}`);
        return;
      }
      setMode('matching');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'マッチングに失敗しました。');
    } finally {
      setBusy(false);
    }
  }, [projectId, questionCount, roundDurationMs, postJson, router]);

  const cancelRandomMatch = useCallback(async () => {
    setMode('idle');
    await fetch('/api/battle/match', { method: 'DELETE' }).catch(() => {});
  }, []);

  // While queued, poll for the room the server paired us into.
  useEffect(() => {
    if (mode !== 'matching') return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch('/api/battle/match', { cache: 'no-store' });
        const payload = await response.json().catch(() => null);
        if (payload?.matched && payload.roomId && modeRef.current === 'matching') {
          router.push(`/battle/${payload.roomId}`);
        }
      } catch {
        // Keep waiting -- a dropped poll is not fatal.
      }
    }, BATTLE_MATCH_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [mode, router]);

  const createFriendRoom = useCallback(async () => {
    if (!projectId) return;
    setError(null);
    setBusy(true);
    try {
      const payload = await postJson('/api/battle/rooms', {
        projectId,
        questionCount,
        roundDurationMs,
      });
      setHostedRoom(payload.room as BattleRoom);
      setMode('hosting');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ルームの作成に失敗しました。');
    } finally {
      setBusy(false);
    }
  }, [projectId, questionCount, roundDurationMs, postJson]);

  // The host waits here until someone joins with the invite code.
  useEffect(() => {
    if (mode !== 'hosting' || !hostedRoom) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/battle/rooms/${hostedRoom.id}`, { cache: 'no-store' });
        const payload = await response.json().catch(() => null);
        if (payload?.room?.guest) {
          router.push(`/battle/${hostedRoom.id}`);
        }
      } catch {
        // ignore
      }
    }, BATTLE_MATCH_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [mode, hostedRoom, router]);

  const joinFriendRoom = useCallback(async () => {
    if (!projectId) return;
    const normalized = normalizeInviteCode(joinCode);
    if (!normalized) {
      setError('招待コードは6文字です。');
      return;
    }

    setError(null);
    setBusy(true);
    try {
      const payload = await postJson('/api/battle/join', {
        inviteCode: normalized,
        projectId,
      });
      router.push(`/battle/${(payload.room as BattleRoom).id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '参加に失敗しました。');
    } finally {
      setBusy(false);
    }
  }, [projectId, joinCode, postJson, router]);

  if (authLoading) {
    return <main className="p-6 text-center text-[var(--color-muted)]">読み込み中...</main>;
  }

  if (!isAuthenticated) {
    return (
      <main className="mx-auto max-w-md p-6 text-center">
        <h1 className="mb-3 text-xl font-bold">リアルタイム単語対戦</h1>
        <p className="mb-6 text-sm text-[var(--color-muted)]">対戦にはログインが必要です。</p>
        <Link href="/login" className="inline-block rounded-xl bg-[var(--color-foreground)] px-6 py-3 font-semibold text-white">
          ログイン
        </Link>
      </main>
    );
  }

  if (!isPro) {
    return (
      <main className="mx-auto max-w-md p-6 text-center">
        <h1 className="mb-3 text-xl font-bold">リアルタイム単語対戦</h1>
        <p className="mb-6 text-sm text-[var(--color-muted)]">
          リアルタイム対戦はProプラン限定の機能です。コインは消費しません。
        </p>
        <Link href="/pricing" className="inline-block rounded-xl bg-[var(--color-foreground)] px-6 py-3 font-semibold text-white">
          Proプランを見る
        </Link>
      </main>
    );
  }

  if (mode === 'matching') {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center p-6 text-center">
        <div className="mb-6 h-12 w-12 animate-spin rounded-full border-4 border-[var(--color-surface-secondary)] border-t-[var(--color-foreground)]" />
        <h1 className="mb-2 text-lg font-bold">対戦相手を探しています...</h1>
        <p className="mb-8 text-sm text-[var(--color-muted)]">
          見つかり次第、自動で対戦が始まります。
        </p>
        <button
          type="button"
          onClick={cancelRandomMatch}
          className="rounded-xl border-2 border-[var(--color-foreground)] px-6 py-3 font-semibold"
        >
          キャンセル
        </button>
      </main>
    );
  }

  if (mode === 'hosting' && hostedRoom) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center p-6 text-center">
        <h1 className="mb-2 text-lg font-bold">招待コード</h1>
        <p className="mb-6 text-sm text-[var(--color-muted)]">
          このコードを相手に伝えてください。参加すると自動で始まります。
        </p>
        <div className="mb-8 rounded-2xl border-2 border-[var(--color-foreground)] px-8 py-6 font-mono text-4xl font-bold tracking-[0.3em]">
          {hostedRoom.inviteCode}
        </div>
        <div className="mb-6 h-8 w-8 animate-spin rounded-full border-4 border-[var(--color-surface-secondary)] border-t-[var(--color-foreground)]" />
        <button
          type="button"
          onClick={() => { setMode('idle'); setHostedRoom(null); }}
          className="rounded-xl border-2 border-[var(--color-foreground)] px-6 py-3 font-semibold"
        >
          キャンセル
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-2 text-2xl font-bold">リアルタイム単語対戦</h1>
      <p className="mb-8 text-sm text-[var(--color-muted)]">
        早押し4択。お互いの単語帳から出題され、先に正解した方がポイントを取ります。
      </p>

      {error && (
        <p className="mb-6 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-bold">使う単語帳</h2>
        {projectsLoading ? (
          <p className="text-sm text-[var(--color-muted)]">読み込み中...</p>
        ) : projects.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">
            単語帳がありません。先に単語帳を作成してください。
          </p>
        ) : (
          <select
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            className="w-full rounded-xl border-2 border-[var(--color-foreground)] bg-[var(--color-surface)] p-3 font-semibold"
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </select>
        )}
      </section>

      <section className="mb-8 grid grid-cols-2 gap-4">
        <div>
          <h2 className="mb-3 text-sm font-bold">問題数</h2>
          <div className="flex gap-2">
            {QUESTION_COUNT_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setQuestionCount(option)}
                className={`flex-1 rounded-xl border-2 py-2 text-sm font-semibold ${
                  questionCount === option
                    ? 'border-[var(--color-foreground)] bg-[var(--color-foreground)] text-white'
                    : 'border-[var(--color-foreground)]'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
        <div>
          <h2 className="mb-3 text-sm font-bold">制限時間</h2>
          <div className="flex gap-2">
            {ROUND_DURATION_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRoundDurationMs(option.value)}
                className={`flex-1 rounded-xl border-2 py-2 text-sm font-semibold ${
                  roundDurationMs === option.value
                    ? 'border-[var(--color-foreground)] bg-[var(--color-foreground)] text-white'
                    : 'border-[var(--color-foreground)]'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      <button
        type="button"
        onClick={startRandomMatch}
        disabled={busy || !selectedProject}
        className="mb-8 w-full rounded-xl bg-[var(--color-foreground)] py-4 text-lg font-bold text-white disabled:opacity-50"
      >
        ランダムマッチ
      </button>

      <section className="rounded-2xl border-2 border-[var(--color-foreground)] p-5">
        <h2 className="mb-4 text-sm font-bold">フレンド対戦</h2>

        <button
          type="button"
          onClick={createFriendRoom}
          disabled={busy || !selectedProject}
          className="mb-4 w-full rounded-xl border-2 border-[var(--color-foreground)] py-3 font-semibold disabled:opacity-50"
        >
          招待コードを作る
        </button>

        <div className="flex gap-2">
          <input
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
            placeholder="コードを入力"
            maxLength={8}
            inputMode="text"
            autoCapitalize="characters"
            className="min-w-0 flex-1 rounded-xl border-2 border-[var(--color-foreground)] bg-[var(--color-surface)] p-3 text-center font-mono text-lg font-bold tracking-[0.2em]"
          />
          <button
            type="button"
            onClick={joinFriendRoom}
            disabled={busy || !selectedProject || joinCode.length === 0}
            className="rounded-xl bg-[var(--color-foreground)] px-5 font-semibold text-white disabled:opacity-50"
          >
            参加
          </button>
        </div>
      </section>
    </main>
  );
}
