'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useProjects } from '@/hooks/use-projects';
import { Icon } from '@/components/ui/Icon';
import {
  BattleInviteCode,
  BattleModeTabs,
  BattleNotice,
  BattleRuleStrip,
  BattleScreen,
  BattleScreenHeader,
  BattleSetupCard,
  BattleWaitingPanel,
  type BattleLobbyMode,
} from '@/components/battle';
import {
  BATTLE_DEFAULT_QUESTION_COUNT,
  BATTLE_DEFAULT_ROUND_DURATION_MS,
  BATTLE_MATCH_POLL_INTERVAL_MS,
  normalizeInviteCode,
} from '@/lib/battle/config';
import type { BattleRoom } from '@/lib/battle/types';

/** ロビーの滞在状態。設定画面か、マッチング待ちか、フレンドの参加待ちか。 */
type LobbyStage = 'setup' | 'matching' | 'hosting';

const QUESTION_COUNT_OPTIONS = [
  { label: '5', value: 5 },
  { label: '10', value: 10 },
  { label: '20', value: 20 },
];
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
  const [mode, setMode] = useState<BattleLobbyMode>('random');
  const [stage, setStage] = useState<LobbyStage>('setup');
  const [hostedRoom, setHostedRoom] = useState<BattleRoom | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  const stageRef = useRef<LobbyStage>('setup');
  stageRef.current = stage;

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
      setStage('matching');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'マッチングに失敗しました。');
    } finally {
      setBusy(false);
    }
  }, [projectId, questionCount, roundDurationMs, postJson, router]);

  const cancelRandomMatch = useCallback(async () => {
    setStage('setup');
    await fetch('/api/battle/match', { method: 'DELETE' }).catch(() => {});
  }, []);

  // While queued, poll for the room the server paired us into.
  useEffect(() => {
    if (stage !== 'matching') return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch('/api/battle/match', { cache: 'no-store' });
        const payload = await response.json().catch(() => null);
        if (payload?.matched && payload.roomId && stageRef.current === 'matching') {
          router.push(`/battle/${payload.roomId}`);
        }
      } catch {
        // Keep waiting -- a dropped poll is not fatal.
      }
    }, BATTLE_MATCH_POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [stage, router]);

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
      setStage('hosting');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ルームの作成に失敗しました。');
    } finally {
      setBusy(false);
    }
  }, [projectId, questionCount, roundDurationMs, postJson]);

  // The host waits here until someone joins with the invite code.
  useEffect(() => {
    if (stage !== 'hosting' || !hostedRoom) return;

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
  }, [stage, hostedRoom, router]);

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
      // クリップボードが使えない環境では、表示されたコードを読んでもらう。
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

  if (stage === 'matching') {
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

  if (stage === 'hosting' && hostedRoom) {
    return (
      <BattleScreen header={header} center>
        <BattleWaitingPanel
          title="フレンドの参加を待っています"
          description="このコードを相手に伝えてください。参加した時点で自動的に対戦が始まります。"
          onCancel={() => {
            setStage('setup');
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
    // 設定は1画面に収まる短さなので、余白を上下に散らして中央に置く。
    <BattleScreen header={header} bodyClassName="py-4" center>
      {error && (
        <div className="mb-3 flex items-start gap-2 rounded-[12px] border-2 border-[var(--color-error)] bg-[var(--color-error-light)] p-3">
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

      {/* 1. どちらのモードか */}
      <BattleModeTabs value={mode} onChange={setMode} />

      {/* 2. 両モード共通の設定（1枚のカードに行として収める） */}
      <div className="mt-3">
        <BattleSetupCard
          projects={projects}
          projectId={projectId}
          projectsLoading={projectsLoading}
          onProjectChange={setProjectId}
          questionCount={questionCount}
          questionCountOptions={QUESTION_COUNT_OPTIONS}
          onQuestionCountChange={setQuestionCount}
          roundDurationMs={roundDurationMs}
          roundDurationOptions={ROUND_DURATION_OPTIONS}
          onRoundDurationChange={setRoundDurationMs}
          disabled={busy}
        />
        {!selectedProject && !projectsLoading && (
          <p className="mt-1.5 px-1 text-[11.5px] font-bold text-[var(--color-muted)]">
            対戦には単語帳が1冊以上必要です。
          </p>
        )}
      </div>

      {/* 3. 選んだモードのアクション */}
      <div className="mt-4">
        {mode === 'random' ? (
          <>
            <button
              type="button"
              onClick={startRandomMatch}
              disabled={!canStart}
              className="flex h-[58px] w-full items-center justify-center gap-2 rounded-[16px] border-2 border-[var(--color-accent-ink)] bg-[var(--color-accent)] font-display text-[16px] font-black text-white shadow-[3px_4px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px active:shadow-[2px_3px_0_var(--solid-ink)] disabled:opacity-50 disabled:shadow-none"
            >
              <Icon name="bolt" size={22} />
              マッチングを開始
            </button>
            <p className="mt-2 text-center text-[11.5px] leading-[1.6] text-[var(--color-muted)]">
              待機中の相手と自動でマッチします。
            </p>
          </>
        ) : (
          <div className="overflow-hidden rounded-[16px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)]">
            <div className="p-3">
              <button
                type="button"
                onClick={createFriendRoom}
                disabled={!canStart}
                className="flex h-[50px] w-full items-center justify-center gap-1.5 rounded-[12px] border-2 border-[var(--color-accent-ink)] bg-[var(--color-accent)] font-display text-[15px] font-bold text-white transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-50"
              >
                <Icon name="add_link" size={18} />
                招待コードを作る
              </button>
              <p className="mt-1.5 text-center text-[11px] text-[var(--color-muted)]">
                6桁のコードを相手に伝えて対戦します。
              </p>
            </div>

            <div className="flex items-center gap-2 px-3">
              <span className="h-[2px] flex-1 bg-[var(--color-border)]" />
              <span className="font-mono text-[9.5px] font-bold tracking-[0.06em] text-[var(--color-muted)]">
                または
              </span>
              <span className="h-[2px] flex-1 bg-[var(--color-border)]" />
            </div>

            <div className="flex gap-2 p-3">
              <input
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value.toUpperCase())}
                placeholder="コードを入力"
                maxLength={8}
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                aria-label="招待コード"
                className="h-[50px] min-w-0 flex-1 rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 text-center font-display text-[16px] font-black tracking-[0.2em] text-[var(--solid-ink)] placeholder:text-[13px] placeholder:font-bold placeholder:tracking-normal placeholder:text-[var(--color-muted)]"
              />
              <button
                type="button"
                onClick={joinFriendRoom}
                disabled={busy || !selectedProject || joinCode.trim().length === 0}
                className="h-[50px] shrink-0 rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-6 font-display text-[14px] font-bold text-[var(--color-surface)] transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-40"
              >
                参加
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4. ルールは補足なので小さく最後に */}
      <div className="mt-5">
        <BattleRuleStrip />
      </div>
    </BattleScreen>
  );
}
