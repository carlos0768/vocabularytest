'use client';

/**
 * 単語帳詳細 (タブレット / iPad)。
 *
 * iPadOS のアプリと同じ**マスター・ディテール**:
 *   横向き (tablet-regular): 左に単語一覧、右に選んだ単語の詳細を常設 (sticky)
 *   縦向き (tablet-compact): 一覧のみ。単語をタップすると右からスライドオーバーで詳細
 * 上から: 戻る / タイトル / 共有 / メニュー → アイコン + 題名 + 習得度バー
 *       → クイズ / カード / 単語を追加 → 検索・絞り込み・並べ替え・選択・赤シート
 *       → 単語一覧 (スマホと同じ WordRow、10 語ずつページ送り)
 * スマホ版の下部固定バー (赤シート / ページ送り) はツールバーと一覧の末尾に吸収した。
 * データの契約は DesktopProjectDetailView と同じ (page.tsx が同じ props を渡す)。
 * タッチ前提: 操作要素は 44px 以上、hover でしか出ないものは置かない。
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { DesktopProjectDetailViewProps } from '@/components/desktop/DesktopProjectDetail';
import { EmptyWordbookState } from '@/components/project/page/ProjectEmptyState';
import { MenuButton } from '@/components/project/page/ProjectHeaderControls';
import { WordRow } from '@/components/project/WordRow';
import { StackedBar } from '@/components/project/WordStatusBar';
import { WordDetailView } from '@/components/word/WordDetailView';
import { WordListFrame } from '@/components/words/WordListFrame';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/use-auth';
import { useTabletSize } from '@/hooks/use-layout-mode';
import { thumbColor } from '@/lib/ui/thumb-color';
import { cn } from '@/lib/utils';
import type { Word } from '@/types';

const WORDS_PER_PAGE = 10;

export type TabletProjectDetailViewProps = DesktopProjectDetailViewProps & {
  /** 詳細パネルでの編集 (お気に入り・語彙モード・保存) を一覧へ反映する */
  onWordUpdated: (word: Word) => void;
};

/** 44px の正方形ツールボタン (絞り込み / 並べ替え / 選択 / ページ送り) */
function ToolButton({
  icon,
  label,
  active = false,
  disabled = false,
  onClick,
}: {
  icon: string;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      className={cn(
        'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border-2 border-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-40',
        active ? 'bg-[var(--solid-ink)] text-[var(--color-on-ink)]' : 'bg-[var(--color-surface)] text-[var(--solid-ink)]',
      )}
    >
      <Icon name={icon} size={18} />
    </button>
  );
}

/** 丸いヘッダーボタン (戻る / 共有 / メニュー) */
function RoundButton({
  icon,
  label,
  onClick,
  expanded,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  expanded?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={expanded}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
    >
      <Icon name={icon} size={18} />
    </button>
  );
}

/** 赤シート (英語側 / 訳側) の切り替え。赤いカードそのものを置く */
function RedSheetButton({ on, onToggle, label, side }: { on: boolean; onToggle: () => void; label: string; side: 'en' | 'ja' }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      aria-label={label}
      className={cn(
        'inline-flex h-11 items-center gap-2 rounded-[12px] border-2 px-3 text-[12px] font-bold transition-all duration-100 active:translate-x-px active:translate-y-px',
        on ? 'border-[var(--solid-ink)] bg-[var(--solid-ink)] text-[var(--color-on-ink)]' : 'border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)]',
      )}
    >
      <span
        className={cn(
          'block h-[18px] w-[14px] rounded-[3px] border',
          on ? 'border-[var(--color-on-ink)] bg-[#e0483f]' : 'border-[rgba(224,72,63,0.6)] bg-[rgba(224,72,63,0.35)]',
        )}
      />
      {side === 'en' ? '英語' : '訳'}
    </button>
  );
}

export function TabletProjectDetailView({
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
  onVoiceAdd,
  onWordUpdated,
}: TabletProjectDetailViewProps) {
  const router = useRouter();
  const { isPro } = useAuth();
  const tabletSize = useTabletSize();
  const splitView = tabletSize === 'regular';

  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [selectedWordId, setSelectedWordId] = useState<string | null>(null);
  // 赤シート: 英語側 / 訳側。開くたびにオフから始めたいので端末には覚えさせない
  const [redSheet, setRedSheet] = useState(false);
  const [englishRedSheet, setEnglishRedSheet] = useState(false);

  const bg = thumbColor(project.id);
  const rows = filteredWords;

  // 20 語を超える単語帳は 10 語ずつページ送り (スマホ・デスクトップと同じ規則)
  const paginate = rows.length > WORDS_PER_PAGE * 2;
  const pageCount = paginate ? Math.ceil(rows.length / WORDS_PER_PAGE) : 1;
  const [storedPage, setStoredPage] = useState(0);
  // 検索語や絞り込みを変えたら先頭ページへ (レンダー中に前回値と比べて直す)
  const pageResetKey = `${query}|${sortActive}|${filterActive}`;
  const [prevPageResetKey, setPrevPageResetKey] = useState(pageResetKey);
  if (prevPageResetKey !== pageResetKey) {
    setPrevPageResetKey(pageResetKey);
    setStoredPage(0);
  }
  const page = Math.min(storedPage, pageCount - 1);
  const pagedRows = paginate ? rows.slice(page * WORDS_PER_PAGE, (page + 1) * WORDS_PER_PAGE) : rows;

  const selectedWord = selectedWordId ? words.find((word) => word.id === selectedWordId) ?? null : null;

  // 習得度の内訳 (定着中は counts に無いので単語から数える)
  const activeCount = useMemo(() => words.filter((word) => word.status === 'active').length, [words]);
  const learningCount = Math.max(0, counts.learning - activeCount);

  const goBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.replace('/');
  };

  const hasWords = !wordsLoaded || counts.total > 0;

  const detailPanel = selectedWord ? (
    <div className="overflow-hidden rounded-[20px] border-2 border-[var(--solid-ink)] bg-[var(--color-background)] shadow-[4px_5px_0_var(--solid-shadow)]">
      <WordDetailView
        key={selectedWord.id}
        wordId={selectedWord.id}
        variant="modal"
        initialWord={selectedWord}
        onClose={() => setSelectedWordId(null)}
        onWordUpdated={onWordUpdated}
        onDelete={(wordId) => onDeleteWord(wordId)}
      />
    </div>
  ) : null;

  return (
    <div className="tb-bleed flex min-h-full flex-col font-[var(--font-body)]">
      {/* ヘッダー: 戻る / BOOK + 題名 / 共有 / メニュー。スクロールしても上に残る */}
      <header
        className="sticky top-0 z-40 flex items-center gap-3 border-b-2 border-transparent bg-[var(--color-background)]/95 px-5 py-2.5 backdrop-blur-md"
        style={{ top: 'env(safe-area-inset-top, 0px)' }}
      >
        <RoundButton icon="arrow_back" label="戻る" onClick={goBack} />
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">BOOK</div>
          <div className="truncate font-display text-[15px] font-extrabold leading-tight text-[var(--solid-ink)]">{project.title}</div>
        </div>
        {onShare && <RoundButton icon="ios_share" label="共有" onClick={onShare} />}
        <div className="relative">
          <RoundButton icon="more_horiz" label="その他の操作" onClick={() => setMoreMenuOpen((v) => !v)} expanded={moreMenuOpen} />
          {moreMenuOpen && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-40 cursor-default bg-transparent"
                aria-label="メニューを閉じる"
                onClick={() => setMoreMenuOpen(false)}
              />
              <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[200px] overflow-hidden rounded-[14px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] shadow-[2px_3px_0_var(--solid-shadow)]">
                <MenuButton icon="edit" label="名称変更" onClick={() => { setMoreMenuOpen(false); onRename(); }} />
                <MenuButton icon="folder" label="バインダー設定" onClick={() => { setMoreMenuOpen(false); onSetBinder(); }} />
                <MenuButton icon="delete" label="単語帳を削除" destructive onClick={() => { setMoreMenuOpen(false); onDeleteProject(); }} />
              </div>
            </>
          )}
        </div>
      </header>

      <div className={cn('mx-auto w-full px-5 pb-16', splitView ? 'max-w-[1240px]' : 'max-w-[840px]')}>
        {/* アイコン + 題名 + 習得度 */}
        <div className="flex items-start gap-4 pb-3 pt-4">
          <div
            className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-[14px] border-2 border-[var(--solid-ink)] bg-cover bg-center font-display text-[30px] font-extrabold text-white"
            style={{ backgroundColor: bg, backgroundImage: project.iconImage ? `url(${project.iconImage})` : undefined }}
          >
            {!project.iconImage && project.title.charAt(0)}
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <div className="font-mono text-[10px] font-semibold tracking-[0.04em] text-[var(--color-muted)]">BOOK · {counts.total} words</div>
            <h1 className="mt-0.5 font-display text-[26px] font-extrabold leading-[1.15] tracking-[-0.01em] text-[var(--solid-ink)]">{project.title}</h1>
            {project.description && <p className="mt-1 text-xs leading-5 text-[var(--color-muted)]">{project.description}</p>}
            {hasWords && (
              <div className="mt-2.5 max-w-[560px]">
                <StackedBar total={counts.total} m={counts.mastered} a={activeCount} l={learningCount} n={counts.newCount} />
              </div>
            )}
          </div>
        </div>

        {/* クイズ / カード / 単語を追加 */}
        {hasWords && (
          <div className="flex items-center gap-2.5 pb-4">
            <Link
              href={`/quiz/${projectId}`}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-[12px] border-2 border-[var(--color-accent)] bg-[var(--color-accent)] text-[14px] font-bold text-[var(--color-on-accent)] shadow-[2px_3px_0_var(--solid-shadow)] transition-all duration-100 active:translate-x-px active:translate-y-px active:shadow-[1px_1px_0_var(--solid-shadow)] tablet-regular:max-w-[360px]"
            >
              <Icon name="check" size={16} />
              クイズを始める
            </Link>
            <Link
              href={`/flashcard/${projectId}`}
              className="flex h-12 items-center justify-center gap-2 rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-4 text-[13px] font-bold text-[var(--solid-ink)] shadow-[2px_3px_0_var(--solid-shadow)] transition-all duration-100 active:translate-x-px active:translate-y-px active:shadow-[1px_1px_0_var(--solid-shadow)]"
            >
              <Icon name="style" size={18} />
              カード
            </Link>
            <div className="relative">
              <button
                type="button"
                onClick={() => setAddMenuOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={addMenuOpen}
                className="flex h-12 items-center justify-center gap-2 rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-4 text-[13px] font-bold text-[var(--solid-ink)] shadow-[2px_3px_0_var(--solid-shadow)] transition-all duration-100 active:translate-x-px active:translate-y-px active:shadow-[1px_1px_0_var(--solid-shadow)]"
              >
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
                  <div role="menu" className="absolute right-0 top-[calc(100%+6px)] z-50 w-[200px] overflow-hidden rounded-[14px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] shadow-[2px_3px_0_var(--solid-shadow)]">
                    <MenuButton icon="photo_camera" label="スキャンで追加" onClick={() => { setAddMenuOpen(false); onScan(); }} />
                    <MenuButton icon="edit" label="手で入力" onClick={() => { setAddMenuOpen(false); onManualAdd(); }} />
                    {onVoiceAdd && <MenuButton icon="mic" label="音声で追加" onClick={() => { setAddMenuOpen(false); onVoiceAdd(); }} />}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* 検索 / 絞り込み / 並べ替え / 選択 / 赤シート */}
        {hasWords && (
          <div className="flex flex-wrap items-center gap-2.5 pb-3">
            <label
              htmlFor="tablet-project-word-search"
              className="flex h-11 min-w-[200px] flex-1 items-center gap-2 rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-4 text-[var(--color-muted)]"
            >
              <Icon name="search" size={16} />
              <span className="sr-only">単語を検索</span>
              <input
                id="tablet-project-word-search"
                type="search"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="単語を検索"
                className="min-w-0 flex-1 bg-transparent text-[14px] text-[var(--solid-ink)] outline-none placeholder:text-[var(--color-muted)]"
              />
              {query && (
                <button type="button" onClick={() => onQueryChange('')} aria-label="検索をクリア" className="inline-flex h-8 w-8 items-center justify-center text-[var(--color-muted)]">
                  <Icon name="close" size={16} />
                </button>
              )}
            </label>
            {(filterActive || query.trim()) && (
              <span className="shrink-0 font-mono text-[12px] font-bold tabular-nums text-[var(--color-muted)]">
                {rows.length} / {counts.total}
              </span>
            )}
            <ToolButton icon="filter_list" label="絞り込み" active={filterActive} onClick={onOpenFilterSheet} />
            <ToolButton icon="swap_vert" label="並べ替え" active={sortActive} onClick={onOpenSortSheet} />
            <ToolButton icon="check_box" label="選択" active={selectMode} onClick={onToggleSelectMode} />
            <div className="ml-auto flex items-center gap-2">
              <RedSheetButton side="en" on={englishRedSheet} onToggle={() => setEnglishRedSheet((v) => !v)} label={englishRedSheet ? '英語の赤シートを外す' : '赤シートで英語を隠す'} />
              <RedSheetButton side="ja" on={redSheet} onToggle={() => setRedSheet((v) => !v)} label={redSheet ? '訳の赤シートを外す' : '赤シートで訳を隠す'} />
            </div>
          </div>
        )}

        {/* 本文: 横向きは 一覧 | 詳細 の 2 カラム。縦向きは一覧だけ */}
        <div className={cn(splitView && 'grid grid-cols-[minmax(0,1fr)_440px] items-start gap-6')}>
          <div className="min-w-0">
            {!wordsLoaded ? (
              <div className="flex items-center justify-center py-12 text-[var(--color-muted)]">
                <Icon name="progress_activity" size={20} className="animate-spin" />
                <span className="ml-2 text-sm">単語を読み込み中...</span>
              </div>
            ) : rows.length === 0 ? (
              counts.total === 0 ? (
                <EmptyWordbookState isPro={isPro} onScan={onScan} onManualAdd={onManualAdd} onVoiceAdd={onVoiceAdd} />
              ) : (
                <div className="rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-10 text-center text-sm text-[var(--color-muted)]">
                  {query ? '一致する単語がありません' : '条件に一致する単語がありません'}
                </div>
              )
            ) : (
              <WordListFrame className="rounded-[16px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3">
                {pagedRows.map((word) => (
                  <div
                    key={word.id}
                    className={cn(
                      '-mx-3 px-3 transition-colors',
                      splitView && selectedWordId === word.id && 'bg-[color-mix(in_srgb,var(--solid-ink)_6%,transparent)]',
                    )}
                  >
                    <WordRow
                      word={word}
                      selectMode={selectMode}
                      selected={selectedWordIds.has(word.id)}
                      hideMeaning={redSheet}
                      hideEnglish={englishRedSheet}
                      splitMeaning
                      onToggleSelect={() => onToggleSelectWord(word)}
                      onCycleStatus={(newStatus) => onCycleStatus(word, newStatus)}
                      onCycleVocabularyType={() => onCycleVocabularyType(word)}
                      onToggleFavorite={() => onToggleFavorite(word)}
                      onSelect={() => setSelectedWordId(word.id)}
                    />
                  </div>
                ))}
              </WordListFrame>
            )}

            {/* 語数とページ送り (スマホの下部固定バーの代わり) */}
            {wordsLoaded && rows.length > 0 && (
              <div className="flex items-center justify-between gap-3 pt-3">
                <span className="font-mono text-[12px] font-bold tabular-nums text-[var(--color-ink-muted)]">
                  {paginate
                    ? `${page * WORDS_PER_PAGE + 1}–${Math.min(rows.length, (page + 1) * WORDS_PER_PAGE)} / ${rows.length}語`
                    : `${rows.length}語`}
                </span>
                {paginate && (
                  <div className="flex items-center gap-2">
                    <ToolButton icon="chevron_left" label="前の10語" disabled={page === 0} onClick={() => setStoredPage(Math.max(0, page - 1))} />
                    <span className="font-mono text-[12px] font-bold tabular-nums text-[var(--solid-ink)]">
                      {page + 1} / {pageCount}
                    </span>
                    <ToolButton icon="chevron_right" label="次の10語" disabled={page >= pageCount - 1} onClick={() => setStoredPage(Math.min(pageCount - 1, page + 1))} />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 横向き: 右カラムに詳細を常設。未選択のときは案内 */}
          {splitView && (
            <aside className="sticky self-start" style={{ top: 'calc(env(safe-area-inset-top, 0px) + 72px)' }}>
              {detailPanel ?? (
                <div className="flex min-h-[320px] flex-col items-center justify-center rounded-[20px] border-2 border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-6 text-center text-[var(--color-muted)]">
                  <Icon name="touch_app" size={28} />
                  <p className="mt-3 text-[13px] font-bold">単語をタップすると、ここに詳細が出ます</p>
                  <p className="mt-1 text-[12px]">語源・例文・発音・言い換えをそのまま読めます</p>
                </div>
              )}
            </aside>
          )}
        </div>
      </div>

      {/* 縦向き: 右からのスライドオーバー */}
      {!splitView && selectedWord && (
        <div className="fixed inset-0 z-[80]" style={{ fontFamily: 'var(--font-body)' }}>
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
            onClick={() => setSelectedWordId(null)}
          />
          <div
            className="absolute inset-y-0 right-0 flex w-[460px] max-w-[92vw] flex-col overflow-y-auto overscroll-contain border-l-2 border-[var(--solid-ink)] bg-[var(--color-background)] animate-fade-in"
            style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            <WordDetailView
              key={selectedWord.id}
              wordId={selectedWord.id}
              variant="modal"
              initialWord={selectedWord}
              onClose={() => setSelectedWordId(null)}
              onWordUpdated={onWordUpdated}
              onDelete={(wordId) => onDeleteWord(wordId)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
