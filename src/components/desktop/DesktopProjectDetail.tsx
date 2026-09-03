'use client';

/**
 * 単語帳詳細 (デスクトップ)。
 * 上から: 戻る/共有/その他 → 単語帳アイコン + タイトル + 習得度バー
 *       → クイズ/カード/単語追加 → 検索・絞り込み・並べ替え・選択・赤シート
 *       → 単語一覧 (モバイルと同じ WordRow: 3段の習得度マス / 語彙タイプ / ブックマーク)
 * 右レール: 最近間違えた単語 / 復習時期が近い単語 (ReviewRail)
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { DesktopButton } from '@/components/desktop/DesktopChrome';
import { desktopSourceLabel, desktopThumbColor } from '@/components/desktop/desktop-data';
import { DesktopWordDetailModal } from '@/components/desktop/DesktopWordDetailModal';
import { WordRow } from '@/components/project/WordRow';
import { StackedBar } from '@/components/project/WordStatusBar';
import { WordListFrame } from '@/components/words/WordListFrame';
import { TranslationDisplay } from '@/components/word/TranslationDisplay';
import { getWrongAnswers, type WrongAnswer } from '@/lib/utils';
import type { Project, Word, WordStatus } from '@/types';

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

const DESKTOP_WORDS_PER_PAGE = 10;

/** 34px の正方形ツールボタン (絞り込み / 並べ替え / 選択) */
function ToolButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      aria-pressed={active}
      style={{
        display: 'inline-flex', height: 34, width: 34, alignItems: 'center', justifyContent: 'center',
        borderRadius: 9, border: '2px solid var(--solid-ink)', cursor: 'pointer', flexShrink: 0, padding: 0,
        background: active ? 'var(--solid-ink)' : '#fff', color: active ? '#fff' : 'var(--color-ink)',
      }}
    >
      <Icon name={icon} size={15} />
    </button>
  );
}

const ACTION_BUTTON: React.CSSProperties = {
  display: 'flex', height: 40, alignItems: 'center', justifyContent: 'center', gap: 6, padding: '0 14px',
  borderRadius: 10, border: '2px solid var(--solid-ink)', background: '#fff', color: 'var(--color-ink)',
  fontSize: 13, fontWeight: 700, boxShadow: '2px 2px 0 var(--solid-ink)', cursor: 'pointer',
  textDecoration: 'none', fontFamily: 'inherit', whiteSpace: 'nowrap',
};

const MENU_ITEM = 'flex w-full items-center gap-2 px-4 py-3 text-left text-[13px] font-bold transition-colors hover:bg-[var(--color-surface-secondary)]';

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
  onSetBinder,
  onDeleteProject,
  onShare,
  onToggleFavorite,
  onCycleStatus,
  onCycleVocabularyType,
  onDeleteWord,
  onScan,
  onManualAdd,
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
  onToggleSelectWord: (word: Word) => void;
  onRename: () => void;
  onSetBinder: () => void;
  onDeleteProject: () => void;
  onShare?: () => void;
  onToggleFavorite: (word: Word) => void;
  onCycleStatus: (word: Word, newStatus: WordStatus) => void;
  onCycleVocabularyType: (word: Word) => void;
  onDeleteWord: (wordId: string) => void;
  onScan: () => void;
  onManualAdd: () => void;
}) {
  const router = useRouter();
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  // 赤シート: 一覧の訳を赤いベタで隠す (モバイルと同じ)
  const [redSheet, setRedSheet] = useState(false);
  const [wrongAnswers, setWrongAnswers] = useState<WrongAnswer[]>([]);
  const [nowMs, setNowMs] = useState(0);
  const [railCollapsed, setRailCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const stored = localStorage.getItem('merken-rail-collapsed');
      return stored === 'true';
    } catch {
      return false;
    }
  });
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

  // 絞り込み・並べ替えはシート側 (filteredWords) で決まった順をそのまま使う
  const rows = filteredWords;

  const wrongCountByWordId = useMemo(() => {
    const map = new Map<string, number>();
    for (const wrongAnswer of wrongAnswers) {
      if (wrongAnswer.projectId && wrongAnswer.projectId !== projectId) continue;
      map.set(wrongAnswer.wordId, wrongAnswer.wrongCount);
    }
    return map;
  }, [projectId, wrongAnswers]);

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

  // モバイルと同じ規則: 20語を超える単語帳は10語ずつページ送りする (フロントのみで完結)
  const paginateRows = rows.length > DESKTOP_WORDS_PER_PAGE * 2;
  const pageCount = paginateRows ? Math.ceil(rows.length / DESKTOP_WORDS_PER_PAGE) : 1;
  const [storedWordPage, setWordPage] = useState(0);
  // 検索語を変えたら先頭ページから見せる (レンダー中に前回値と比べて直す React 公式パターン)
  const pageResetKey = `${query}|${sortActive}|${filterActive}`;
  const [prevPageResetKey, setPrevPageResetKey] = useState(pageResetKey);
  if (prevPageResetKey !== pageResetKey) {
    setPrevPageResetKey(pageResetKey);
    setWordPage(0);
  }
  // フィルタでページ数が減ったときは末尾ページに丸める
  const wordPage = Math.min(storedWordPage, pageCount - 1);
  const pagedRows = paginateRows
    ? rows.slice(wordPage * DESKTOP_WORDS_PER_PAGE, (wordPage + 1) * DESKTOP_WORDS_PER_PAGE)
    : rows;

  const selectedWord = selectedWordId ? words.find((word) => word.id === selectedWordId) ?? null : null;
  // 詳細モーダルの前後移動は絞り込み後の全単語を辿る (ページ境界で止めない)
  const modalWords = useMemo(() => {
    if (!selectedWord) return rows;
    return rows.some((word) => word.id === selectedWord.id)
      ? rows
      : [selectedWord, ...rows];
  }, [selectedWord, rows]);

  // 習得度の内訳 (定着中は counts に無いので単語から数える)
  const activeCount = useMemo(() => words.filter((word) => word.status === 'active').length, [words]);
  const learningCount = Math.max(0, counts.learning - activeCount);

  const goBack = () => {
    // 直前の画面（単語帳一覧・バインダーなど）へ戻す。履歴が無ければ一覧へ。
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push('/projects');
  };

  return (
    <div className="hidden h-full min-h-0 flex-col lg:flex">
      {/* 戻る / BOOK / 共有 / その他: スクロールしても上に固定される */}
      <div className="ds-top" style={{ gap: 10 }}>
        <button type="button" className="ds-iconbtn-round sm" onClick={goBack} aria-label="戻る" title="戻る">
          <Icon name="arrow_back" />
        </button>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="ds-eyebrow" style={{ fontSize: 9, letterSpacing: '0.08em' }}>BOOK</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 800, lineHeight: 1.2, color: 'var(--color-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {project.title}
          </div>
        </div>
      {/* クイズ / カード / 単語を追加: 上部バーの右側に置く */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {counts.total > 0 ? (
          <Link
            href={`/quiz/${projectId}`}
            className="ds-project-action ds-project-action--accent"
            style={{ ...ACTION_BUTTON, border: '2px solid var(--color-accent)', background: 'var(--color-accent)', color: '#fff', fontSize: 14 }}
          >
            <Icon name="check" size={16} />
            クイズを始める
          </Link>
        ) : (
          <span style={{ ...ACTION_BUTTON, opacity: 0.45, cursor: 'not-allowed', boxShadow: 'none' }}>
            <Icon name="check" size={16} />
            クイズを始める
          </span>
        )}
        <Link href={`/flashcard/${projectId}`} className="ds-project-action" style={ACTION_BUTTON}>
          <Icon name="style" size={18} />
          カード
        </Link>
        <div ref={addMenuRef} style={{ position: 'relative' }}>
          <button type="button" className="ds-project-action" style={ACTION_BUTTON} onClick={() => setAddMenuOpen((v) => !v)} aria-expanded={addMenuOpen}>
            <Icon name="add" size={20} />
            単語を追加
          </button>
          {addMenuOpen && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-40 cursor-default bg-transparent"
                aria-label="メニューを閉じる"
                onClick={() => setAddMenuOpen(false)}
              />
              <div
                className="absolute left-0 top-[calc(100%+6px)] z-50 w-[180px] overflow-hidden rounded-[12px] border-2 border-[var(--solid-ink)] bg-white"
                style={{ boxShadow: '2px 3px 0 var(--solid-ink)' }}
              >
                <button type="button" className={MENU_ITEM} onClick={() => { setAddMenuOpen(false); onScan(); }}>
                  <Icon name="photo_camera" style={{ fontSize: 18 }} />
                  スキャンで追加
                </button>
                <button type="button" className={MENU_ITEM} onClick={() => { setAddMenuOpen(false); onManualAdd(); }}>
                  <Icon name="edit" style={{ fontSize: 18 }} />
                  手動で追加
                </button>
              </div>
            </>
          )}
        </div>
      </div>
        {onShare && (
          <button type="button" className="ds-iconbtn-round sm" onClick={onShare} aria-label="共有" title="共有">
            <Icon name="ios_share" />
          </button>
        )}
        {/* 「...」メニュー: 名称変更 / バインダー設定 / 削除 */}
        <div ref={moreMenuRef} style={{ position: 'relative' }}>
          <button type="button" className="ds-iconbtn-round sm" onClick={() => setMoreMenuOpen((v) => !v)} aria-label="その他の操作" title="その他の操作">
            <Icon name="more_horiz" />
          </button>
          {moreMenuOpen && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-40 cursor-default bg-transparent"
                aria-label="メニューを閉じる"
                onClick={() => setMoreMenuOpen(false)}
              />
              <div
                className="absolute right-0 top-[calc(100%+6px)] z-50 w-[180px] overflow-hidden rounded-[12px] border-2 border-[var(--solid-ink)] bg-white"
                style={{ boxShadow: '2px 3px 0 var(--solid-ink)' }}
              >
                <button type="button" className={MENU_ITEM} onClick={() => { setMoreMenuOpen(false); onRename(); }}>
                  <Icon name="drive_file_rename_outline" style={{ fontSize: 18 }} />
                  名称変更
                </button>
                <button type="button" className={MENU_ITEM} onClick={() => { setMoreMenuOpen(false); onSetBinder(); }}>
                  <Icon name="folder" style={{ fontSize: 18 }} />
                  バインダー設定
                </button>
                <button
                  type="button"
                  className={MENU_ITEM}
                  style={{ color: 'var(--color-error, #cc4d59)' }}
                  onClick={() => { setMoreMenuOpen(false); onDeleteProject(); }}
                >
                  <Icon name="delete" style={{ fontSize: 18 }} />
                  単語帳を削除
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className={`ds-scroll ds-project-detail-grid${railCollapsed ? ' ds-project-detail-grid--rail-collapsed' : ''}`}>
        <div style={{ minWidth: 0 }}>
          {/* アイコン + タイトル + 習得度 */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, padding: '8px 4px 16px' }}>
            <div
              style={{
                display: 'flex', height: 72, width: 72, flexShrink: 0, alignItems: 'center', justifyContent: 'center',
                borderRadius: 14, border: '2px solid var(--solid-ink)', fontFamily: 'var(--font-display)',
                fontSize: 30, fontWeight: 800, color: '#fff', background: bg, overflow: 'hidden',
                backgroundImage: project.iconImage ? `url(${project.iconImage})` : undefined,
                backgroundSize: 'cover', backgroundPosition: 'center',
              }}
            >
              {!project.iconImage && project.title.charAt(0)}
            </div>
            <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
              <div className="ds-eyebrow" style={{ fontWeight: 600, letterSpacing: '0.04em' }}>
                BOOK · {counts.total} words · {desktopSourceLabel(project)}
              </div>
              <h1 style={{ margin: '2px 0 0', fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.01em', color: 'var(--color-ink)' }}>
                {project.title}
              </h1>
              {project.description && (
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{project.description}</div>
              )}
              <div style={{ marginTop: 10, maxWidth: 520 }}>
                <StackedBar total={counts.total} m={counts.mastered} a={activeCount} l={learningCount} n={counts.newCount} />
              </div>
            </div>
          </div>

          {/* 検索 / 絞り込み / 並べ替え / 選択 / 赤シート */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 4px 8px' }}>
            <label
              style={{
                display: 'flex', minWidth: 0, flex: 1, maxWidth: 420, alignItems: 'center', gap: 6,
                borderRadius: 999, border: '2px solid var(--solid-ink)', background: '#fff', padding: '7px 12px', color: 'var(--color-muted)',
              }}
            >
              <Icon name="search" size={14} />
              <input
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="単語を検索"
                style={{ minWidth: 0, flex: 1, background: 'transparent', border: 0, outline: 0, fontSize: 12, fontFamily: 'inherit', color: 'var(--color-ink)' }}
              />
              {query && (
                <button type="button" onClick={() => onQueryChange('')} aria-label="検索をクリア" style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'var(--color-muted)', display: 'inline-flex' }}>
                  <Icon name="close" size={14} />
                </button>
              )}
            </label>
            <ToolButton icon="filter_list" label="絞り込み" active={filterActive} onClick={onOpenFilterSheet} />
            <ToolButton icon="swap_vert" label="並べ替え" active={sortActive} onClick={onOpenSortSheet} />
            <ToolButton icon="check_box" label="選択" active={selectMode} onClick={onToggleSelectMode} />
            {(filterActive || query.trim()) && (
              <span className="muted tnum" style={{ fontSize: 11, fontWeight: 700 }}>
                {rows.length} / {counts.total}
              </span>
            )}
            <button
              type="button"
              onClick={() => setRedSheet((v) => !v)}
              aria-pressed={redSheet}
              style={{
                marginLeft: 'auto', display: 'inline-flex', height: 34, alignItems: 'center', gap: 6, padding: '0 12px',
                borderRadius: 9, border: `2px solid ${redSheet ? 'var(--solid-ink)' : 'var(--color-border)'}`,
                background: redSheet ? 'var(--solid-ink)' : '#fff', color: redSheet ? '#fff' : 'var(--color-secondary-text)',
                fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
              }}
            >
              <span style={{ width: 12, height: 12, borderRadius: 3, background: '#e0483f', border: '1px solid var(--solid-ink)' }} />
              赤シート
            </button>
          </div>

          {/* 単語一覧 */}
          <div style={{ padding: '0 2px' }}>
            {!wordsLoaded ? (
              <div className="muted" style={{ textAlign: 'center', padding: 50, fontSize: 13 }}>
                <Icon name="progress_activity" className="animate-spin" style={{ marginRight: 8 }} />
                単語を読み込み中...
              </div>
            ) : rows.length === 0 ? (
              counts.total === 0 ? (
                <div style={{ textAlign: 'center', padding: '54px 24px', borderRadius: 16, border: '2px solid var(--solid-ink)', background: '#fff' }}>
                  <div style={{ width: 58, height: 58, borderRadius: 16, background: 'var(--color-accent-light)', border: '2px solid var(--solid-ink)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="menu_book" style={{ fontSize: 28, color: 'var(--color-accent-ink)' }} />
                  </div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 17, marginTop: 14 }}>
                    まだ単語がありません
                  </div>
                  <p className="muted" style={{ fontSize: 13, lineHeight: 1.7, margin: '8px 0 0' }}>
                    単語を追加すると、クイズやカードで学習を始められます。
                  </p>
                  <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20, flexWrap: 'wrap' }}>
                    <DesktopButton variant="accent" icon="edit" onClick={onManualAdd}>
                      手で入力
                    </DesktopButton>
                    <DesktopButton icon="photo_camera" onClick={onScan}>
                      スキャンで追加
                    </DesktopButton>
                  </div>
                </div>
              ) : (
                <div className="muted" style={{ textAlign: 'center', padding: 50, fontSize: 13 }}>該当する単語がありません</div>
              )
            ) : (
              <WordListFrame>
                {pagedRows.map((word) => (
                  <WordRow
                    key={word.id}
                    word={word}
                    selectMode={selectMode}
                    selected={selectedWordIds.has(word.id)}
                    wrongCount={wrongCountByWordId.get(word.id) ?? 0}
                    hideMeaning={redSheet}
                    splitMeaning
                    onToggleSelect={() => onToggleSelectWord(word)}
                    onCycleStatus={(newStatus) => onCycleStatus(word, newStatus)}
                    onCycleVocabularyType={() => onCycleVocabularyType(word)}
                    onToggleFavorite={() => onToggleFavorite(word)}
                    onSelect={() => setSelectedWordId(word.id)}
                  />
                ))}
              </WordListFrame>
            )}
          </div>

          {/* 20語を超えるときは10語ずつページ送り。件数表示の右に前後ボタンを置く */}
          {wordsLoaded && rows.length > 0 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                marginTop: 12,
                padding: '0 4px',
                flexWrap: 'wrap',
              }}
            >
              <div className="muted tnum" style={{ fontSize: 11 }}>
                {paginateRows
                  ? `${wordPage * DESKTOP_WORDS_PER_PAGE + 1}–${Math.min(rows.length, (wordPage + 1) * DESKTOP_WORDS_PER_PAGE)} / ${rows.length} 語を表示・行をクリックで詳細を表示`
                  : `${rows.length} / ${counts.total} 語を表示・行をクリックで詳細を表示`}
              </div>
              {paginateRows && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ToolButton icon="chevron_left" label="前の10語" onClick={() => setWordPage(Math.max(0, wordPage - 1))} />
                  <span className="tnum" style={{ fontSize: 11, fontWeight: 700 }}>
                    {wordPage + 1} / {pageCount}
                  </span>
                  <ToolButton icon="chevron_right" label="次の10語" onClick={() => setWordPage(Math.min(pageCount - 1, wordPage + 1))} />
                </div>
              )}
            </div>
          )}
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
            const nextId = ids[(currentIndex + dir + ids.length) % ids.length] ?? selectedWord.id;
            setSelectedWordId(nextId);
            // 背後の一覧も、移動先の単語が載っているページに合わせる
            if (paginateRows) {
              const rowIndex = rows.findIndex((row) => row.id === nextId);
              if (rowIndex >= 0) setWordPage(Math.floor(rowIndex / DESKTOP_WORDS_PER_PAGE));
            }
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
                  <div className="ja"><TranslationDisplay word={item.word} compact /></div>
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
                  <div className="ja"><TranslationDisplay word={item.word} compact /></div>
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
