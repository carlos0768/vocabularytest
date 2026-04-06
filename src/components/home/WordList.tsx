'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Icon } from '@/components/ui/Icon';
import { VocabularyTypeButton } from '@/components/project/VocabularyTypeButton';
import { Button } from '@/components/ui';
import type { Word, WordStatus } from '@/types';

export function nextStatus(current: WordStatus): WordStatus {
  if (current === 'new') return 'review';
  if (current === 'review') return 'mastered';
  return 'new';
}

const STORAGE_PREFIX = 'notion_cb_mid_';

/**
 * iOS と同じ 6 段階サイクルの NotionCheckbox。
 * new(0) → review(1) → review(2) → mastered(3) → review(2) → review(1) → new(0) → …
 * review 内の中間状態は localStorage で管理。
 */
export function NotionCheckbox({
  wordId,
  status,
  onStatusChange,
}: {
  wordId: string;
  status: WordStatus;
  onStatusChange: (newStatus: WordStatus) => void;
}) {
  // filledCount: 0-3, direction: 'up' (ascending) or 'down' (descending)
  const [filledCount, setFilledCount] = useState(0);
  const [direction, setDirection] = useState<'up' | 'down'>('up');

  useEffect(() => {
    if (status === 'new') {
      setFilledCount(0);
      setDirection('up');
    } else if (status === 'mastered') {
      setFilledCount(3);
      setDirection('down');
    } else {
      // review: read mid state from localStorage
      try {
        const val = localStorage.getItem(STORAGE_PREFIX + wordId);
        if (val === 'down2') {
          setFilledCount(2);
          setDirection('down');
        } else if (val === 'down1') {
          setFilledCount(1);
          setDirection('down');
        } else if (val === '1') {
          setFilledCount(2);
          setDirection('up');
        } else {
          setFilledCount(1);
          setDirection('up');
        }
      } catch {
        setFilledCount(1);
        setDirection('up');
      }
    }
  }, [status, wordId]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (direction === 'up') {
        if (filledCount === 0) {
          // 0 → 1 (new → review)
          localStorage.setItem(STORAGE_PREFIX + wordId, '0');
          setFilledCount(1);
          onStatusChange('review');
        } else if (filledCount === 1) {
          // 1 → 2
          localStorage.setItem(STORAGE_PREFIX + wordId, '1');
          setFilledCount(2);
        } else if (filledCount === 2) {
          // 2 → 3 (review → mastered)
          localStorage.removeItem(STORAGE_PREFIX + wordId);
          setFilledCount(3);
          setDirection('down');
          onStatusChange('mastered');
        }
      } else {
        // direction === 'down'
        if (filledCount === 3) {
          // 3 → 2 (mastered → review)
          localStorage.setItem(STORAGE_PREFIX + wordId, 'down2');
          setFilledCount(2);
          onStatusChange('review');
        } else if (filledCount === 2) {
          // 2 → 1
          localStorage.setItem(STORAGE_PREFIX + wordId, 'down1');
          setFilledCount(1);
        } else if (filledCount === 1) {
          // 1 → 0 (review → new)
          localStorage.removeItem(STORAGE_PREFIX + wordId);
          setFilledCount(0);
          setDirection('up');
          onStatusChange('new');
        }
      }
    } catch {
      // localStorage unavailable
    }
  }, [filledCount, direction, onStatusChange, wordId]);

  const color =
    status === 'mastered' ? 'var(--color-success, #22c55e)' :
    status === 'review' ? 'var(--color-primary)' :
    'var(--color-muted)';

  return (
    <button
      onClick={handleClick}
      aria-label={`ステータス: ${status === 'new' ? '未学習' : status === 'review' ? '学習中' : '習得済'}`}
      className="flex-shrink-0 rounded hover:bg-[var(--color-surface)] transition-colors"
      style={{ lineHeight: 0, padding: 2 }}
    >
      <div
        className="relative rounded-sm overflow-hidden"
        style={{
          width: 11,
          height: 33,
          border: '1px solid var(--color-border)',
          borderRadius: 3,
        }}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: i * 11,
              left: 0,
              width: '100%',
              height: 11,
              background: i < filledCount ? color : 'transparent',
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

  const handleSave = () => {
    if (editEnglish.trim() && editJapanese.trim()) {
      onSave(editEnglish.trim(), editJapanese.trim());
    }
  };

  if (isEditing) {
    return (
      <div className="card p-4 border-2 border-[var(--color-primary)]">
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
    <div className="card px-3 py-3 flex items-center gap-2">
      {onStatusChange && (
        <NotionCheckbox wordId={word.id} status={word.status} onStatusChange={onStatusChange} />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-semibold text-[var(--color-foreground)] truncate min-w-0">{word.english}</span>
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
        <p className="text-sm text-[var(--color-muted)] truncate">{word.japanese}</p>
        {showProjectName && word.projectTitle && (
          <p className="text-xs text-[var(--color-primary)] mt-1 truncate">{word.projectTitle}</p>
        )}
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
        word.japanese.toLowerCase().includes(query)
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
        className={`space-y-2 ${
          listMaxHeightClassName
            ? `${listMaxHeightClassName} overflow-y-auto overscroll-contain pr-1`
            : ''
        }`}
      >
        {words.length === 0 ? (
          <p className="text-center text-[var(--color-muted)] py-4">単語がありません</p>
        ) : filteredWords.length === 0 ? (
          <p className="text-center text-[var(--color-muted)] py-4">「{searchQuery}」に一致する単語がありません</p>
        ) : (
          filteredWords.map((word) => (
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
          ))
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
