'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useProjects } from '@/hooks/use-projects';
import { Icon } from '@/components/ui/Icon';
import {
  BattleInviteCode,
  BattleNotice,
  BattleScreen,
  BattleScreenHeader,
  BattleSegmentedField,
  BattleWaitingPanel,
  BattleWordbookField,
} from '@/components/battle';
import {
  BATTLE_DEFAULT_QUESTION_COUNT,
  BATTLE_DEFAULT_ROUND_DURATION_MS,
  BATTLE_MATCH_POLL_INTERVAL_MS,
  normalizeInviteCode,
} from '@/lib/battle/config';
import type { BattleRoom } from '@/lib/battle/types';

type LobbyMode = 'idle' | 'matching' | 'hosting';

const QUESTION_COUNT_OPTIONS = [
  { label: '5問', value: 5 },
  { label: '10問', value: 10 },
  { label: '20問', value: 20 },
];
const ROUND_DURATION_OPTIONS = [
  { label: '10秒', value: 10_000 },
  { label: '15秒', value: 15_000 },
  { label: '20秒', value: 20_000 },
];

const BATTLE_RULES = [
  { icon: 'shuffle', text: 'お互いの単語帳から交互に出題' },
  { icon: 'bolt', text: '先に正解した方が +1（誤答はその問題を失権）' },
  { icon: 'toll', text: 'コインは消費しません' },
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
  const [codeCopied, setCodeCopied] = useState(false);

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
      setCodeCopied(false);
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

  const copyInviteCode = useCallback(async () => {
    if (!hostedRoom?.inviteCode) return;
    try {
      await navigator.clipboard.writeText(hostedRoom.inviteCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch {
      // クリップボードが使えない環境ではコードを読み上げてもらう前提で何もしない。
    }
  }, [hostedRoom]);

  const header = (
    <BattleScreenHeader eyebrow="REALTIME BATTLE" title="単語対戦" backHref="/" />
  );

  if (authLoading) {
    return (
      <BattleScreen header={header} center>
        <div className="flex items-center justify-center gap-2 py-10 text-[var(--color-muted)]">
          <Icon name="progress_activity" size={20} className="animate-spin" />
          <span className="text-sm font-bold">読み込み中...</span>
        </div>
      </BattleScreen>
    );
  }

  if (!isAuthenticated) {
    return (
      <BattleScreen header={header} center>
        <BattleNotice
          icon="lock"
          title="ログインが必要です"
          description="リアルタイム対戦を始めるには、まずログインしてください。"
          action={{ label: 'ログイン', href: '/login' }}
        />
      </BattleScreen>
    );
  }

  if (!isPro) {
    return (
      <BattleScreen header={header} center>
        <BattleNotice
          icon="workspace_premium"
          title="Proプラン限定の機能です"
          description="リアルタイム対戦はProプラン限定です。対戦でコインは消費しません。"
          action={{ label: 'Proプランを見る', href: '/subscription' }}
        />
      </BattleScreen>
    );
  }

  if (mode === 'matching') {
    return (
      <BattleScreen header={header} center>
        <BattleWaitingPanel
          title="対戦相手を探しています..."
          description="見つかり次第、自動で対戦が始まります。この画面のままお待ちください。"
          onCancel={cancelRandomMatch}
        >
          <div className="rounded-[14px] border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-left">
            <div className="font-mono text-[9.5px] font-bold tracking-[0.06em] text-[var(--color-muted)]">
              MATCH SETTINGS
            </div>
            <div className="mt-1 text-[13px] font-bold text-[var(--solid-ink)]">
              {questionCount}問 · 1問{Math.round(roundDurationMs / 1000)}秒
              {selectedProject && ` · ${selectedProject.title}`}
            </div>
          </div>
        </BattleWaitingPanel>
      </BattleScreen>
    );
  }

  if (mode === 'hosting' && hostedRoom) {
    return (
      <BattleScreen header={header} center>
        <BattleWaitingPanel
          title="フレンドの参加を待っています"
          description="このコードを相手に伝えてください。参加した時点で自動的に対戦が始まります。"
          onCancel={() => {
            setMode('idle');
            setHostedRoom(null);
          }}
        >
          {hostedRoom.inviteCode && (
            <>
              <BattleInviteCode code={hostedRoom.inviteCode} />
              <button
                type="button"
                onClick={copyInviteCode}
                className="mx-auto mt-4 flex h-10 items-center justify-center gap-1.5 rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-5 font-display text-[13px] font-bold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
              >
                <Icon name={codeCopied ? 'check' : 'content_copy'} size={15} />
                {codeCopied ? 'コピーしました' : 'コードをコピー'}
              </button>
            </>
          )}
        </BattleWaitingPanel>
      </BattleScreen>
    );
  }

  const canStart = !busy && Boolean(selectedProject);

  return (
    <BattleScreen header={header} bodyClassName="pb-[130px] pt-3.5 lg:pb-10">
      {/* 何をする機能かを1枚で伝えるヒーロー */}
      <section className="relative overflow-hidden rounded-[18px] border-2 border-[var(--color-accent-ink)] bg-[var(--color-accent)] p-5 text-white shadow-[3px_4px_0_var(--solid-ink)]">
        <div className="absolute inset-y-0 left-0 w-[7px] bg-[rgba(0,0,0,0.22)]" />
        <div className="flex items-center gap-2">
          <Icon name="swords" size={22} className="drop-shadow-[1px_1px_0_rgba(0,0,0,0.25)]" />
          <h2 className="font-display text-[17px] font-black drop-shadow-[1px_1px_0_rgba(0,0,0,0.25)]">
            早押し4択でリアルタイム対戦
          </h2>
        </div>
        <ul className="mt-3 flex flex-col gap-1.5">
          {BATTLE_RULES.map((rule) => (
            <li key={rule.text} className="flex items-center gap-2 text-[12.5px] font-bold opacity-95">
              <Icon name={rule.icon} size={15} className="shrink-0" />
              {rule.text}
            </li>
          ))}
        </ul>
      </section>

      {error && (
        <div className="mt-3.5 flex items-start gap-2 rounded-[12px] border-2 border-[var(--color-error)] bg-[var(--color-error-light)] p-3">
          <Icon name="error" size={16} className="mt-[1px] shrink-0 text-[var(--color-error)]" />
          <p className="min-w-0 flex-1 text-[12.5px] font-bold leading-[1.6] text-[var(--color-error)]">
            {error}
          </p>
          <button
            type="button"
            onClick={() => setError(null)}
            aria-label="エラーを閉じる"
            className="shrink-0 text-[var(--color-error)]"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      )}

      <div className="mt-5 flex flex-col gap-4">
        <BattleWordbookField
          projects={projects}
          value={projectId}
          loading={projectsLoading}
          onChange={setProjectId}
        />

        <div className="grid grid-cols-2 gap-3">
          <BattleSegmentedField
            icon="format_list_numbered"
            label="問題数"
            options={QUESTION_COUNT_OPTIONS}
            value={questionCount}
            onChange={setQuestionCount}
            disabled={busy}
          />
          <BattleSegmentedField
            icon="timer"
            label="1問の制限時間"
            options={ROUND_DURATION_OPTIONS}
            value={roundDurationMs}
            onChange={setRoundDurationMs}
            disabled={busy}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={startRandomMatch}
        disabled={!canStart}
        className="mt-6 flex h-[58px] items-center justify-center gap-2 rounded-[16px] border-2 border-[var(--color-accent-ink)] bg-[var(--color-accent)] font-display text-[16px] font-black text-white shadow-[3px_4px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px active:shadow-[2px_3px_0_var(--solid-ink)] disabled:opacity-50 disabled:shadow-none"
      >
        <Icon name="bolt" size={22} />
        ランダムマッチを始める
      </button>
      {!selectedProject && !projectsLoading && (
        <p className="mt-2 text-center text-[11.5px] font-bold text-[var(--color-muted)]">
          対戦には単語帳が1冊以上必要です。
        </p>
      )}

      <div className="my-6 flex items-center gap-3">
        <span className="h-[2px] flex-1 bg-[var(--color-border)]" />
        <span className="font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">
          OR
        </span>
        <span className="h-[2px] flex-1 bg-[var(--color-border)]" />
      </div>

      <section className="rounded-[18px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] p-4">
        <div className="flex items-center gap-2">
          <Icon name="group" size={18} className="text-[var(--solid-ink)]" />
          <h2 className="font-display text-[15px] font-extrabold text-[var(--solid-ink)]">
            フレンド対戦
          </h2>
        </div>
        <p className="mt-1 text-[11.5px] leading-[1.6] text-[var(--color-muted)]">
          6桁の招待コードで、決まった相手とだけ対戦します。
        </p>

        <button
          type="button"
          onClick={createFriendRoom}
          disabled={!canStart}
          className="mt-3.5 flex h-12 w-full items-center justify-center gap-1.5 rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] font-display text-[14px] font-bold text-[var(--solid-ink)] shadow-[2px_3px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px active:shadow-[1px_2px_0_var(--solid-ink)] disabled:opacity-50 disabled:shadow-none"
        >
          <Icon name="add_link" size={17} />
          招待コードを作る
        </button>

        <div className="mt-3 flex gap-2">
          <input
            value={joinCode}
            onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
            placeholder="コードを入力"
            maxLength={8}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            aria-label="招待コード"
            className="min-w-0 flex-1 rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-3 text-center font-display text-[16px] font-black tracking-[0.2em] text-[var(--solid-ink)] placeholder:font-body placeholder:text-[13px] placeholder:font-bold placeholder:tracking-normal placeholder:text-[var(--color-muted)]"
          />
          <button
            type="button"
            onClick={joinFriendRoom}
            disabled={busy || !selectedProject || joinCode.trim().length === 0}
            className="shrink-0 rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-5 font-display text-[14px] font-bold text-[var(--color-surface)] transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-40"
          >
            参加
          </button>
        </div>
      </section>
    </BattleScreen>
  );
}
