'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { StackedBar } from '@/components/project/WordStatusBar';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { usePageScrolled } from '@/hooks/use-page-scrolled';
import { getRepository } from '@/lib/db';
import { getGuestUserId } from '@/lib/utils';
import { invalidateHomeCache } from '@/lib/home-cache';
import { getWordsByProjectMap } from '@/lib/projects/load-helpers';
import { summarizeWordMemory } from '@/lib/words/memory';
import { normalizeBinder, thumbColor } from '@/lib/binders/display';
import type { Project, SubscriptionStatus } from '@/types';

// バインダー (フォルダ) 詳細。中の単語帳を進捗つきで一覧し、そこから
// クイズ / フラッシュカード / 単語帳の追加を行う。マイ単語帳と同じ配色のタイルを使う。
// アイコン・名前・共有ライブラリへの公開は右上の設定ページ (./settings) にある。

/** 単語帳1冊ぶんの学習度。バーを出すためだけの集計。 */
type ProjectProgress = { total: number; mastered: number; active: number; learning: number; unlearned: number };

const EMPTY_PROGRESS: ProjectProgress = { total: 0, mastered: 0, active: 0, learning: 0, unlearned: 0 };

export default function BinderDetailPage({ params }: { params: Promise<{ name: string }> }) {
  const { name: rawName } = use(params);
  const binderName = decodeURIComponent(rawName);
  const router = useRouter();
  const { user, subscription } = useAuth();
  const { showToast } = useToast();
  const pageScrolled = usePageScrolled();

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);

  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** 単語帳ID -> 学習度。語の読み込みは一覧より遅れて入るので別状態に持つ。 */
  const [progressByProject, setProgressByProject] = useState<Record<string, ProjectProgress>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const userId = user ? user.id : getGuestUserId();
      setProjects(await repository.getProjects(userId));
    } catch {
      setProjects([]);
    } finally {
      setLoading(false);
    }
  }, [repository, user]);

  useEffect(() => {
    void load();
  }, [load]);

  const inBinder = useMemo(
    () => projects.filter((p) => normalizeBinder(p.binder) === binderName),
    [projects, binderName],
  );
  const addable = useMemo(
    () => projects.filter((p) => normalizeBinder(p.binder) !== binderName),
    [projects, binderName],
  );

  // 進捗バーのための語数。バインダーに入っている単語帳のぶんだけ引く。
  // Hybrid リポジトリなら getAllWordsByProjectIds で1往復にまとまる。
  const inBinderIds = useMemo(() => inBinder.map((p) => p.id).join(','), [inBinder]);
  useEffect(() => {
    const ids = inBinderIds ? inBinderIds.split(',') : [];
    if (ids.length === 0) {
      setProgressByProject({});
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const wordsByProject = await getWordsByProjectMap(repository, ids);
        if (cancelled) return;
        const next: Record<string, ProjectProgress> = {};
        for (const id of ids) {
          const summary = summarizeWordMemory(wordsByProject[id] ?? []);
          next[id] = {
            total: summary.total,
            mastered: summary.mastered,
            active: summary.active,
            learning: summary.learning,
            unlearned: summary.unlearned,
          };
        }
        setProgressByProject(next);
      } catch {
        // 進捗は飾りなので、取れなければバー無しのまま一覧を出す
      }
    })();
    return () => { cancelled = true; };
  }, [inBinderIds, repository]);

  // バインダー全体の学習度。単語帳ごとの集計を足し合わせる
  // (全語をまとめて summarizeWordMemory に渡すと、複数の単語帳にある同じ見出し語が
  //  1語に畳まれて総語数が実際より減ってしまう)。
  const binderProgress = useMemo(() => {
    return inBinder.reduce<ProjectProgress>((acc, project) => {
      const p = progressByProject[project.id];
      if (!p) return acc;
      return {
        total: acc.total + p.total,
        mastered: acc.mastered + p.mastered,
        active: acc.active + p.active,
        learning: acc.learning + p.learning,
        unlearned: acc.unlearned + p.unlearned,
      };
    }, EMPTY_PROGRESS);
  }, [inBinder, progressByProject]);

  const binderHref = `/binder/${encodeURIComponent(binderName)}`;
  const hasWords = binderProgress.total > 0;
  const studyQuery = `binder=${encodeURIComponent(binderName)}&from=${encodeURIComponent(binderHref)}`;

  const setBinder = async (projectId: string, binder: string | null, failMessage: string) => {
    if (busyId) return;
    setBusyId(projectId);
    try {
      await repository.updateProject(projectId, { binder });
      setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, binder } : p)));
      invalidateHomeCache();
    } catch {
      showToast({ message: failMessage, type: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="relative mx-auto min-h-screen w-full max-w-[560px] bg-[var(--color-background)] px-[18px] pb-32 font-[var(--font-body)] lg:max-w-[720px] lg:px-8">
      {/* Header: スクロールしても上部に固定 (/project/* 等と同じパターン)。
          ノッチ帯は全体共通の StatusBarCover が覆う */}
      <header
        className={`sticky z-40 -mx-[18px] flex items-center gap-2 border-b-2 bg-[var(--color-background)]/95 px-[18px] py-2.5 backdrop-blur-md lg:-mx-8 lg:px-8 ${pageScrolled ? 'border-[var(--solid-ink)]' : 'border-transparent'}`}
        style={{ top: 'env(safe-area-inset-top, 0px)' }}
      >
        <button
          type="button"
          onClick={() => (typeof window !== 'undefined' && window.history.length > 1 ? router.back() : router.push('/'))}
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[19px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
          aria-label="戻る"
        >
          <Icon name="chevron_left" size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">BINDER</div>
          <div className="flex items-center gap-1.5">
            <Icon name="folder" size={18} filled className="shrink-0 text-[var(--solid-ink)]" />
            <span className="truncate font-display text-xl font-extrabold text-[var(--solid-ink)]">{binderName}</span>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-[var(--color-muted)]">{inBinder.length}冊</span>
          </div>
        </div>
        <Link
          href={`${binderHref}/settings`}
          aria-label="バインダーの設定"
          className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[19px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] no-underline transition-all duration-100 active:translate-x-px active:translate-y-px"
        >
          <Icon name="settings" size={17} />
        </Link>
      </header>

      {/* バインダー全体の学習度。単語帳詳細と同じ内訳バーを使う */}
      {hasWords && (
        <section className="mt-3.5 rounded-[14px] border-2 border-[var(--solid-ink)] bg-white p-3.5">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="font-mono text-[9.5px] font-bold tracking-[0.06em] text-[var(--color-muted)]">
              BINDER PROGRESS
            </span>
            <span className="font-mono text-[11px] tabular-nums text-[var(--color-muted)]">
              {binderProgress.total}語
            </span>
          </div>
          <StackedBar
            total={binderProgress.total}
            m={binderProgress.mastered}
            a={binderProgress.active}
            l={binderProgress.learning}
            n={binderProgress.unlearned}
          />
        </section>
      )}

      <div className="pt-3.5">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-[var(--color-muted)]">
            <Icon name="progress_activity" size={20} className="animate-spin" />
            <span className="ml-2 text-sm">読み込み中...</span>
          </div>
        ) : inBinder.length === 0 ? (
          <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white p-5 text-center">
            <p className="m-0 text-[13px] leading-[1.8] text-[var(--solid-ink)]">
              このバインダーにはまだ単語帳がありません。「単語帳を追加」から入れましょう。
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {inBinder.map((project) => (
              <BinderProjectRow
                key={project.id}
                project={project}
                progress={progressByProject[project.id]}
                disabled={busyId !== null}
                onRemove={() => void setBinder(project.id, null, '解除に失敗しました')}
              />
            ))}
          </div>
        )}
      </div>

      {/* 下部固定バー: クイズ / フラッシュカード / 単語帳の追加。
          /project/* の3ボタンと同じ組み方 (影は2pxずらした絶対配置の黒い面)。
          クイズとフラッシュカードはバインダー内の単語帳をまとめて出す。 */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-[var(--solid-ink)] bg-[var(--color-background)]/95 backdrop-blur-md"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
      >
        <div className="mx-auto flex w-full max-w-[560px] items-center gap-2 px-[18px] pt-3 lg:max-w-[720px] lg:px-8">
          <div className="relative flex-1">
            <div className="pointer-events-none absolute inset-0 rounded-[10px] bg-[var(--solid-ink)]" style={{ transform: 'translate(2px, 2px)' }} />
            {hasWords ? (
              <Link
                href={`/quiz/all?${studyQuery}`}
                className="relative flex h-[44px] w-full items-center justify-center gap-1.5 rounded-[10px] border-2 border-[var(--color-accent)] bg-[var(--color-accent)] text-[13px] font-bold text-white no-underline transition-all duration-100 active:translate-x-px active:translate-y-px"
              >
                <Icon name="check" size={14} />
                クイズを始める
              </Link>
            ) : (
              <span className="relative flex h-[44px] w-full items-center justify-center gap-1.5 rounded-[10px] border-2 border-[var(--color-accent)] bg-[var(--color-accent)] text-[13px] font-bold text-white opacity-40">
                <Icon name="check" size={14} />
                クイズを始める
              </span>
            )}
          </div>
          <div className="relative h-[44px] w-[44px] flex-none">
            <div className="pointer-events-none absolute inset-0 rounded-[10px] bg-[var(--solid-ink)]" style={{ transform: 'translate(2px, 2px)' }} />
            {hasWords ? (
              <Link
                href={`/flashcard/all?${studyQuery}`}
                aria-label="フラッシュカード"
                className="relative flex h-full w-full items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] no-underline transition-all duration-100 active:translate-x-px active:translate-y-px"
              >
                <Icon name="style" size={18} />
              </Link>
            ) : (
              <span
                aria-label="フラッシュカード"
                className="relative flex h-full w-full items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] opacity-40"
              >
                <Icon name="style" size={18} />
              </span>
            )}
          </div>
          <div className="relative h-[44px] w-[44px] flex-none">
            <div className="pointer-events-none absolute inset-0 rounded-[10px] bg-[var(--solid-ink)]" style={{ transform: 'translate(2px, 2px)' }} />
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              aria-label="単語帳を追加"
              className="relative flex h-full w-full items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
            >
              <Icon name="add" size={20} />
            </button>
          </div>
        </div>
      </div>

      {/* 単語帳を追加するピッカー */}
      {addOpen && (
        <div className="fixed inset-0 z-[80]" style={{ fontFamily: 'var(--font-body)' }}>
          <div className="absolute inset-0" style={{ background: 'rgba(26,26,26,0.45)' }} onClick={() => setAddOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 mx-auto max-w-[560px] rounded-t-[20px] border-2 border-[var(--solid-ink)] bg-[var(--color-background)]" style={{ maxHeight: '78dvh' }}>
            <div className="flex items-center justify-between border-b-2 border-[var(--color-border)] px-4 py-3">
              <span className="font-display text-[15px] font-extrabold text-[var(--solid-ink)]">バインダーに追加</span>
              <button type="button" onClick={() => setAddOpen(false)} aria-label="閉じる" className="flex h-8 w-8 items-center justify-center text-[var(--color-secondary-text)]">
                <Icon name="close" size={18} />
              </button>
            </div>
            <div className="overflow-y-auto p-3" style={{ maxHeight: 'calc(78dvh - 52px)' }}>
              {addable.length === 0 ? (
                <p className="m-0 px-2 py-8 text-center text-[13px] text-[var(--color-muted)]">追加できる単語帳がありません。</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {addable.map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => void setBinder(project.id, binderName, '追加に失敗しました')}
                      disabled={busyId !== null}
                      className="flex items-center gap-3 rounded-[12px] border-2 border-[var(--solid-ink)] bg-white p-2.5 text-left transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-50"
                    >
                      <span
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[8px] border-2 border-[var(--solid-ink)] bg-cover bg-center font-display text-[14px] font-extrabold text-white"
                        style={{ backgroundColor: thumbColor(project.id), backgroundImage: project.iconImage ? `url(${project.iconImage})` : undefined }}
                      >
                        {!project.iconImage && project.title.charAt(0)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-bold text-[var(--solid-ink)]">{project.title}</span>
                        {normalizeBinder(project.binder) && (
                          <span className="block truncate font-mono text-[9px] text-[var(--color-muted)]">現在: {normalizeBinder(project.binder)}</span>
                        )}
                      </span>
                      <Icon name="add" size={17} className="shrink-0 text-[var(--solid-ink)]" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// バインダー内の単語帳の1行。右端の「...」から「バインダーから外す」を実行する
// (以前はバツボタン直押しで解除していたが、一覧の他行と同じ「...」メニューに統一)
function BinderProjectRow({
  project,
  progress,
  disabled,
  onRemove,
}: {
  project: Project;
  /** 語の読み込みが済むまでは undefined。その間はバーを出さない。 */
  progress: ProjectProgress | undefined;
  disabled: boolean;
  onRemove: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const masteredPct = progress && progress.total > 0
    ? Math.round((progress.mastered / progress.total) * 100)
    : 0;

  return (
    <div className="relative flex items-center gap-3 rounded-[14px] border-2 border-[var(--solid-ink)] bg-white p-[13px]">
      <Link href={`/project/${project.id}`} className="flex min-w-0 flex-1 items-center gap-3 no-underline">
        <span
          className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-cover bg-center font-display text-[18px] font-extrabold text-white"
          style={{ backgroundColor: thumbColor(project.id), backgroundImage: project.iconImage ? `url(${project.iconImage})` : undefined }}
        >
          {!project.iconImage && project.title.charAt(0)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-[var(--solid-ink)]">{project.title}</span>
          {/* ホームの単語帳タイルと同じ習得率バー。0語の単語帳には出さない */}
          {progress && progress.total > 0 && (
            <>
              <span className="mt-0.5 flex items-baseline gap-1.5">
                <span className="font-mono text-[10px] tabular-nums text-[var(--color-muted)]">{progress.total}語</span>
                <span className="font-mono text-[10px] tabular-nums text-[var(--color-muted)]">習得{masteredPct}%</span>
              </span>
              <span className="mt-1 block h-[5px] overflow-hidden rounded-full bg-[var(--color-border)]">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${masteredPct}%`, background: 'var(--color-success)' }}
                />
              </span>
            </>
          )}
        </span>
      </Link>
      <button
        type="button"
        onClick={() => setMenuOpen(true)}
        disabled={disabled}
        aria-label={`「${project.title}」のメニュー`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-50"
      >
        <Icon name="more_horiz" size={17} />
      </button>
      {menuOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[70] cursor-default bg-transparent"
            aria-label="メニューを閉じる"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute right-[13px] top-[54px] z-[71] w-[190px] overflow-hidden rounded-[14px] border-2 border-[var(--solid-ink)] bg-white shadow-[2px_3px_0_var(--solid-ink)]">
            <button
              type="button"
              onClick={() => { setMenuOpen(false); onRemove(); }}
              className="flex w-full items-center gap-2 px-3.5 py-3 text-left text-[13px] font-bold active:bg-[var(--color-surface-secondary)]"
              style={{ color: 'var(--color-error, #cc4d59)' }}
            >
              <Icon name="folder_off" size={15} />
              バインダーから外す
            </button>
          </div>
        </>
      )}
    </div>
  );
}
