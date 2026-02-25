'use client';

import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AppShell, Icon } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { getRepository } from '@/lib/db';
import { remoteRepository } from '@/lib/db/remote-repository';
import { getGuestUserId } from '@/lib/utils';
import type { Project, SubscriptionStatus, Word } from '@/types';

// ── Part-of-speech badge colors ──────────────────────────────────
const POS_COLORS: Record<string, { bg: string; text: string; darkBg: string; darkText: string }> = {
  noun:        { bg: '#dbeafe', text: '#1e40af', darkBg: '#1e3a5f', darkText: '#93c5fd' },
  verb:        { bg: '#dcfce7', text: '#166534', darkBg: '#14291e', darkText: '#86efac' },
  adjective:   { bg: '#fef3c7', text: '#92400e', darkBg: '#2e2a1a', darkText: '#fcd34d' },
  adverb:      { bg: '#fce7f3', text: '#9d174d', darkBg: '#2e1a24', darkText: '#f9a8d4' },
  preposition: { bg: '#e0e7ff', text: '#3730a3', darkBg: '#1e1b4b', darkText: '#a5b4fc' },
  conjunction: { bg: '#f3e8ff', text: '#6b21a8', darkBg: '#2e1a3e', darkText: '#d8b4fe' },
  pronoun:     { bg: '#ccfbf1', text: '#115e59', darkBg: '#0d3331', darkText: '#5eead4' },
  interjection:{ bg: '#fee2e2', text: '#991b1b', darkBg: '#2e1a1a', darkText: '#fca5a5' },
};
const DEFAULT_POS_COLOR = { bg: '#f3f4f6', text: '#374151', darkBg: '#283039', darkText: '#d1d5db' };

function getPosColor(tag: string) {
  const key = tag.toLowerCase();
  for (const [k, v] of Object.entries(POS_COLORS)) {
    if (key.includes(k)) return v;
  }
  return DEFAULT_POS_COLOR;
}

// ── Register badge helper ────────────────────────────────────────
function getRegisterStyle(register?: string) {
  if (!register) return null;
  const r = register.toLowerCase();
  if (r.includes('formal')) return { borderColor: '#6366f1', color: '#6366f1', bg: 'rgba(99,102,241,0.08)' };
  if (r.includes('casual') || r.includes('informal')) return { borderColor: '#f59e0b', color: '#b45309', bg: 'rgba(245,158,11,0.08)' };
  if (r.includes('slang')) return { borderColor: '#ef4444', color: '#dc2626', bg: 'rgba(239,68,68,0.08)' };
  if (r.includes('academic') || r.includes('technical')) return { borderColor: '#8b5cf6', color: '#7c3aed', bg: 'rgba(139,92,246,0.08)' };
  return { borderColor: '#9ca3af', color: '#6b7280', bg: 'rgba(107,114,128,0.08)' };
}

// ── Status badge ─────────────────────────────────────────────────
function StatusBadge({ status }: { status: Word['status'] }) {
  const config = {
    mastered: { label: '習得済み', icon: 'check_circle' as const, cls: 'text-[var(--color-success)]' },
    review:   { label: '復習中',   icon: 'refresh' as const,      cls: 'text-[var(--color-warning)]' },
    new:      { label: '未学習',   icon: 'fiber_new' as const,    cls: 'text-[var(--color-muted)]' },
  }[status];
  return (
    <span className={`inline-flex items-center gap-1 text-[0.6875rem] font-semibold ${config.cls}`}>
      <Icon name={config.icon} size={13} />
      {config.label}
    </span>
  );
}

// ═════════════════════════════════════════════════════════════════
// Main Page
// ═════════════════════════════════════════════════════════════════

export default function WordInsightsPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const { user, subscription, isPro, loading: authLoading } = useAuth();

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
  const repository = useMemo(() => getRepository(subscriptionStatus, wasPro), [subscriptionStatus, wasPro]);

  const [project, setProject] = useState<Project | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);

  // ── Swipe / animation state ──
  const [swipeX, setSwipeX] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [slideDirection, setSlideDirection] = useState<'left' | 'right' | null>(null);
  const [slidePhase, setSlidePhase] = useState<'exit' | 'enter' | null>(null);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isSwiping = useRef(false);

  // ── Load data ──
  useEffect(() => {
    if (authLoading) return;
    const load = async () => {
      try {
        const userId = user ? user.id : getGuestUserId();
        let proj = await repository.getProject(projectId);
        if (!proj && user) proj = await remoteRepository.getProject(projectId);
        if (!proj || proj.userId !== userId) { router.push('/'); return; }
        setProject(proj);

        let wordList = await repository.getWords(projectId);
        if (wordList.length === 0 && user) {
          try { wordList = await remoteRepository.getWords(projectId); } catch { /* noop */ }
        }
        setWords(wordList);
      } catch { router.push('/'); } finally { setLoading(false); }
    };
    void load();
  }, [authLoading, projectId, repository, router, user]);

  // ── Ensure index valid ──
  useEffect(() => {
    if (currentIndex >= words.length && words.length > 0) setCurrentIndex(words.length - 1);
  }, [words.length, currentIndex]);

  const currentWord = words[currentIndex];

  // ── Navigation ──
  const handleNext = useCallback((withAnimation = false) => {
    if (isAnimating || words.length === 0) return;
    const next = currentIndex < words.length - 1 ? currentIndex + 1 : 0;
    if (withAnimation) {
      setIsAnimating(true); setSlideDirection('left'); setSlidePhase('exit');
      setTimeout(() => {
        setCurrentIndex(next); setSlidePhase('enter');
        requestAnimationFrame(() => { requestAnimationFrame(() => {
          setSlidePhase(null);
          setTimeout(() => { setSlideDirection(null); setIsAnimating(false); }, 200);
        }); });
      }, 200);
    } else setCurrentIndex(next);
  }, [isAnimating, currentIndex, words.length]);

  const handlePrev = useCallback((withAnimation = false) => {
    if (isAnimating || words.length === 0) return;
    const prev = currentIndex > 0 ? currentIndex - 1 : words.length - 1;
    if (withAnimation) {
      setIsAnimating(true); setSlideDirection('right'); setSlidePhase('exit');
      setTimeout(() => {
        setCurrentIndex(prev); setSlidePhase('enter');
        requestAnimationFrame(() => { requestAnimationFrame(() => {
          setSlidePhase(null);
          setTimeout(() => { setSlideDirection(null); setIsAnimating(false); }, 200);
        }); });
      }, 200);
    } else setCurrentIndex(prev);
  }, [isAnimating, currentIndex, words.length]);

  // ── Touch handlers ──
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isSwiping.current = false;
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (isAnimating) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) { isSwiping.current = true; setSwipeX(dx); }
  };
  const handleTouchEnd = () => {
    if (isAnimating) return;
    if (swipeX < -80) handleNext(true);
    else if (swipeX > 80) handlePrev(true);
    setSwipeX(0);
    setTimeout(() => { isSwiping.current = false; }, 50);
  };

  // ── Keyboard navigation ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isAnimating) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); handlePrev(true); }
      if (e.key === 'ArrowRight') { e.preventDefault(); handleNext(true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isAnimating, handleNext, handlePrev]);

  // ── Speech synthesis ──
  const speakWord = () => {
    if (!currentWord?.english || typeof window === 'undefined') return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(currentWord.english);
    u.lang = 'en-US'; u.rate = 0.9;
    window.speechSynthesis.speak(u);
  };

  // ── Dictionary ──
  const openDictionary = () => {
    if (currentWord?.english)
      window.open(`https://eow.alc.co.jp/search?q=${encodeURIComponent(currentWord.english)}`, '_blank');
  };

  // ── Card transform ──
  const getCardTransform = () => {
    if (slidePhase === 'exit') return slideDirection === 'left' ? 'translateX(-120%)' : 'translateX(120%)';
    if (slidePhase === 'enter') return slideDirection === 'left' ? 'translateX(120%)' : 'translateX(-120%)';
    if (swipeX !== 0) return `translateX(${swipeX}px) rotate(${swipeX * 0.015}deg)`;
    return 'translateX(0)';
  };

  // ═══ Render ═══

  if (loading || authLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Icon name="progress_activity" size={24} className="animate-spin text-[var(--color-muted)]" />
        </div>
      </AppShell>
    );
  }

  if (!project) {
    return (
      <AppShell>
        <div className="max-w-3xl mx-auto px-4 py-8">
          <p className="text-sm text-[var(--color-muted)]">単語帳が見つかりません。</p>
        </div>
      </AppShell>
    );
  }

  if (!isPro) {
    return (
      <AppShell>
        <div className="max-w-lg mx-auto px-4 py-8 space-y-4">
          <Link
            href={`/project/${projectId}`}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
          >
            <Icon name="arrow_back" size={18} />
            単語帳へ戻る
          </Link>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center">
            <Icon name="lock" size={32} className="text-[var(--color-muted)] mx-auto mb-3" />
            <p className="font-semibold text-[var(--color-foreground)]">単語解説はPro機能です</p>
            <p className="text-xs text-[var(--color-muted)] mt-1">関連語・語法の表示にはPro登録が必要です。</p>
            <Link
              href="/subscription"
              className="inline-flex mt-4 px-4 py-2.5 rounded-lg bg-[var(--color-primary)] text-white text-sm font-semibold"
            >
              Proを確認
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  if (words.length === 0) {
    return (
      <AppShell>
        <div className="max-w-lg mx-auto px-4 py-8 space-y-4">
          <Link
            href={`/project/${projectId}`}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
          >
            <Icon name="arrow_back" size={18} />
            単語帳へ戻る
          </Link>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center">
            <Icon name="menu_book" size={32} className="text-[var(--color-muted)] mx-auto mb-3" />
            <p className="text-sm text-[var(--color-muted)]">単語がありません。</p>
          </div>
        </div>
      </AppShell>
    );
  }

  const hasInsights = Boolean(
    (currentWord.partOfSpeechTags?.length ?? 0) > 0
    || (currentWord.relatedWords?.length ?? 0) > 0
    || (currentWord.usagePatterns?.length ?? 0) > 0
  );

  return (
    <AppShell>
      <div className="max-w-lg mx-auto px-4 py-4 pb-28 lg:pb-8 space-y-4">
        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <Link
            href={`/project/${projectId}`}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)] transition-colors"
          >
            <Icon name="arrow_back" size={18} />
            <span className="hidden sm:inline">{project.title}</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[var(--color-muted)] tabular-nums">
              {currentIndex + 1} / {words.length}
            </span>
          </div>
        </div>

        {/* ── Notebook card (swipeable area) ── */}
        <div
          className="relative overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div
            style={{
              transform: getCardTransform(),
              transition: slidePhase === 'exit' ? 'transform 200ms ease-out' : slidePhase === 'enter' ? 'none' : swipeX !== 0 ? 'none' : 'transform 200ms ease-out',
            }}
          >
            <div className="notebook-card">
              {/* ── Card top bar: actions ── */}
              <div className="flex items-center justify-between px-5 pt-4 pb-2 relative z-10">
                <StatusBadge status={currentWord.status} />
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={speakWord}
                    className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-muted)]"
                    aria-label="発音を聞く"
                  >
                    <Icon name="volume_up" size={18} />
                  </button>
                  <button
                    onClick={openDictionary}
                    className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-[var(--color-muted)]"
                    aria-label="辞書で調べる"
                  >
                    <Icon name="menu_book" size={18} />
                  </button>
                  {currentWord.isFavorite && (
                    <span className="w-8 h-8 rounded-full flex items-center justify-center text-[var(--color-error)]">
                      <Icon name="flag" size={18} filled />
                    </span>
                  )}
                </div>
              </div>

              {/* ── Notebook content with lined background ── */}
              <div className="notebook-lined px-5 relative z-10" style={{ paddingBottom: '1.75rem' }}>
                {/* ── Main word (2 grid rows) ── */}
                <div className="pl-8" style={{ lineHeight: '3.5rem' }}>
                  <h2 className="font-bold text-[var(--color-foreground)] tracking-tight font-display" style={{ fontSize: '1.625rem', lineHeight: '3.5rem' }}>
                    {currentWord.english}
                  </h2>
                </div>

                {/* ── Pronunciation ── */}
                {currentWord.pronunciation && (
                  <p className="pl-8 text-sm text-[var(--color-muted)] font-mono">{currentWord.pronunciation}</p>
                )}

                {/* ── Japanese ── */}
                <p className="pl-8 font-semibold text-[var(--color-foreground)]" style={{ fontSize: '0.9375rem' }}>{currentWord.japanese}</p>

                {/* ── POS badges ── */}
                {(currentWord.partOfSpeechTags?.length ?? 0) > 0 && (
                  <div className="pl-8 flex flex-wrap gap-1.5 items-center" style={{ minHeight: '1.75rem' }}>
                    {currentWord.partOfSpeechTags?.map((tag) => {
                      const c = getPosColor(tag);
                      return (
                        <span
                          key={tag}
                          className="notebook-pos-badge"
                          style={{ backgroundColor: c.bg, color: c.text }}
                        >
                          {tag}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* ── Example sentence ── */}
                {currentWord.exampleSentence && (
                  <>
                    <div className="ml-8 flex items-center" style={{ height: '1.75rem' }}>
                      <hr className="notebook-section-divider flex-1" />
                    </div>
                    <div className="pl-8 flex items-center gap-1.5" style={{ height: '1.75rem' }}>
                      <Icon name="format_quote" size={14} className="text-[var(--color-primary)]" />
                      <span className="text-[0.6875rem] font-bold text-[var(--color-primary)] uppercase tracking-wider">例文</span>
                    </div>
                    <p className="pl-8 text-sm text-[var(--color-foreground)] italic">
                      {currentWord.exampleSentence}
                    </p>
                    {currentWord.exampleSentenceJa && (
                      <p className="pl-8 text-xs text-[var(--color-muted)]">
                        {currentWord.exampleSentenceJa}
                      </p>
                    )}
                  </>
                )}

                {!hasInsights ? (
                  <div className="pl-8 text-center" style={{ paddingTop: '3.5rem', paddingBottom: '1.75rem' }}>
                    <Icon name="progress_activity" size={20} className="animate-spin text-[var(--color-muted)] mx-auto" />
                    <p className="text-xs text-[var(--color-muted)]" style={{ marginTop: '1.75rem' }}>解説データを生成中...</p>
                  </div>
                ) : (
                  <>
                    {/* ── Related words ── */}
                    {(currentWord.relatedWords?.length ?? 0) > 0 && (
                      <>
                        <div className="ml-8 flex items-center" style={{ height: '1.75rem' }}>
                          <hr className="notebook-section-divider flex-1" />
                        </div>
                        <div className="pl-8 flex items-center gap-1.5" style={{ height: '1.75rem' }}>
                          <Icon name="hub" size={14} className="text-[var(--color-success)]" />
                          <span className="text-[0.6875rem] font-bold text-[var(--color-success)] uppercase tracking-wider">関連語・語形</span>
                        </div>
                        {currentWord.relatedWords?.slice(0, 8).map((item, i) => (
                          <div key={i} className="pl-8 flex items-baseline gap-2">
                            <span className="text-sm font-semibold text-[var(--color-foreground)] shrink-0">
                              {item.term}
                            </span>
                            <span className="text-[0.6875rem] text-[var(--color-muted)] shrink-0">
                              ({item.relation})
                            </span>
                            {item.noteJa && (
                              <span className="text-[0.6875rem] text-[var(--color-muted)] truncate">
                                — {item.noteJa}
                              </span>
                            )}
                          </div>
                        ))}
                      </>
                    )}

                    {/* ── Usage patterns ── */}
                    {(currentWord.usagePatterns?.length ?? 0) > 0 && (
                      <>
                        <div className="ml-8 flex items-center" style={{ height: '1.75rem' }}>
                          <hr className="notebook-section-divider flex-1" />
                        </div>
                        <div className="pl-8 flex items-center gap-1.5" style={{ height: '1.75rem' }}>
                          <Icon name="edit_note" size={14} className="text-[var(--color-warning)]" />
                          <span className="text-[0.6875rem] font-bold text-[var(--color-warning)] uppercase tracking-wider">語法パターン</span>
                        </div>
                        <div className="pl-8" style={{ paddingTop: '0.875rem' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem' }}>
                            {currentWord.usagePatterns?.slice(0, 6).map((pattern, i) => {
                              const regStyle = getRegisterStyle(pattern.register);
                              return (
                                <div
                                  key={i}
                                  className="rounded-lg border border-[var(--color-border-light)] bg-[var(--color-background)]/60 dark:bg-[var(--color-surface)]/40 px-3"
                                  style={{ paddingTop: '0.4375rem', paddingBottom: '0.4375rem' }}
                                >
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-bold text-[var(--color-foreground)]">{pattern.pattern}</p>
                                    {regStyle && (
                                      <span
                                        className="notebook-register-tag"
                                        style={{ borderColor: regStyle.borderColor, color: regStyle.color, backgroundColor: regStyle.bg }}
                                      >
                                        {pattern.register}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-[var(--color-muted)]">{pattern.meaningJa}</p>
                                  {pattern.example && (
                                    <p className="text-xs text-[var(--color-foreground)] italic">
                                      {pattern.example}
                                    </p>
                                  )}
                                  {pattern.exampleJa && (
                                    <p className="text-[0.6875rem] text-[var(--color-muted)]">
                                      {pattern.exampleJa}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Navigation buttons ── */}
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => handlePrev(true)}
            disabled={isAnimating}
            className="w-12 h-12 rounded-full border-2 border-[var(--color-border)] flex items-center justify-center bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover,var(--color-surface))] transition-colors disabled:opacity-50"
            aria-label="前の単語"
          >
            <Icon name="chevron_left" size={24} className="text-[var(--color-foreground)]" />
          </button>

          <div className="flex items-center gap-3">
            <button
              onClick={speakWord}
              className="px-4 py-2.5 rounded-full border-2 border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover,var(--color-surface))] transition-colors flex items-center gap-2 text-sm font-semibold text-[var(--color-foreground)]"
              aria-label="発音を聞く"
            >
              <Icon name="volume_up" size={18} />
              発音
            </button>
            <button
              onClick={openDictionary}
              className="px-4 py-2.5 rounded-full border-2 border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover,var(--color-surface))] transition-colors flex items-center gap-2 text-sm font-semibold text-[var(--color-foreground)]"
              aria-label="辞書で調べる"
            >
              <Icon name="menu_book" size={18} />
              辞書
            </button>
          </div>

          <button
            onClick={() => handleNext(true)}
            disabled={isAnimating}
            className="w-12 h-12 rounded-full border-2 border-[var(--color-border)] flex items-center justify-center bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover,var(--color-surface))] transition-colors disabled:opacity-50"
            aria-label="次の単語"
          >
            <Icon name="chevron_right" size={24} className="text-[var(--color-foreground)]" />
          </button>
        </div>

        {/* ── Progress dots ── */}
        {words.length <= 20 && (
          <div className="flex items-center justify-center gap-1.5 pt-1">
            {words.map((_, i) => (
              <button
                key={i}
                onClick={() => { if (!isAnimating) setCurrentIndex(i); }}
                className={`w-2 h-2 rounded-full transition-all duration-200 ${
                  i === currentIndex
                    ? 'bg-[var(--color-primary)] scale-125'
                    : 'bg-[var(--color-border)] hover:bg-[var(--color-muted)]'
                }`}
                aria-label={`単語 ${i + 1}`}
              />
            ))}
          </div>
        )}

        {/* ── Hint text ── */}
        <p className="text-center text-[0.6875rem] text-[var(--color-muted)] pt-1">
          ← → キーまたはスワイプで移動
        </p>
      </div>
    </AppShell>
  );
}
