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
import type { Project, Word, WordStatus } from '@/types';

type SortKey = 'order' | 'en' | 'vocabularyType' | 'status';

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
}) {
  const [sortKey, setSortKey] = useState<SortKey>('order');
  const [sortDir, setSortDir] = useState(1);
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(0);
  const bg = desktopThumbColor(project.id);

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

      <div className="ds-scroll ds-project-detail-grid">
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
            </div>
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
                  {sortHead('en', '英単語', { minWidth: 150 })}
                  <th style={{ width: 70 }}>品詞</th>
                  <th>日本語</th>
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
                    <td className="en">
                      {word.english}
                      <div className="mono" style={{ fontSize: 10, color: 'var(--color-muted)', fontWeight: 400 }}>
                        {word.pronunciation || '-'}
                      </div>
                    </td>
                    <td className="pos">{desktopPosLabel(word.partOfSpeechTags)}</td>
                    <td className="ja">{word.japanese}</td>
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
          projectId={projectId}
          upcomingReviewRows={upcomingReviewRows}
          onPick={(wordId) => setSelectedWordId(wordId)}
        />
      </div>

      {selectedWord && (
        <DesktopWordDetailModal
          word={selectedWord}
          words={modalWords}
          onClose={() => setSelectedWordId(null)}
          onToggleFavorite={() => onToggleFavorite(selectedWord)}
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
  projectId,
  upcomingReviewRows,
  onPick,
}: {
  loading: boolean;
  projectId: string;
  upcomingReviewRows: UpcomingReviewRailItem[];
  onPick: (wordId: string) => void;
}) {
  const from = encodeURIComponent(`/project/${projectId}`);
  const quizHref = `/quiz/${projectId}?review=1&from=${from}`;

  return (
    <aside className="ds-review-rail">
      <div className="ds-card" style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '0 2px 4px' }}>
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15 }}>復習時期が近い単語</span>
          <span className="mono muted" style={{ fontSize: 11 }}>{upcomingReviewRows.length} 語</span>
        </div>
        <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.6, margin: '0 2px 8px' }}>
          復習期限が近い順に並べています。期限切れの単語は先頭に出ます。
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {loading ? (
            <div className="muted" style={{ padding: '22px 6px', textAlign: 'center', fontSize: 12 }}>
              <Icon name="progress_activity" className="animate-spin" style={{ marginRight: 6, fontSize: 15 }} />
              読み込み中...
            </div>
          ) : upcomingReviewRows.length === 0 ? (
            <div className="muted" style={{ padding: '22px 6px', textAlign: 'center', fontSize: 12 }}>
              復習予定の単語はありません
            </div>
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
          <Icon name="style" />復習リストを開始
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
  onNav,
}: {
  word: Word;
  words: Word[];
  onClose: () => void;
  onToggleFavorite: () => void;
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
