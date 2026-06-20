'use client';

import { Fragment, type CSSProperties, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import {
  DesktopButton,
  DesktopDonut,
  DesktopSearchBox,
  DesktopTopbar,
} from '@/components/desktop/DesktopChrome';
import {
  DESKTOP_STATUS_LABEL,
  desktopPosLabel,
  desktopSourceLabel,
  desktopThumbColor,
} from '@/components/desktop/desktop-data';
import { DesktopVocabularyTypeBadge } from '@/components/desktop/DesktopVocabularyTypeBadge';
import { getWrongAnswers, type WrongAnswer } from '@/lib/utils';
import type { Project, Word, WordStatus } from '@/types';

type SortKey = 'order' | 'en' | 'vocabularyType' | 'status';
type ReviewRailMode = 'wrong' | 'review';

type RecentWrongRailItem = {
  word: Word;
  wrongCount: number;
  lastWrongAt: number;
};

type UpcomingReviewRailItem = {
  word: Word;
  nextReviewMs: number;
  urgencyPercent: number;
  dueLabel: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function vocabularyTypeSortRank(value: Word['vocabularyType']): number {
  if (value === 'active') return 0;
  if (value === 'passive') return 1;
  return 2;
}

export function DesktopProjectDetailView({
  project,
  projectId,
  words,
  filteredWords,
  wordsLoaded,
  counts,
  query,
  onQueryChange,
  filterActive,
  sortActive,
  selectMode,
  selectedWordIds,
  onOpenFilterSheet,
  onOpenSortSheet,
  onToggleSelectMode,
  onToggleSelectWord,
  onRename,
  onToggleFavorite,
  onCycleVocabularyType,
  onDeleteWord,
  onBulkDelete,
}: {
  project: Project;
  projectId: string;
  words: Word[];
  filteredWords: Word[];
  wordsLoaded: boolean;
  counts: { total: number; mastered: number; learning: number; newCount: number };
  query: string;
  onQueryChange: (value: string) => void;
  filterActive: boolean;
  sortActive: boolean;
  selectMode: boolean;
  selectedWordIds: Set<string>;
  onOpenFilterSheet: () => void;
  onOpenSortSheet: () => void;
  onToggleSelectMode: () => void;
  onToggleSelectWord: (wordId: string) => void;
  onRename: () => void;
  onToggleFavorite: (word: Word) => void;
  onCycleVocabularyType: (word: Word) => void;
  onDeleteWord: (wordId: string) => void;
  onBulkDelete: () => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('order');
  const [sortDir, setSortDir] = useState(1);
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [hiddenCols, setHiddenCols] = useState<Set<'en' | 'ja'>>(new Set());
  const [wrongAnswers, setWrongAnswers] = useState<WrongAnswer[]>([]);
  const [nowMs, setNowMs] = useState(0);
  const [railCollapsed, setRailCollapsed] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('merken-rail-collapsed');
      if (stored === 'true') setRailCollapsed(true);
    } catch {}
  }, []);
  const bg = desktopThumbColor(project.id);

  useEffect(() => {
    const refreshWrongAnswers = () => setWrongAnswers(getWrongAnswers());
    refreshWrongAnswers();
    window.addEventListener('focus', refreshWrongAnswers);
    window.addEventListener('storage', refreshWrongAnswers);
    return () => {
      window.removeEventListener('focus', refreshWrongAnswers);
      window.removeEventListener('storage', refreshWrongAnswers);
    };
  }, []);

  useEffect(() => {
    const refreshTime = () => setNowMs(Date.now());
    refreshTime();
    const timer = window.setInterval(refreshTime, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const rows = useMemo(() => {
    // 'order' keeps the shared filter/sort order from the sheets as-is
    if (sortKey === 'order') {
      return sortDir === 1 ? filteredWords : [...filteredWords].reverse();
    }
    const order: Record<WordStatus, number> = { new: 0, review: 1, mastered: 2 };
    return [...filteredWords].sort((a, b) => {
      let result = 0;
      if (sortKey === 'en') result = a.english.localeCompare(b.english);
      else if (sortKey === 'vocabularyType') result = vocabularyTypeSortRank(a.vocabularyType) - vocabularyTypeSortRank(b.vocabularyType);
      else result = order[a.status] - order[b.status];
      return result * sortDir;
    });
  }, [filteredWords, sortDir, sortKey]);

  const recentWrongRows = useMemo<RecentWrongRailItem[]>(() => {
    const wordById = new Map(words.map((word) => [word.id, word]));
    return wrongAnswers
      .map((wrongAnswer) => {
        const word = wordById.get(wrongAnswer.wordId);
        if (!word) return null;
        if (wrongAnswer.projectId && wrongAnswer.projectId !== projectId) return null;
        return {
          word,
          wrongCount: wrongAnswer.wrongCount,
          lastWrongAt: wrongAnswer.lastWrongAt,
        };
      })
      .filter((item): item is RecentWrongRailItem => item !== null)
      .sort((a, b) => b.lastWrongAt - a.lastWrongAt || b.wrongCount - a.wrongCount)
      .slice(0, 5);
  }, [projectId, words, wrongAnswers]);

  const upcomingReviewRows = useMemo<UpcomingReviewRailItem[]>(() => {
    if (nowMs <= 0) return [];
    return words
      .map((word) => {
        if (!word.nextReviewAt) return null;
        const nextReviewMs = Date.parse(word.nextReviewAt);
        if (!Number.isFinite(nextReviewMs)) return null;
        return {
          word,
          nextReviewMs,
          urgencyPercent: getReviewUrgencyPercent(nextReviewMs, nowMs),
          dueLabel: formatNextReviewLabel(nextReviewMs, nowMs),
        };
      })
      .filter((item): item is UpcomingReviewRailItem => item !== null)
      .sort((a, b) => a.nextReviewMs - b.nextReviewMs)
      .slice(0, 5);
  }, [nowMs, words]);

  const selectedWord = selectedWordId ? words.find((word) => word.id === selectedWordId) ?? null : null;
  const modalWords = useMemo(() => {
    if (!selectedWord) return rows;
    return rows.some((word) => word.id === selectedWord.id) ? rows : [selectedWord, ...rows];
  }, [rows, selectedWord]);
  const pctMastered = counts.total > 0 ? Math.round((counts.mastered / counts.total) * 100) : 0;

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((current) => -current);
    } else {
      setSortKey(key);
      setSortDir(1);
    }
  };

  const toggleCol = (col: 'en' | 'ja') => {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(col)) next.delete(col);
      else next.add(col);
      return next;
    });
  };

  const sortHead = (key: SortKey, label: string, extra?: CSSProperties) => (
    <th onClick={() => toggleSort(key)} style={extra}>
      {label} {sortKey === key && <Icon name={sortDir === 1 ? 'arrow_downward' : 'arrow_upward'} />}
    </th>
  );

  return (
    <div className="hidden h-full min-h-0 flex-col lg:flex">
      <DesktopTopbar title={project.title} crumb="単語帳 / 一覧">
        <DesktopButton href={`/quiz/${projectId}`} variant="accent" icon="school">クイズ</DesktopButton>
        <DesktopButton href={`/flashcard/${projectId}`} icon="style">カード</DesktopButton>
        <DesktopButton onClick={onRename} icon="edit" title="単語帳名を変更">名称変更</DesktopButton>
        <DesktopButton href={`/scan?projectId=${encodeURIComponent(projectId)}`} icon="photo_camera">追加</DesktopButton>
      </DesktopTopbar>

      <div className={`ds-scroll ds-project-detail-grid${railCollapsed ? ' ds-project-detail-grid--rail-collapsed' : ''}`}>
        <div style={{ minWidth: 0 }}>
          <div className="ds-card" style={{ padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 20, marginBottom: 18, flexShrink: 0 }}>
            <div
              className="ds-project-icon ds-project-icon--lg"
              style={{
                background: bg,
                backgroundImage: project.iconImage ? `url(${project.iconImage})` : undefined,
              }}
            >
              {!project.iconImage && project.title.charAt(0)}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22 }}>
                  {counts.total} <span style={{ fontSize: 13 }}>語</span>
                </span>
                <span className="mono muted" style={{ fontSize: 12 }}>{desktopSourceLabel(project)}</span>
                {project.description && <span className="muted" style={{ fontSize: 12 }}>{project.description}</span>}
              </div>
              <div className="ds-dist" style={{ marginTop: 10, maxWidth: 460 }}>
                <span className="c-mastered" style={{ flex: counts.mastered || 0.0001 }} />
                <span className="c-review" style={{ flex: counts.learning || 0.0001 }} />
                <span className="c-new" style={{ flex: counts.newCount || 0.0001 }} />
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                <span className="ds-status mastered"><span className="ds-sdot c-mastered" />習得 {counts.mastered}</span>
                <span className="ds-status review"><span className="ds-sdot c-review" />学習中 {counts.learning}</span>
                <span className="ds-status new"><span className="ds-sdot c-new" />未学習 {counts.newCount}</span>
              </div>
            </div>
            <DesktopDonut mastered={counts.mastered} review={counts.learning} total={counts.total} size={84} stroke={11} percent={pctMastered} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                className={'ds-btn sm' + (filterActive ? ' dark' : '')}
                onClick={onOpenFilterSheet}
                aria-pressed={filterActive}
              >
                <Icon name="filter_list" />
              </button>
              <button
                type="button"
                className={'ds-btn sm' + (sortActive ? ' dark' : '')}
                onClick={onOpenSortSheet}
                aria-pressed={sortActive}
              >
                <Icon name="swap_vert" />
              </button>
              <button
                type="button"
                className={'ds-btn sm' + (selectMode ? ' dark' : '')}
                onClick={onToggleSelectMode}
                aria-pressed={selectMode}
              >
                <Icon name="check_box" />
              </button>
              {selectMode && selectedWordIds.size > 0 && (
                <button
                  type="button"
                  className="ds-btn sm"
                  onClick={onBulkDelete}
                  style={{ color: 'var(--color-error, #cc4d59)' }}
                >
                  <Icon name="delete" />{selectedWordIds.size}語を削除
                </button>
              )}
            </div>
            {hiddenCols.size > 0 && (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {hiddenCols.has('en') && (
                  <button type="button" className="ds-btn sm" onClick={() => toggleCol('en')} style={{ fontSize: 11, gap: 4 }}>
                    <Icon name="visibility" style={{ fontSize: 14 }} />英単語
                  </button>
                )}
                {hiddenCols.has('ja') && (
                  <button type="button" className="ds-btn sm" onClick={() => toggleCol('ja')} style={{ fontSize: 11, gap: 4 }}>
                    <Icon name="visibility" style={{ fontSize: 14 }} />日本語
                  </button>
                )}
              </div>
            )}
            {(filterActive || query.trim()) && (
              <span className="mono muted tnum" style={{ fontSize: 12 }}>
                {rows.length} / {counts.total}
              </span>
            )}
            <div style={{ flex: 1 }} />
            <DesktopSearchBox
              placeholder="英単語・日本語を検索"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              style={{ minWidth: 240 }}
            />
          </div>

          <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="ds-table">
              <thead>
                <tr>
                  <th style={{ width: 42 }} />
                  {hiddenCols.has('en') ? null : (
                    <th onClick={() => toggleSort('en')} style={{ minWidth: 150 }}>
                      英単語 {sortKey === 'en' && <Icon name={sortDir === 1 ? 'arrow_downward' : 'arrow_upward'} />}
                      <Icon
                        name="visibility_off"
                        style={{ fontSize: 14, marginLeft: 4, opacity: 0.35, verticalAlign: 'middle' }}
                        onClick={(e: React.MouseEvent) => { e.stopPropagation(); toggleCol('en'); }}
                      />
                    </th>
                  )}
                  <th style={{ width: 70 }}>品詞</th>
                  {hiddenCols.has('ja') ? null : (
                    <th>
                      日本語
                      <Icon
                        name="visibility_off"
                        style={{ fontSize: 14, marginLeft: 4, opacity: 0.35, verticalAlign: 'middle', cursor: 'pointer' }}
                        onClick={() => toggleCol('ja')}
                      />
                    </th>
                  )}
                  {sortHead('vocabularyType', 'A/P', { width: 64, textAlign: 'center' })}
                  {sortHead('status', 'ステータス', { width: 130 })}
                </tr>
              </thead>
              <tbody>
                {rows.map((word) => {
                  const isChecked = selectedWordIds.has(word.id);
                  return (
                  <tr
                    key={word.id}
                    onClick={() => (selectMode ? onToggleSelectWord(word.id) : setSelectedWordId(word.id))}
                    style={
                      (selectMode ? isChecked : selectedWordId === word.id)
                        ? { background: 'var(--color-accent-subtle)' }
                        : undefined
                    }
                  >
                    <td
                      className="star"
                      onClick={selectMode ? undefined : (event) => {
                        event.stopPropagation();
                        onToggleFavorite(word);
                      }}
                    >
                      {selectMode ? (
                        <span className={'ds-check' + (isChecked ? ' on' : '')} aria-hidden>
                          {isChecked && <Icon name="check" style={{ fontSize: 15, color: '#fff' }} />}
                        </span>
                      ) : (
                        <Icon
                          name={word.isFavorite ? 'star' : 'star_border'}
                          filled={word.isFavorite}
                          style={word.isFavorite ? { color: 'var(--color-warning)' } : undefined}
                        />
                      )}
                    </td>
                    {hiddenCols.has('en') ? null : (
                      <td className="en">
                        {word.english}
                        <div className="mono" style={{ fontSize: 10, color: 'var(--color-muted)', fontWeight: 400 }}>
                          {word.pronunciation || '-'}
                        </div>
                      </td>
                    )}
                    <td className="pos">{desktopPosLabel(word.partOfSpeechTags)}</td>
                    {hiddenCols.has('ja') ? null : (
                      <td className="ja">{word.japanese}</td>
                    )}
                    <td style={{ textAlign: 'center' }}>
                      <DesktopVocabularyTypeBadge
                        vocabularyType={word.vocabularyType}
                        onClick={() => onCycleVocabularyType(word)}
                      />
                    </td>
                    <td><span className={'ds-status ' + word.status}><span className={'ds-sdot c-' + word.status} />{DESKTOP_STATUS_LABEL[word.status]}</span></td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            {!wordsLoaded && (
              <div className="muted" style={{ textAlign: 'center', padding: 50, fontSize: 13 }}>
                <Icon name="progress_activity" className="animate-spin" style={{ marginRight: 8 }} />
                単語を読み込み中...
              </div>
            )}
            {wordsLoaded && rows.length === 0 && (
              <div className="muted" style={{ textAlign: 'center', padding: 50, fontSize: 13 }}>該当する単語がありません</div>
            )}
          </div>
          <div className="mono muted" style={{ fontSize: 11, marginTop: 10 }}>
            {rows.length} / {counts.total} 語を表示・行をクリックで詳細を表示
          </div>
        </div>

        <ReviewRail
          loading={!wordsLoaded || nowMs <= 0}
          nowMs={nowMs}
          projectId={projectId}
          recentWrongRows={recentWrongRows}
          upcomingReviewRows={upcomingReviewRows}
          onPick={(wordId) => setSelectedWordId(wordId)}
          collapsed={railCollapsed}
          onToggle={() => {
            setRailCollapsed((prev) => {
              const next = !prev;
              try { localStorage.setItem('merken-rail-collapsed', String(next)); } catch {}
              return next;
            });
          }}
        />
      </div>

      {selectedWord && (
        <DesktopWordDetailModal
          word={selectedWord}
          words={modalWords}
          onClose={() => setSelectedWordId(null)}
          onToggleFavorite={() => onToggleFavorite(selectedWord)}
          onDelete={() => onDeleteWord(selectedWord.id)}
          onNav={(dir) => {
            const ids = modalWords.map((row) => row.id);
            const currentIndex = ids.indexOf(selectedWord.id);
            if (currentIndex < 0 || ids.length === 0) return;
            setSelectedWordId(ids[(currentIndex + dir + ids.length) % ids.length] ?? selectedWord.id);
          }}
        />
      )}
    </div>
  );
}

function ReviewRail({
  loading,
  nowMs,
  projectId,
  recentWrongRows,
  upcomingReviewRows,
  onPick,
  collapsed = false,
  onToggle,
}: {
  loading: boolean;
  nowMs: number;
  projectId: string;
  recentWrongRows: RecentWrongRailItem[];
  upcomingReviewRows: UpcomingReviewRailItem[];
  onPick: (wordId: string) => void;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  const [mode, setMode] = useState<ReviewRailMode>('wrong');
  const list = mode === 'wrong' ? recentWrongRows : upcomingReviewRows;
  const from = encodeURIComponent(`/project/${projectId}`);
  const quizHref = mode === 'wrong'
    ? `/quiz/${projectId}?wrong=1&from=${from}`
    : `/quiz/${projectId}?review=1&from=${from}`;
  const title = mode === 'wrong' ? '最近間違えた単語' : '復習時期が近い単語';
  const description = mode === 'wrong'
    ? 'クイズで最近つまずいた単語。記憶が残っているうちに戻すと定着しやすくなります。'
    : '復習期限が近い順に並べています。期限切れの単語は先頭に出ます。';
  const cta = mode === 'wrong' ? '間違えた単語を復習' : '復習リストを開始';

  if (collapsed) {
    return (
      <aside className="ds-review-rail ds-review-rail--collapsed">
        <button
          type="button"
          className="ds-sidebar-toggle"
          onClick={onToggle}
          title="復習パネルを展開"
          aria-label="復習パネルを展開"
        >
          <Icon name="chevron_left" />
        </button>
      </aside>
    );
  }

  return (
    <aside className="ds-review-rail">
      <div className="ds-card" style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span className="mono muted" style={{ fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700 }}>復習</span>
          {onToggle && (
            <button
              type="button"
              className="ds-sidebar-toggle"
              onClick={onToggle}
              title="復習パネルを折りたたむ"
              aria-label="復習パネルを折りたたむ"
            >
              <Icon name="chevron_right" />
            </button>
          )}
        </div>
        <div className="ds-railseg">
          <button type="button" className={mode === 'wrong' ? 'on' : ''} onClick={() => setMode('wrong')}>
            <Icon name="flag" />最近間違えた
          </button>
          <button type="button" className={mode === 'review' ? 'on' : ''} onClick={() => setMode('review')}>
            <Icon name="hourglass_bottom" />復習時期
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '14px 2px 4px' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15 }}>{title}</span>
          <span className="mono muted" style={{ fontSize: 11 }}>{list.length} 語</span>
        </div>
        <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.6, margin: '0 2px 8px' }}>{description}</div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {loading ? (
            <div className="muted" style={{ padding: '22px 6px', textAlign: 'center', fontSize: 12 }}>
              <Icon name="progress_activity" className="animate-spin" style={{ marginRight: 6, fontSize: 15 }} />
              読み込み中...
            </div>
          ) : list.length === 0 ? (
            <div className="muted" style={{ padding: '22px 6px', textAlign: 'center', fontSize: 12 }}>
              {mode === 'wrong' ? '最近間違えた単語はありません' : '復習予定の単語はありません'}
            </div>
          ) : mode === 'wrong' ? (
            recentWrongRows.map((item) => (
              <button key={item.word.id} type="button" className="ds-railrow" onClick={() => onPick(item.word.id)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="en">{item.word.english}</div>
                  <div className="ja">{item.word.japanese}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="when">{formatPastLabel(item.lastWrongAt, nowMs)}</span>
                  <span className="miss">{item.wrongCount}<span className="u">回</span></span>
                </div>
              </button>
            ))
          ) : (
            upcomingReviewRows.map((item) => (
              <button key={item.word.id} type="button" className="ds-railrow" onClick={() => onPick(item.word.id)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="en">{item.word.english}</div>
                  <div className="ja">{item.word.japanese}</div>
                </div>
                <div className="ds-mem">
                  <div className="bar">
                    <i style={{ width: `${item.urgencyPercent}%`, background: reviewUrgencyColor(item.urgencyPercent) }} />
                  </div>
                  <div className="pct">{item.dueLabel}</div>
                </div>
              </button>
            ))
          )}
        </div>

        <Link href={quizHref} className="ds-btn accent sm" style={{ width: '100%', marginTop: 14 }}>
          <Icon name="style" />{cta}
        </Link>
      </div>
    </aside>
  );
}

function startOfLocalDay(timestampMs: number): number {
  const date = new Date(timestampMs);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function diffLocalDays(targetMs: number, nowMs: number): number {
  return Math.round((startOfLocalDay(targetMs) - startOfLocalDay(nowMs)) / DAY_MS);
}

function formatPastLabel(timestampMs: number, nowMs: number): string {
  if (!Number.isFinite(timestampMs)) return '-';
  const diffDays = diffLocalDays(timestampMs, nowMs);
  if (diffDays === 0) return '今日';
  if (diffDays === -1) return '昨日';
  if (diffDays < 0) return `${Math.abs(diffDays)}日前`;
  return '今日';
}

function formatNextReviewLabel(nextReviewMs: number, nowMs: number): string {
  const diffDays = diffLocalDays(nextReviewMs, nowMs);
  if (diffDays < 0) return `${Math.abs(diffDays)}日超過`;
  if (diffDays === 0) return '今日';
  if (diffDays === 1) return '明日';
  return `あと${diffDays}日`;
}

function getReviewUrgencyPercent(nextReviewMs: number, nowMs: number): number {
  const diffDays = diffLocalDays(nextReviewMs, nowMs);
  if (diffDays <= 0) return 100;
  return Math.max(18, 100 - diffDays * 12);
}

function reviewUrgencyColor(percent: number): string {
  if (percent >= 88) return 'var(--color-error)';
  if (percent >= 58) return 'var(--color-warning)';
  return 'var(--color-accent)';
}

function DesktopWordDetailModal({
  word,
  words,
  onClose,
  onToggleFavorite,
  onDelete,
  onNav,
}: {
  word: Word;
  words: Word[];
  onClose: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
  onNav: (dir: -1 | 1) => void;
}) {
  return (
    <div className="ds-overlay">
      <div className="ds-modal">
        <div className="ds-modal-head">
          <div className="lab">単語の詳細</div>
          <div className="nav">
            {words.length > 1 && (
              <>
                <button type="button" className="ds-iconbtn" onClick={() => onNav(-1)} aria-label="前の単語">
                  <Icon name="chevron_left" />
                </button>
                <button type="button" className="ds-iconbtn" onClick={() => onNav(1)} aria-label="次の単語">
                  <Icon name="chevron_right" />
                </button>
              </>
            )}
            <button type="button" className="ds-iconbtn" onClick={onDelete} aria-label="削除" style={{ color: 'var(--color-error, #cc4d59)' }}>
              <Icon name="delete" />
            </button>
            <button type="button" className="ds-iconbtn" onClick={onClose} aria-label="閉じる">
              <Icon name="close" />
            </button>
          </div>
        </div>
        <div className="ds-modal-body">
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="word-en">{word.english}</div>
              <button type="button" className="ds-btn ghost sm" onClick={onToggleFavorite} aria-label="お気に入り">
                <Icon
                  name={word.isFavorite ? 'star' : 'star_border'}
                  filled={word.isFavorite}
                  style={{ color: word.isFavorite ? 'var(--color-warning)' : 'var(--color-muted)' }}
                />
              </button>
            </div>
            <div className="ds-detail">
              {(word.pronunciation || word.cefrLevel) && (
                <div className="word-ph" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  {word.pronunciation && <span>{word.pronunciation}</span>}
                  {word.cefrLevel && <span className="ds-tag plain">{word.cefrLevel}</span>}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                {(word.partOfSpeechTags?.length ? word.partOfSpeechTags : ['未分類']).map((tag) => (
                  <span key={tag} className="ds-tag accent">{desktopPosLabel([tag])}</span>
                ))}
              </div>
              <div className="word-ja">{word.japanese}</div>
            </div>
          </div>

          {(word.exampleSentence || word.exampleSentenceJa) && (
            <div style={{ paddingTop: 2 }}>
              <div className="mono" style={{ fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--color-accent-ink)', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Icon name="auto_awesome" style={{ fontSize: 14 }} />AI 例文
              </div>
              {word.exampleSentence && (
                <div style={{ fontSize: 16, fontWeight: 600, lineHeight: 1.75 }}>
                  {renderExample(word.exampleSentence, word.english)}
                </div>
              )}
              {word.exampleSentenceJa && (
                <div style={{ fontSize: 13.5, color: 'var(--color-secondary-text)', lineHeight: 1.75, marginTop: 4 }}>
                  {word.exampleSentenceJa}
                </div>
              )}
            </div>
          )}

          {word.relatedWords && word.relatedWords.length > 0 && (
            <div>
              <div className="muted" style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>関連語</div>
              <div className="ds-rel">
                {word.relatedWords.map((related) => (
                  <div key={`${related.relation}-${related.term}`} className="item">
                    <span className="rel">{related.relation}</span>
                    <span className="tm">{related.term}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function renderExample(sentence: string, word: string) {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = sentence.split(new RegExp(`(${escaped})`, 'i'));
  return parts.map((part, index) =>
    part.toLowerCase() === word.toLowerCase() ? <b key={index}>{part}</b> : <Fragment key={index}>{part}</Fragment>,
  );
}
