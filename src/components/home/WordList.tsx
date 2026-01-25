'use client';

import { useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, Flag, Edit2, Trash2, X, Save, Plus } from 'lucide-react';
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
      <div className="bg-white rounded-xl p-4 border border-blue-200 shadow-sm">
        <div className="space-y-3">
          <input
            type="text"
            value={editEnglish}
            onChange={(e) => setEditEnglish(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="英語"
          />
          <input
            type="text"
            value={editJapanese}
            onChange={(e) => setEditJapanese(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="日本語"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="flex-1 flex items-center justify-center gap-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Save className="w-4 h-4" />
              保存
            </button>
            <button
              onClick={onCancel}
              className="flex-1 flex items-center justify-center gap-1 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <X className="w-4 h-4" />
              キャンセル
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl p-4 flex items-center justify-between shadow-sm border border-gray-100">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 truncate">{word.english}</p>
        <p className="text-sm text-gray-500 truncate">{word.japanese}</p>
      </div>
      <div className="flex items-center gap-1 ml-2">
        <button
          onClick={onToggleFavorite}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label={word.isFavorite ? '苦手を解除' : '苦手にマーク'}
        >
          <Flag
            className={`w-4 h-4 ${
              word.isFavorite ? 'fill-orange-500 text-orange-500' : 'text-gray-400'
            }`}
          />
        </button>
        <button
          onClick={onEdit}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="編集"
        >
          <Edit2 className="w-4 h-4 text-gray-400" />
        </button>
        <button
          onClick={onDelete}
          className="p-2 hover:bg-red-50 rounded-lg transition-colors"
          aria-label="削除"
        >
          <Trash2 className="w-4 h-4 text-red-400" />
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
  onExpandChange?: (expanded: boolean) => void;
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
  onExpandChange,
}: WordListProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleToggleExpand = () => {
    const newExpanded = !isExpanded;
    setIsExpanded(newExpanded);
    onExpandChange?.(newExpanded);
  };

  return (
    <div className="bg-gray-50 rounded-2xl overflow-hidden">
      {/* Header */}
      <button
        onClick={handleToggleExpand}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-xl">
            <BookOpen className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-left">
            <h3 className="font-semibold text-gray-900">単語帳</h3>
            <p className="text-sm text-gray-500">{words.length}語</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onAddClick && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddClick();
              }}
              className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              aria-label="単語を追加"
            >
              <Plus className="w-4 h-4" />
            </button>
          )}
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          )}
        </div>
      </button>

      {/* Word list */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-2 max-h-[400px] overflow-y-auto">
          {words.length === 0 ? (
            <p className="text-center text-gray-500 py-4">単語がありません</p>
          ) : (
            words.map((word) => (
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
      )}
    </div>
  );
}
