'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/use-auth';
import { useProjects } from '@/hooks/use-projects';
import { BattleScreen } from '@/components/battle/BattleScreen';
import { BattleNotice } from '@/components/battle/BattleNotice';
import { BattleSettingGroup } from '@/components/battle/BattleSettingGroup';
import { BattleWordbookPicker } from '@/components/battle/BattleWordbookPicker';
import { BattleSearchingCard } from '@/components/battle/BattleSearchingCard';
import { BattleInviteCodeCard } from '@/components/battle/BattleInviteCodeCard';
import { BattleCodeInput } from '@/components/battle/BattleCodeInput';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import {
  BATTLE_DEFAULT_QUESTION_COUNT,
  BATTLE_DEFAULT_ROUND_DURATION_MS,
  BATTLE_MATCH_POLL_INTERVAL_MS,
  normalizeInviteCode,
} from '@/lib/battle/config';
import type { BattleRoom } from '@/lib/battle/types';

type LobbyMode = 'idle' | 'matching' | 'hosting';

const QUESTION_COUNT_OPTIONS = [5, 10, 20].map((value) => ({ label: `${value}問`, value }));
const ROUND_DURATION_OPTIONS = [
  { label: '10秒', value: 10_000 },
  { label: '15秒', value: 15_000 },
  { label: '20秒', value: 20_000 },
];

const BATTLE_RULES = [
  { icon: 'bolt', text: '先に正解した方が1ポイント。誤答はそのラウンド失権。' },
  { icon: 'swap_horiz', text: '出題はお互いの単語帳をマージして作られます。' },
  { icon: 'toll', text: 'コインは消費しません（Pro限定機能）。' },
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

  // 作った部屋を捨てて戻る。放置すると招待コードだけが生き残り、あとから
  // 参加した相手が誰も居ない部屋で待たされるので、必ず cancel まで通す。
  const cancelFriendRoom = useCallback(async () => {
    const room = hostedRoom;
    setMode('idle');
    setHostedRoom(null);
    if (!room || !isSupabaseConfigured()) return;
    try {
      await createClient().rpc('abandon_battle', { p_room_id: room.id });
    } catch {
      // ベストエフォート。失敗しても待機中の部屋は相手が来なければ何も起きない。
    }
  }, [hostedRoom]);

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

  const joinFriendRoom = useCallback(async (rawCode?: string) => {
    if (!projectId) return;
    const normalized = normalizeInviteCode(rawCode ?? joinCode);
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
    return (
      <BattleScreen eyebrow="WORD BATTLE" title="単語対戦" center withBottomNav>
        <div className="flex items-center justify-center gap-2 text-[var(--color-muted)]">
          <Icon name="progress_activity" size={20} className="animate-spin" />
          <span className="text-sm font-bold">読み込み中...</span>
        </div>
      </BattleScreen>
    );
  }

  if (!isAuthenticated) {
    return (
      <BattleScreen eyebrow="WORD BATTLE" title="単語対戦" center withBottomNav>
        <BattleNotice
          icon="lock"
          title="ログインが必要です"
          description="リアルタイム対戦はログインすると使えます。"
          actionLabel="ログイン"
          actionHref="/login"
        />
      </BattleScreen>
    );
  }

  if (!isPro) {
    return (
      <BattleScreen eyebrow="WORD BATTLE" title="単語対戦" center withBottomNav>
        <BattleNotice
          icon="workspace_premium"
          title="Proプラン限定の機能です"
          description="リアルタイム対戦はProプラン限定です。対戦でコインは消費しません。"
          actionLabel="Proプランを見る"
          actionHref="/pricing"
        />
      </BattleScreen>
    );
  }

  if (mode === 'matching') {
    return (
      <BattleScreen
        eyebrow="MATCHING"
        title="ランダムマッチ"
        center
        withBottomNav
        onBack={cancelRandomMatch}
      >
        <BattleSearchingCard onCancel={cancelRandomMatch} />
      </BattleScreen>
    );
  }

  if (mode === 'hosting' && hostedRoom) {
    return (
      <BattleScreen
        eyebrow="FRIEND BATTLE"
        title="招待コード"
        center
        withBottomNav
        onBack={cancelFriendRoom}
      >
        <BattleInviteCodeCard inviteCode={hostedRoom.inviteCode ?? ''} onCancel={cancelFriendRoom} />
      </BattleScreen>
    );
  }

  const ready = Boolean(selectedProject) && !busy;

  return (
    <BattleScreen eyebrow="WORD BATTLE" title="リアルタイム単語対戦" withBottomNav backHref="/">
      <div className="flex flex-col gap-6">
        {/* ルール説明。初見でも「何が起きるか」が分かるように先に置く */}
        <section className="rounded-[16px] border-2 border-[var(--solid-ink)] bg-[var(--color-accent)] p-4 text-white shadow-[2px_3px_0_var(--solid-ink)]">
          <div className="flex items-center gap-2">
            <Icon name="swords" size={20} className="drop-shadow-[1px_1px_0_rgba(0,0,0,0.25)]" />
            <h2 className="font-display text-[15px] font-black drop-shadow-[1px_1px_0_rgba(0,0,0,0.25)]">
              早押し4択で1対1
            </h2>
          </div>
          <ul className="mt-3 flex flex-col gap-1.5">
            {BATTLE_RULES.map((rule) => (
              <li key={rule.text} className="flex items-start gap-2 text-[12px] font-bold leading-[1.6] opacity-95">
                <Icon name={rule.icon} size={14} className="mt-[1px] shrink-0" />
                {rule.text}
              </li>
            ))}
          </ul>
        </section>

        {error && (
          <p
            role="alert"
            className="rounded-[12px] border-2 border-[var(--color-error)] bg-[var(--color-error-light)] p-3 text-[12.5px] font-bold text-[var(--color-error)]"
          >
            {error}
          </p>
        )}

        <section>
          <SectionHeading eyebrow="WORDBOOK" title="使う単語帳" />
          <BattleWordbookPicker
            projects={projects}
            loading={projectsLoading}
            selectedId={projectId}
            onSelect={setProjectId}
            disabled={busy}
          />
        </section>

        <section className="grid grid-cols-2 gap-2.5">
          <BattleSettingGroup
            eyebrow="ROUNDS"
            label="問題数"
            options={QUESTION_COUNT_OPTIONS}
            value={questionCount}
            onChange={setQuestionCount}
            disabled={busy}
          />
          <BattleSettingGroup
            eyebrow="TIME"
            label="制限時間"
            options={ROUND_DURATION_OPTIONS}
            value={roundDurationMs}
            onChange={setRoundDurationMs}
            disabled={busy}
          />
        </section>

        <section>
          <SectionHeading eyebrow="QUICK MATCH" title="いますぐ対戦" />
          <button
            type="button"
            onClick={startRandomMatch}
            disabled={!ready}
            className="flex h-[58px] w-full items-center justify-center gap-2 rounded-[16px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] text-[16px] font-black text-[var(--color-surface)] shadow-[2px_3px_0_var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px active:shadow-[1px_2px_0_var(--solid-ink)] disabled:opacity-50"
          >
            <Icon name="bolt" size={20} filled />
            ランダムマッチ
          </button>
          <p className="mt-2 text-center text-[11.5px] font-bold text-[var(--color-muted)]">
            同じ設定で待っている人と自動でマッチします
          </p>
        </section>

        <section>
          <SectionHeading eyebrow="FRIEND" title="フレンド対戦" />
          <div className="flex flex-col gap-4 rounded-[16px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] p-4 shadow-[2px_3px_0_var(--solid-ink)]">
            <button
              type="button"
              onClick={createFriendRoom}
              disabled={!ready}
              className="flex h-[48px] w-full items-center justify-center gap-2 rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] text-[14px] font-bold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-50"
            >
              <Icon name="qr_code_2" size={18} />
              招待コードを作る
            </button>

            <div className="flex items-center gap-3">
              <span className="h-[2px] flex-1 bg-[var(--color-border-light)]" />
              <span className="font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">
                OR
              </span>
              <span className="h-[2px] flex-1 bg-[var(--color-border-light)]" />
            </div>

            <div>
              <p className="mb-2 text-[12px] font-bold text-[var(--color-muted)]">
                もらったコードで参加する
              </p>
              <BattleCodeInput
                value={joinCode}
                onChange={setJoinCode}
                disabled={busy}
                onComplete={(code) => {
                  if (selectedProject) void joinFriendRoom(code);
                }}
              />
              <button
                type="button"
                onClick={() => joinFriendRoom()}
                disabled={!ready || joinCode.length === 0}
                className="mt-2.5 flex h-[48px] w-full items-center justify-center gap-1.5 rounded-[12px] border-2 border-[var(--color-accent-ink)] bg-[var(--color-accent)] text-[14px] font-bold text-white transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-50"
              >
                <Icon name="login" size={17} />
                参加する
              </button>
            </div>
          </div>
        </section>
      </div>
    </BattleScreen>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-2 flex items-baseline gap-2">
      <span className="font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">
        {eyebrow}
      </span>
      <h2 className="font-display text-[16px] font-extrabold text-[var(--solid-ink)]">{title}</h2>
    </div>
  );
}
