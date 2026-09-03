'use client';

import { use, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DesktopBackButton } from '@/components/desktop/DesktopChrome';
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
import { getCachedBinderIcons, loadBinderIcons } from '@/lib/binders/icons';
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
  /** バインダーのアイコン画像 (設定ページで登録)。飾りなので best-effort */
  const [iconImage, setIconImage] = useState<string | null>(() => getCachedBinderIcons()?.[binderName] ?? null);
  useEffect(() => {
    let cancelled = false;
    void loadBinderIcons().then((icons) => {
      if (!cancelled) setIconImage(icons[binderName] ?? null);
    });
    return () => { cancelled = true; };
  }, [binderName]);

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

  const masteredPct = binderProgress.total > 0 ? Math.round((binderProgress.mastered / binderProgress.total) * 100) : 0;

  return (
    <>
    {/* Desktop: 上部バー (戻る / アイコン / 名前 / クイズ / カード / 追加 / 設定) +
        本棚タイルのグリッド。右レールに学習度と「追加できる単語帳」 */}
    <div className="hidden h-full min-h-0 flex-col lg:flex">
      <div className="ds-top" style={{ gap: 12 }}>
        <DesktopBackButton fallbackHref="/" />
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-cover bg-center text-white"
          style={{ backgroundColor: thumbColor(binderName), backgroundImage: iconImage ? `url(${iconImage})` : undefined }}
          aria-hidden="true"
        >
          {!iconImage && <Icon name="folder" size={20} filled />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="crumb">BINDER · {inBinder.length}冊{hasWords ? ` · ${binderProgress.total}語` : ''}</div>
          <h1>{binderName}</h1>
        </div>
        {hasWords ? (
          <Link href={`/quiz/all?${studyQuery}`} className="ds-btn accent">
            <Icon name="check" />
            クイズを始める
          </Link>
        ) : (
          <span className="ds-btn accent" style={{ opacity: 0.4, pointerEvents: 'none' }}>
            <Icon name="check" />
            クイズを始める
          </span>
        )}
        {hasWords ? (
          <Link href={`/flashcard/all?${studyQuery}`} className="ds-btn">
            <Icon name="style" />
            カード
          </Link>
        ) : (
          <span className="ds-btn" style={{ opacity: 0.4, pointerEvents: 'none' }}>
            <Icon name="style" />
            カード
          </span>
        )}
        <button type="button" className="ds-btn" onClick={() => setAddOpen(true)}>
          <Icon name="add" />
          単語帳を追加
        </button>
        <Link href={`${binderHref}/settings`} className="ds-iconbtn-round sm" aria-label="バインダーの設定" title="バインダーの設定">
          <Icon name="settings" />
        </Link>
      </div>
      <div className="ds-scroll ds-two-col">
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '0 2px 12px' }}>
            <div>
              <div className="ds-eyebrow">BOOKS</div>
              <h2 className="ds-h2">バインダーの単語帳</h2>
            </div>
          </div>
          {loading ? (
            <div className="ds-card" style={{ padding: 42, textAlign: 'center', color: 'var(--color-muted)', boxShadow: 'none' }}>
              <Icon name="progress_activity" className="animate-spin" />
              <span style={{ marginLeft: 8 }}>読み込み中...</span>
            </div>
          ) : inBinder.length === 0 ? (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="ds-book ds-book--new"
              style={{ width: 176 }}
            >
              <Icon name="add" style={{ fontSize: 28, color: 'var(--color-ink)' }} />
              <div className="nt">単語帳を追加</div>
              <div className="ns">まだ単語帳がありません</div>
            </button>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(176px, 1fr))', gap: 14 }}>
              {inBinder.map((project) => (
                <DesktopBinderBookTile
                  key={project.id}
                  project={project}
                  progress={progressByProject[project.id]}
                  disabled={busyId !== null}
                  onRemove={() => void setBinder(project.id, null, '解除に失敗しました')}
                />
              ))}
              <button type="button" onClick={() => setAddOpen(true)} className="ds-book ds-book--new">
                <Icon name="add" style={{ fontSize: 28, color: 'var(--color-ink)' }} />
                <div className="nt">単語帳を追加</div>
                <div className="ns">{addable.length}冊から選ぶ</div>
              </button>
            </div>
          )}
        </div>
        <div className="ds-rail">
          <div className="ds-card" style={{ padding: '18px 20px' }}>
            <div className="ds-eyebrow">BINDER PROGRESS</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 800, color: 'var(--color-ink)' }}>このバインダーの学習度</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 10 }}>
              <span className="tnum" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 40, lineHeight: 1 }}>{masteredPct}</span>
              <span style={{ fontSize: 16, fontWeight: 700 }}>%</span>
              <span className="muted" style={{ marginLeft: 4, fontSize: 11 }}>習得済 · {binderProgress.total}語</span>
            </div>
            <div style={{ marginTop: 12 }}>
              <StackedBar
                total={binderProgress.total}
                m={binderProgress.mastered}
                a={binderProgress.active}
                l={binderProgress.learning}
                n={binderProgress.unlearned}
              />
            </div>
          </div>
          {addable.length > 0 && (
            <div className="ds-card" style={{ padding: '16px 18px', boxShadow: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <div>
                  <div className="ds-eyebrow">ADD</div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 800, color: 'var(--color-ink)' }}>追加できる単語帳</div>
                </div>
                <button type="button" className="ds-see-all" onClick={() => setAddOpen(true)}>
                  すべて見る
                  <Icon name="chevron_right" />
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {addable.slice(0, 6).map((project) => (
                  <div key={project.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: '1px solid var(--color-border)' }}>
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border-2 border-[var(--solid-ink)] bg-cover bg-center font-display text-[13px] font-extrabold text-white"
                      style={{ backgroundColor: thumbColor(project.id), backgroundImage: project.iconImage ? `url(${project.iconImage})` : undefined }}
                    >
                      {!project.iconImage && project.title.charAt(0)}
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span className="block truncate text-[12.5px] font-bold text-[var(--solid-ink)]">{project.title}</span>
                      {normalizeBinder(project.binder) && (
                        <span className="block truncate text-[10px] text-[var(--color-muted)]">現在: {normalizeBinder(project.binder)}</span>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => void setBinder(project.id, binderName, '追加に失敗しました')}
                      disabled={busyId !== null}
                      className="ds-iconbtn-round sm"
                      style={{ width: 30, height: 30 }}
                      aria-label={`「${project.title}」を追加`}
                      title="このバインダーに追加"
                    >
                      <Icon name="add" size={15} />
                    </button>
                  </div>
                ))}
                {addable.length > 6 && (
                  <p className="muted" style={{ margin: '8px 0 0', textAlign: 'center', fontSize: 11, fontWeight: 700 }}>ほか {addable.length - 6} 冊</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Mobile */}
    <div className="relative mx-auto min-h-screen w-full max-w-[560px] bg-[var(--color-background)] px-[18px] pb-32 font-[var(--font-body)] lg:hidden">
      {/* Header: スクロールしても上部に固定 (/project/* 等と同じパターン)。
          ノッチ帯は全体共通の StatusBarCover が覆う */}
      <header
        className={`sticky z-40 -mx-[18px] flex items-center gap-2 border-b-2 bg-[var(--color-background)]/95 px-[18px] py-2.5 backdrop-blur-md ${pageScrolled ? 'border-[var(--solid-ink)]' : 'border-transparent'}`}
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

      {/* バインダー全体の学習度。ヘッダと地続きに見せたいので枠は持たない。
          固定はせず、スクロールすればヘッダだけが残る。 */}
      {hasWords && (
        <section className="pb-3.5 pt-1.5">
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

      <div>
        {loading ? (
          <div className="flex items-center justify-center py-16 text-[var(--color-muted)]">
            <Icon name="progress_activity" size={20} className="animate-spin" />
            <span className="ml-2 text-sm">読み込み中...</span>
          </div>
        ) : inBinder.length === 0 ? (
          <div className="mt-3.5 rounded-xl border-2 border-[var(--solid-ink)] bg-white p-5 text-center">
            <p className="m-0 text-[13px] leading-[1.8] text-[var(--solid-ink)]">
              このバインダーにはまだ単語帳がありません。「単語帳を追加」から入れましょう。
            </p>
          </div>
        ) : (
          /* 1冊ずつ枠で囲わず、上下の境界線だけで区切る音楽アプリ風の並び。
             線は画面幅いっぱいに引きたいので、行も -mx で端まで抜く */
          <div className="-mx-[18px] divide-y divide-[var(--color-border)] border-b border-[var(--color-border)]">
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
        <div className="mx-auto flex w-full max-w-[560px] items-center gap-2 px-[18px] pt-3">
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

    </div>

      {/* 単語帳を追加するピッカー */}
      {addOpen && (
        <div className="fixed inset-0 z-[80]" style={{ fontFamily: 'var(--font-body)' }}>
          <div className="absolute inset-0" style={{ background: 'rgba(26,26,26,0.45)' }} onClick={() => setAddOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 mx-auto max-w-[560px] rounded-t-[20px] border-2 border-[var(--solid-ink)] bg-[var(--color-background)] lg:inset-auto lg:left-1/2 lg:top-1/2 lg:w-[480px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[20px] lg:shadow-[6px_8px_0_var(--solid-ink)]" style={{ maxHeight: '78dvh' }}>
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
    </>
  );
}

// デスクトップ: バインダー内の単語帳をホームと同じ正方形タイルで並べる。
// 右下の再生でその単語帳のクイズ、右上の小ボタンでバインダーから外す。
function DesktopBinderBookTile({
  project,
  progress,
  disabled,
  onRemove,
}: {
  project: Project;
  progress: ProjectProgress | undefined;
  disabled: boolean;
  onRemove: () => void;
}) {
  const total = progress?.total ?? 0;
  const pct = progress && progress.total > 0 ? Math.round((progress.mastered / progress.total) * 100) : 0;
  return (
    <div style={{ position: 'relative' }}>
      <Link
        href={`/project/${project.id}`}
        className="ds-book"
        style={{
          background: project.iconImage ? undefined : thumbColor(project.id),
          backgroundImage: project.iconImage ? `url(${project.iconImage})` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="bk-spine" />
        <div className="bk-title" style={{ paddingLeft: 0, paddingRight: 28 }}>{project.title}</div>
        <div>
          <div className="bk-n">{total}<span className="u">語</span></div>
          <div className="bk-bar"><i style={{ width: `${pct}%` }} /></div>
        </div>
      </Link>
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label={`「${project.title}」をバインダーから外す`}
        title="バインダーから外す"
        className="ds-iconbtn-round sm"
        style={{ position: 'absolute', top: 8, right: 8, width: 28, height: 28, zIndex: 2 }}
      >
        <Icon name="folder_off" size={14} />
      </button>
      {total > 0 && (
        <Link
          href={`/quiz/${project.id}?from=${encodeURIComponent(`/binder/${encodeURIComponent(normalizeBinder(project.binder))}`)}`}
          className="ds-book-play"
          aria-label={`${project.title}のクイズを開始`}
          title="クイズを開始"
        >
          <Icon name="play_arrow" size={18} filled />
        </Link>
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
    <div className="relative flex items-center gap-3 px-[18px] py-3 lg:px-8">
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
        className="flex h-9 w-9 shrink-0 items-center justify-center text-[var(--solid-ink)] transition-opacity duration-100 active:opacity-60 disabled:opacity-50"
      >
        <Icon name="more_horiz" size={20} />
      </button>
      {menuOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[70] cursor-default bg-transparent"
            aria-label="メニューを閉じる"
            onClick={() => setMenuOpen(false)}
          />
          {/* 行の高さは進捗バーの有無で変わるので、下端を基準に置く */}
          <div className="absolute right-[18px] top-full z-[71] w-[190px] overflow-hidden rounded-[14px] border-2 border-[var(--solid-ink)] bg-white shadow-[2px_3px_0_var(--solid-ink)] lg:right-8">
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
