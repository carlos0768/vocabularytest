'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Icon } from '@/components/ui/Icon';
import { VocabularyTypeButton } from '@/components/project/VocabularyTypeButton';
import { TranslationDisplay } from '@/components/word/TranslationDisplay';
import { Button } from '@/components/ui';
import { formatJapaneseForDisplay } from '@/lib/words/display';
import type { Word, WordStatus } from '@/types';

export function nextStatus(current: WordStatus): WordStatus {
  if (current === 'new') return 'review';
  if (current === 'review') return 'active';
  if (current === 'active') return 'mastered';
  return 'new';
}

const STATUS_TO_FILLED: Record<WordStatus, number> = { new: 0, review: 1, active: 2, mastered: 3 };
const FILLED_TO_STATUS: WordStatus[] = ['new', 'review', 'active', 'mastered'];
const STATUS_ARIA: Record<WordStatus, string> = { new: '未学習', review: '学習中', active: '定着中', mastered: '習得済' };

export function NotionCheckbox({
  wordId,
  status,
  onStatusChange,
}: {
  wordId: string;
  status: WordStatus;
  onStatusChange: (newStatus: WordStatus) => void;
}) {
  const [filledCount, setFilledCount] = useState(() => STATUS_TO_FILLED[status] ?? 0);
  const [direction, setDirection] = useState<'up' | 'down'>(() => status === 'mastered' ? 'down' : 'up');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilledCount(STATUS_TO_FILLED[status] ?? 0);
      setDirection(status === 'mastered' ? 'down' : 'up');
    }, 0);
    return () => window.clearTimeout(timer);
  }, [status, wordId]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (direction === 'up') {
      if (filledCount < 3) {
        const next = filledCount + 1;
        setFilledCount(next);
        if (next === 3) setDirection('down');
        onStatusChange(FILLED_TO_STATUS[next]);
      }
    } else {
      if (filledCount > 0) {
        const next = filledCount - 1;
        setFilledCount(next);
        if (next === 0) setDirection('up');
        onStatusChange(FILLED_TO_STATUS[next]);
      }
    }
  }, [filledCount, direction, onStatusChange]);

  return (
    <button
      onClick={handleClick}
      aria-label={`ステータス: ${STATUS_ARIA[status] ?? status}`}
      className="flex-shrink-0 rounded hover:bg-[var(--color-surface)] transition-colors"
      style={{ lineHeight: 0, padding: 2 }}
    >
      <div
        className="relative overflow-hidden"
        style={{
          width: 13,
          height: 39,
          border: '1px solid var(--color-border)',
          borderRadius: 3,
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: i * 13,
              left: 0,
              width: '100%',
              height: 13,
              background: i < filledCount ? 'var(--color-foreground)' : 'transparent',
              borderTop: i > 0 ? '1px solid var(--color-border)' : 'none',
              transition: 'background 0.15s ease',
            }}
          />
        ))}
      </div>
    </button>
  );
}

interface WordItemProps {
  word: Word & { projectTitle?: string };
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (english: string, japanese: string) => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  onCycleVocabularyType?: () => void;
  onStatusChange?: (newStatus: WordStatus) => void;
  showProjectName?: boolean;
}

function WordItem({
  word,
  isEditing,
  onEdit,
  onCancel,
  onSave,
  onDelete,
  onToggleFavorite,
  onCycleVocabularyType,
  onStatusChange,
  showProjectName = false,
}: WordItemProps) {
  const [editEnglish, setEditEnglish] = useState(word.english);
  const [editJapanese, setEditJapanese] = useState(word.japanese);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Convert vertical mouse-wheel to horizontal scroll so desktop users can
  // reach hidden text in long translations. Only hijacks the wheel when the
  // element actually has horizontal overflow, otherwise page scroll stays
  // untouched.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (e.deltaY === 0) return;
      // If already scrolled to edge in the wheel direction, let page scroll.
      const atStart = el.scrollLeft <= 0 && e.deltaY < 0;
      const atEnd = Math.ceil(el.scrollLeft + el.clientWidth) >= el.scrollWidth && e.deltaY > 0;
      if (atStart || atEnd) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const handleSave = () => {
    if (editEnglish.trim() && editJapanese.trim()) {
      onSave(editEnglish.trim(), editJapanese.trim());
    }
  };

  if (isEditing) {
    return (
      <div className="card p-4 my-2 border-2 border-[var(--color-primary)]">
        <div className="space-y-3">
          <input
            type="text"
            value={editEnglish}
            onChange={(e) => setEditEnglish(e.target.value)}
            className="w-full px-3 py-2 border-2 border-[var(--color-border)] rounded-xl bg-[var(--color-background)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
            placeholder="英語"
          />
          <input
            type="text"
            value={editJapanese}
            onChange={(e) => setEditJapanese(e.target.value)}
            className="w-full px-3 py-2 border-2 border-[var(--color-border)] rounded-xl bg-[var(--color-background)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
            placeholder="日本語"
          />
          <div className="flex gap-2">
            <Button onClick={handleSave} className="flex-1" size="sm">
              <Icon name="save" size={16} className="mr-1" />
              保存
            </Button>
            <Button variant="secondary" onClick={onCancel} className="flex-1" size="sm">
              <Icon name="close" size={16} className="mr-1" />
              キャンセル
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-1 py-3 flex items-center gap-2">
      {onStatusChange && (
        <NotionCheckbox wordId={word.id} status={word.status} onStatusChange={onStatusChange} />
      )}
      <div
        ref={scrollRef}
        className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden"
        style={{ scrollbarWidth: 'thin' }}
      >
        <div className="w-max max-w-none">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-[var(--color-foreground)] whitespace-nowrap">{word.english}</span>
            {word.isFavorite && (
              <Icon
                name="flag"
                size={14}
                filled
                className="text-[var(--color-warning)] shrink-0"
                aria-label="苦手マーク"
              />
            )}
          </div>
          <p className="text-sm text-[var(--color-muted)] whitespace-nowrap" title={formatJapaneseForDisplay(word)}>
            <TranslationDisplay word={word} compact />
          </p>
          {showProjectName && word.projectTitle && (
            <p className="text-xs text-[var(--color-primary)] mt-1 whitespace-nowrap">{word.projectTitle}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {onCycleVocabularyType && (
          <VocabularyTypeButton
            vocabularyType={word.vocabularyType}
            onClick={onCycleVocabularyType}
          />
        )}
        <button
          onClick={onToggleFavorite}
          className="p-2 hover:bg-[var(--color-primary-light)] rounded-xl transition-colors"
          aria-label={word.isFavorite ? '苦手を解除' : '苦手にマーク'}
        >
          <Icon
            name="flag"
            size={16}
            filled={word.isFavorite}
            className={word.isFavorite ? 'text-[var(--color-primary)]' : 'text-[var(--color-muted)]'}
          />
        </button>
        <button
          onClick={onEdit}
          className="p-2 hover:bg-[var(--color-primary-light)] rounded-xl transition-colors"
          aria-label="編集"
        >
          <Icon name="edit" size={16} className="text-[var(--color-muted)]" />
        </button>
        <button
          onClick={onDelete}
          className="p-2 hover:bg-[var(--color-error)]/10 rounded-xl transition-colors"
          aria-label="削除"
        >
          <Icon name="delete" size={16} className="text-[var(--color-error)]" />
        </button>
      </div>
    </div>
  );
}

interface WordListProps {
  words: (Word & { projectTitle?: string })[];
  editingWordId: string | null;
  onEditStart: (wordId: string) => void;
  onEditCancel: () => void;
  onSave: (wordId: string, english: string, japanese: string) => void;
  onDelete: (wordId: string) => void;
  onToggleFavorite: (wordId: string) => void;
  onCycleVocabularyType?: (wordId: string) => void;
  onStatusChange?: (wordId: string, newStatus: WordStatus) => void;
  onAddClick?: () => void;
  onScanClick?: () => void;
  showProjectName?: boolean;
  listMaxHeightClassName?: string;
}

export function WordList({
  words,
  editingWordId,
  onEditStart,
  onEditCancel,
  onSave,
  onDelete,
  onToggleFavorite,
  onCycleVocabularyType,
  onStatusChange,
  onAddClick,
  onScanClick,
  showProjectName = false,
  listMaxHeightClassName,
}: WordListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddMenu, setShowAddMenu] = useState(false);

  // Filter words by search query
  const filteredWords = useMemo(() => {
    if (!searchQuery.trim()) return words;
    const query = searchQuery.toLowerCase().trim();
    return words.filter(
      (word) =>
        word.english.toLowerCase().includes(query) ||
        formatJapaneseForDisplay(word).toLowerCase().includes(query)
    );
  }, [words, searchQuery]);

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="w-full flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[var(--color-primary)]/10 rounded-xl">
            <Icon name="menu_book" size={20} className="text-[var(--color-primary)]" />
          </div>
          <div className="text-left">
            <h3 className="font-bold text-[var(--color-foreground)]">単語一覧</h3>
            <p className="text-sm text-[var(--color-muted)]">{words.length}語</p>
          </div>
        </div>
        {onAddClick && (
          <div className="relative">
            <button
              onClick={() => {
                if (onScanClick) {
                  setShowAddMenu(prev => !prev);
                } else {
                  onAddClick();
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-[var(--color-primary)] text-white rounded-full text-sm font-semibold hover:bg-[var(--color-primary)]/90 transition-colors"
              aria-label="単語を追加"
            >
              <Icon name="add" size={16} />
              追加
            </button>
            {showAddMenu && onScanClick && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowAddMenu(false)} />
                <div className="absolute right-0 top-full mt-2 w-48 bg-[var(--color-background)] border border-[var(--color-border)] rounded-xl shadow-lg z-50 overflow-hidden">
                  <button
                    onClick={() => {
                      setShowAddMenu(false);
                      onScanClick();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-surface)] transition-colors text-left"
                  >
                    <Icon name="photo_camera" size={18} className="text-[var(--color-primary)]" />
                    <span className="text-sm font-medium text-[var(--color-foreground)]">スキャンで追加</span>
                  </button>
                  <button
                    onClick={() => {
                      setShowAddMenu(false);
                      onAddClick();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--color-surface)] transition-colors text-left border-t border-[var(--color-border-light)]"
                  >
                    <Icon name="edit" size={18} className="text-[var(--color-muted)]" />
                    <span className="text-sm font-medium text-[var(--color-foreground)]">手動で入力</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Search input */}
      {words.length > 0 && (
        <div className="relative">
          <Icon name="search" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="単語を検索..."
            className="w-full pl-9 pr-8 py-2 bg-[var(--color-surface)] border-2 border-[var(--color-border)] rounded-xl text-sm focus:outline-none focus:border-[var(--color-primary)] transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-[var(--color-primary-light)] rounded-full"
            >
              <Icon name="close" size={16} className="text-[var(--color-muted)]" />
            </button>
          )}
        </div>
      )}

      {/* Word list */}
      <div
        className={
          listMaxHeightClassName
            ? `${listMaxHeightClassName} overflow-y-auto overscroll-contain pr-1`
            : ''
        }
      >
        {words.length === 0 ? (
          <p className="text-center text-[var(--color-muted)] py-4">単語がありません</p>
        ) : filteredWords.length === 0 ? (
          <p className="text-center text-[var(--color-muted)] py-4">「{searchQuery}」に一致する単語がありません</p>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {filteredWords.map((word) => (
              <WordItem
                key={word.id}
                word={word}
                isEditing={editingWordId === word.id}
                onEdit={() => onEditStart(word.id)}
                onCancel={onEditCancel}
                onSave={(english, japanese) => onSave(word.id, english, japanese)}
                onDelete={() => onDelete(word.id)}
                onToggleFavorite={() => onToggleFavorite(word.id)}
                onCycleVocabularyType={onCycleVocabularyType ? () => onCycleVocabularyType(word.id) : undefined}
                onStatusChange={onStatusChange ? (newStatus) => onStatusChange(word.id, newStatus) : undefined}
                showProjectName={showProjectName}
              />
            ))}
          </div>
        )}
      </div>

      {/* Search result count */}
      {searchQuery && filteredWords.length > 0 && (
        <p className="text-xs text-[var(--color-muted)] text-center">
          {filteredWords.length}件の検索結果
        </p>
      )}
    </div>
  );
}
