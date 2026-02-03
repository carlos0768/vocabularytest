'use client';

import { useState, useMemo } from 'react';
import { BookOpen, Flag, Edit2, Trash2, X, Save, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui';
import type { Word } from '@/types';

interface WordItemProps {
  word: Word;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (english: string, japanese: string) => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
}

function WordItem({
  word,
  isEditing,
  onEdit,
  onCancel,
  onSave,
  onDelete,
  onToggleFavorite,
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
              <Save className="w-4 h-4 mr-1" />
              保存
            </Button>
            <Button variant="secondary" onClick={onCancel} className="flex-1" size="sm">
              <X className="w-4 h-4 mr-1" />
              キャンセル
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-4 flex items-center justify-between">
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-[var(--color-foreground)] truncate">{word.english}</p>
        <p className="text-sm text-[var(--color-muted)] truncate">{word.japanese}</p>
      </div>
      <div className="flex items-center gap-1 ml-2">
        <button
          onClick={onToggleFavorite}
          className="p-2 hover:bg-[var(--color-peach-light)] rounded-xl transition-colors"
          aria-label={word.isFavorite ? '苦手を解除' : '苦手にマーク'}
        >
          <Flag
            className={`w-4 h-4 ${
              word.isFavorite ? 'fill-[var(--color-peach)] text-[var(--color-peach)]' : 'text-[var(--color-muted)]'
            }`}
          />
        </button>
        <button
          onClick={onEdit}
          className="p-2 hover:bg-[var(--color-peach-light)] rounded-xl transition-colors"
          aria-label="編集"
        >
          <Edit2 className="w-4 h-4 text-[var(--color-muted)]" />
        </button>
        <button
          onClick={onDelete}
          className="p-2 hover:bg-[var(--color-error)]/10 rounded-xl transition-colors"
          aria-label="削除"
        >
          <Trash2 className="w-4 h-4 text-[var(--color-error)]" />
        </button>
      </div>
    </div>
  );
}

interface WordListProps {
  words: Word[];
  editingWordId: string | null;
  onEditStart: (wordId: string) => void;
  onEditCancel: () => void;
  onSave: (wordId: string, english: string, japanese: string) => void;
  onDelete: (wordId: string) => void;
  onToggleFavorite: (wordId: string) => void;
  onAddClick?: () => void;
}

export function WordList({
  words,
  editingWordId,
  onEditStart,
  onEditCancel,
  onSave,
  onDelete,
  onToggleFavorite,
  onAddClick,
}: WordListProps) {
  const [searchQuery, setSearchQuery] = useState('');

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
            <BookOpen className="w-5 h-5 text-[var(--color-primary)]" />
          </div>
          <div className="text-left">
            <h3 className="font-bold text-[var(--color-foreground)]">単語一覧</h3>
            <p className="text-sm text-[var(--color-muted)]">{words.length}語</p>
          </div>
        </div>
        {onAddClick && (
          <button
            onClick={() => {
              onAddClick();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-[var(--color-primary)] text-white rounded-full text-sm font-semibold hover:bg-[var(--color-primary)]/90 transition-colors"
            aria-label="単語を追加"
          >
            <Plus className="w-4 h-4" />
            追加
          </button>
        )}
      </div>

      {/* Search input */}
      {words.length > 0 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-muted)]" />
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
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 hover:bg-[var(--color-peach-light)] rounded-full"
            >
              <X className="w-4 h-4 text-[var(--color-muted)]" />
            </button>
          )}
        </div>
      )}

      {/* Word list */}
      <div className="space-y-2">
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
