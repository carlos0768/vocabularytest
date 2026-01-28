'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  BookOpen,
  Settings,
  Sparkles,
  Check,
  Flag,
  ChevronDown,
  Play,
  Layers,
  Plus,
  Edit2,
  Trash2,
  X,
  Save,
  Share2,
  Link as LinkIcon,
  Loader2,
  Camera,
  CircleDot,
  BookText,
  Star,
  Languages,
  Highlighter,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useWordCount } from '@/hooks/use-word-count';
import { ProgressSteps, type ProgressStep, useToast, DeleteConfirmModal, Button } from '@/components/ui';
import { ScanLimitModal, WordLimitModal, WordLimitBanner } from '@/components/limits';
import { InlineFlashcard, StudyModeCard, WordList } from '@/components/home';
import { getRepository } from '@/lib/db';
import { remoteRepository } from '@/lib/db/remote-repository';
import { getGuestUserId, FREE_WORD_LIMIT, getWrongAnswers, removeWrongAnswer, type WrongAnswer } from '@/lib/utils';
import { processImageFile } from '@/lib/image-utils';
import type { Project, Word, ScanJob } from '@/types';
import type { ExtractMode, EikenLevel } from '@/app/api/extract/route';

// EIKEN level options for the dropdown
const EIKEN_LEVELS: { value: EikenLevel; label: string }[] = [
  { value: null, label: 'フィルターなし' },
  { value: '5', label: '5級' },
  { value: '4', label: '4級' },
  { value: '3', label: '3級' },
  { value: 'pre2', label: '準2級' },
  { value: '2', label: '2級' },
  { value: 'pre1', label: '準1級' },
  { value: '1', label: '1級' },
];

// Scan mode types (ExtractMode already includes 'idiom')
type ScanMode = ExtractMode;

// Scan mode selection modal - EIKEN filter is now a separate mode
function ScanModeModal({
  isOpen,
  onClose,
  onSelectMode,
  isPro,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelectMode: (mode: ScanMode, eikenLevel: EikenLevel) => void;
  isPro: boolean;
}) {
  const [showEikenPicker, setShowEikenPicker] = useState(false);
  const [selectedEiken, setSelectedEiken] = useState<EikenLevel>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setShowEikenPicker(false);
      setSelectedEiken(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // EIKEN level picker sub-view
  if (showEikenPicker) {
    return (
      <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-lg">
          <h2 className="text-base font-medium mb-2 text-center text-gray-900">
            英検レベルを選択
          </h2>
          <p className="text-sm text-gray-500 text-center mb-4">
            抽出する単語のレベルを選んでください
          </p>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {EIKEN_LEVELS.filter(l => l.value !== null).map((level) => (
              <button
                key={level.value}
                onClick={() => setSelectedEiken(level.value)}
                className={`w-full flex items-center justify-between px-4 py-3 border rounded-lg transition-colors text-left ${
                  selectedEiken === level.value
                    ? 'border-orange-400 bg-orange-50 text-orange-700'
                    : 'border-gray-200 hover:border-gray-300 text-gray-700'
                }`}
              >
                <span className="font-medium">{level.label}</span>
                {selectedEiken === level.value && (
                  <Check className="w-5 h-5 text-orange-600" />
                )}
              </button>
            ))}
          </div>

          <div className="mt-4 flex gap-3">
            <button
              onClick={() => setShowEikenPicker(false)}
              className="flex-1 py-2.5 bg-gray-100 rounded-lg text-gray-700 text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              戻る
            </button>
            <button
              onClick={() => {
                if (selectedEiken) {
                  onSelectMode('eiken', selectedEiken);
                }
              }}
              disabled={!selectedEiken}
              className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                selectedEiken
                  ? 'bg-orange-500 text-white hover:bg-orange-600'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
              }`}
            >
              スキャン開始
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main mode selection view
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-lg">
        <h2 className="text-base font-medium mb-2 text-center text-gray-900">
          抽出モードを選択
        </h2>
        <p className="text-sm text-gray-500 text-center mb-4">
          どのように単語を抽出しますか？
        </p>

        <div className="space-y-3">
          {/* All words mode */}
          <button
            onClick={() => onSelectMode('all', null)}
            className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-xl hover:border-blue-300 hover:bg-blue-50/50 transition-colors text-left"
          >
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
              <Camera className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">すべての単語を抽出</p>
              <p className="text-sm text-gray-500">写真内のすべての英単語を抽出します</p>
            </div>
          </button>

          {/* Circled words mode (Pro) */}
          <button
            onClick={() => onSelectMode('circled', null)}
            className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-xl hover:border-purple-300 hover:bg-purple-50/50 transition-colors text-left relative"
          >
            <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
              <CircleDot className="w-6 h-6 text-purple-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium text-gray-900">丸をつけた単語だけ</p>
                {!isPro && (
                  <span className="flex items-center gap-1 text-xs bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded font-medium">
                    <Sparkles className="w-3 h-3" />
                    Pro
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500">マークした単語だけを抽出します</p>
            </div>
          </button>

          {/* Highlighted words mode (Pro) */}
          <button
            onClick={() => onSelectMode('highlighted', null)}
            className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-xl hover:border-yellow-400 hover:bg-yellow-50/50 transition-colors text-left relative"
          >
            <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center flex-shrink-0">
              <Highlighter className="w-6 h-6 text-yellow-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium text-gray-900">マーカーを引いた単語だけ</p>
                {!isPro && (
                  <span className="flex items-center gap-1 text-xs bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded font-medium">
                    <Sparkles className="w-3 h-3" />
                    Pro
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500">蛍光ペンでハイライトした単語を抽出します</p>
            </div>
          </button>

          {/* EIKEN filter mode (Pro) - NEW */}
          <button
            onClick={() => setShowEikenPicker(true)}
            className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-xl hover:border-orange-300 hover:bg-orange-50/50 transition-colors text-left"
          >
            <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-6 h-6 text-orange-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium text-gray-900">英検レベルでフィルター</p>
                {!isPro && (
                  <span className="flex items-center gap-1 text-xs bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded font-medium">
                    <Sparkles className="w-3 h-3" />
                    Pro
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500">指定した級の単語だけを抽出します</p>
            </div>
          </button>

          {/* Idiom mode (Pro) */}
          <button
            onClick={() => onSelectMode('idiom', null)}
            className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-xl hover:border-teal-300 hover:bg-teal-50/50 transition-colors text-left"
          >
            <div className="w-12 h-12 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0">
              <Languages className="w-6 h-6 text-teal-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium text-gray-900">熟語・イディオム</p>
                {!isPro && (
                  <span className="flex items-center gap-1 text-xs bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded font-medium">
                    <Sparkles className="w-3 h-3" />
                    Pro
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500">熟語・句動詞を抽出します</p>
            </div>
          </button>

        </div>
        <button
          onClick={onClose}
          className="mt-4 w-full py-2.5 bg-gray-100 rounded-lg text-gray-700 text-sm font-medium hover:bg-gray-200 transition-colors"
        >
          キャンセル
        </button>
      </div>
    </div>
  );
}

// Project name input modal component
function ProjectNameModal({
  isOpen,
  onClose,
  onConfirm,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (name: string) => void;
}) {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName) {
      onConfirm(trimmedName);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-lg">
        <h2 className="text-base font-medium mb-4 text-center text-gray-900">
          単語帳の名前
        </h2>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: 英語テスト対策"
            className="w-full px-4 py-3 border border-gray-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            maxLength={50}
          />
          <div className="flex gap-3 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-gray-100 rounded-lg text-gray-700 text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="flex-1 py-2.5 bg-blue-600 rounded-lg text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              次へ
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Edit project name modal component
function EditProjectNameModal({
  isOpen,
  onClose,
  onConfirm,
  currentName,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (newName: string) => void;
  currentName: string;
}) {
  const [name, setName] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setName(currentName);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, currentName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && name !== currentName) {
      onConfirm(name.trim());
    } else if (name === currentName) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-lg">
        <h2 className="text-base font-medium mb-4 text-center text-gray-900">
          単語帳の名前を変更
        </h2>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="単語帳の名前"
            className="w-full px-4 py-3 border border-gray-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            maxLength={50}
          />
          <div className="flex gap-3 mt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-gray-100 rounded-lg text-gray-700 text-sm font-medium hover:bg-gray-200 transition-colors"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={!name.trim() || name === currentName}
              className="flex-1 py-2.5 bg-blue-600 rounded-lg text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              変更
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Manual word input modal component
function ManualWordInputModal({
  isOpen,
  onClose,
  onConfirm,
  isLoading,
  english,
  setEnglish,
  japanese,
  setJapanese,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  english: string;
  setEnglish: (value: string) => void;
  japanese: string;
  setJapanese: (value: string) => void;
}) {
  const englishInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => englishInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (english.trim() && japanese.trim()) {
      onConfirm();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-lg">
        <h2 className="text-base font-medium mb-4 text-center text-gray-900">
          単語を手で入力
        </h2>
        <form onSubmit={handleSubmit}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                英単語
              </label>
              <input
                ref={englishInputRef}
                type="text"
                value={english}
                onChange={(e) => setEnglish(e.target.value)}
                placeholder="例: beautiful"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isLoading}
                maxLength={50}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1.5">
                日本語訳
              </label>
              <input
                type="text"
                value={japanese}
                onChange={(e) => setJapanese(e.target.value)}
                placeholder="例: 美しい"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isLoading}
                maxLength={100}
              />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 py-2.5 bg-gray-100 rounded-lg text-gray-700 text-sm font-medium hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={!english.trim() || !japanese.trim() || isLoading}
              className="flex-1 py-2.5 bg-blue-600 rounded-lg text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Processing modal component
function ProcessingModal({
  steps,
  onClose,
}: {
  steps: ProgressStep[];
  onClose?: () => void;
}) {
  const hasError = steps.some((s) => s.status === 'error');

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-lg">
        <h2 className="text-base font-medium mb-4 text-center text-gray-900">
          {hasError ? 'エラーが発生しました' : '解析中'}
        </h2>
        <ProgressSteps steps={steps} />
        {hasError && onClose && (
          <button
            onClick={onClose}
            className="mt-4 w-full py-2 bg-gray-100 rounded-lg text-gray-700 text-sm hover:bg-gray-200 transition-colors"
          >
            閉じる
          </button>
        )}
      </div>
    </div>
  );
}

// Project selection bottom sheet component
function ProjectSelectionSheet({
  isOpen,
  onClose,
  projects,
  currentProjectIndex,
  onSelectProject,
  onSelectFavorites,
  onSelectWrongAnswers,
  onCreateNewProject,
  onToggleProjectFavorite,
  onEditProject,
  showFavoritesOnly,
  showWrongAnswers,
  favoriteWords,
  wrongAnswers,
  projectFavoriteCounts,
}: {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  currentProjectIndex: number;
  onSelectProject: (index: number) => void;
  onSelectFavorites: () => void;
  onSelectWrongAnswers: () => void;
  onCreateNewProject: () => void;
  onToggleProjectFavorite: (projectId: string) => void;
  onEditProject: (projectId: string, currentName: string) => void;
  showFavoritesOnly: boolean;
  showWrongAnswers: boolean;
  favoriteWords: Word[];
  wrongAnswers: WrongAnswer[];
  projectFavoriteCounts: Record<string, number>;
}) {
  if (!isOpen) return null;

  // Sort projects: bookmarked first, then by creation date
  const sortedProjects = [...projects].sort((a, b) => {
    if (a.isFavorite && !b.isFavorite) return -1;
    if (!a.isFavorite && b.isFavorite) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  // Get original index for selection
  const getOriginalIndex = (project: Project) => projects.findIndex(p => p.id === project.id);

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0"
        onClick={onClose}
      />

      {/* Full screen sheet */}
      <div
        className="absolute inset-0 bg-gray-50 flex flex-col"
        style={{ animation: 'slideUp 0.3s ease-out' }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-gray-50 px-4 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-200 transition-colors"
            >
              <X className="w-6 h-6 text-emerald-600" />
            </button>
            <h2 className="text-base font-medium text-gray-900">学習コース選択</h2>
            <div className="w-10" /> {/* Spacer for centering */}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-4 pb-8">
          {/* Wrong Answers Section */}
          {wrongAnswers.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <h3 className="font-medium text-gray-700">間違え一覧</h3>
              </div>
              <button
                onClick={() => {
                  onSelectWrongAnswers();
                  onClose();
                }}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                  showWrongAnswers
                    ? 'border-red-500 bg-red-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">間違えた単語を復習</p>
                    <p className="text-sm text-gray-500 mt-0.5">{wrongAnswers.length}語の間違えた単語</p>
                  </div>
                  {showWrongAnswers && (
                    <div className="w-6 h-6 bg-red-500 rounded-full flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                </div>
              </button>
            </div>
          )}

          {/* All Favorites Section */}
          {favoriteWords.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Flag className="w-5 h-5 text-orange-500" />
                <h3 className="font-medium text-gray-700">苦手な単語（すべて）</h3>
              </div>
              <button
                onClick={() => {
                  onSelectFavorites();
                  onClose();
                }}
                className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                  showFavoritesOnly
                    ? 'border-orange-500 bg-orange-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">全プロジェクトの苦手単語</p>
                    <p className="text-sm text-gray-500 mt-0.5">{favoriteWords.length}語の苦手な単語</p>
                  </div>
                  {showFavoritesOnly && (
                    <div className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                  )}
                </div>
              </button>
            </div>
          )}

          {/* Projects Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-blue-500" />
                <h3 className="font-medium text-gray-700">単語帳一覧</h3>
              </div>
            </div>

            {/* New Project Button */}
            <button
              onClick={() => {
                onClose();
                onCreateNewProject();
              }}
              className="w-full flex items-center gap-3 p-4 mb-2 rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/50 hover:bg-blue-50 hover:border-blue-400 transition-all"
            >
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <Plus className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-left">
                <p className="font-medium text-blue-700">新しい単語帳を作成</p>
                <p className="text-sm text-blue-500">写真から単語を抽出</p>
              </div>
            </button>

            <div className="space-y-2">
              {sortedProjects.map((project) => {
                const originalIndex = getOriginalIndex(project);
                const isSelected = originalIndex === currentProjectIndex && !showFavoritesOnly;
                const favoriteCount = projectFavoriteCounts[project.id] || 0;
                return (
                  <div
                    key={project.id}
                    className={`w-full p-4 rounded-xl border-2 transition-all ${
                      isSelected
                        ? 'border-emerald-500 bg-white'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => {
                          onSelectProject(originalIndex);
                          onClose();
                        }}
                        className="flex-1 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900">{project.title}</p>
                          {project.isFavorite && (
                            <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-sm text-gray-500">
                            {new Date(project.createdAt).toLocaleDateString('ja-JP')}に作成
                          </p>
                          {favoriteCount > 0 && (
                            <span className="flex items-center gap-1 text-sm text-orange-600">
                              <Flag className="w-3 h-3 fill-orange-500" />
                              {favoriteCount}
                            </span>
                          )}
                        </div>
                      </button>
                      <div className="flex items-center gap-2 ml-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleProjectFavorite(project.id);
                          }}
                          className="p-2 hover:bg-yellow-50 rounded-full transition-colors"
                          title={project.isFavorite ? 'ブックマーク解除' : 'ブックマーク'}
                        >
                          <Star
                            className={`w-5 h-5 ${
                              project.isFavorite
                                ? 'fill-yellow-400 text-yellow-400'
                                : 'text-gray-300 hover:text-yellow-400'
                            }`}
                          />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditProject(project.id, project.title);
                          }}
                          className="p-2 hover:bg-blue-50 rounded-full transition-colors"
                          title="名前を編集"
                        >
                          <Edit2 className="w-4 h-4 text-gray-500 hover:text-blue-600" />
                        </button>
                        {isSelected && (
                          <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center">
                            <Check className="w-4 h-4 text-white" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Word item component
function WordItem({
  word,
  isEditing,
  onEdit,
  onCancel,
  onSave,
  onDelete,
  onToggleFavorite,
}: {
  word: Word;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (english: string, japanese: string) => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
}) {
  const [english, setEnglish] = useState(word.english);
  const [japanese, setJapanese] = useState(word.japanese);

  if (isEditing) {
    return (
      <div className="bg-white rounded-xl border-2 border-blue-500 p-4">
        <div className="space-y-3">
          <input
            type="text"
            value={english}
            onChange={(e) => setEnglish(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 outline-none text-lg"
            autoFocus
          />
          <input
            type="text"
            value={japanese}
            onChange={(e) => setJapanese(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 outline-none"
          />
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onCancel} className="flex-1">
              <X className="w-4 h-4 mr-1" />
              キャンセル
            </Button>
            <Button size="sm" onClick={() => onSave(english, japanese)} className="flex-1">
              <Save className="w-4 h-4 mr-1" />
              保存
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 group hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-lg font-semibold text-gray-900">{word.english}</p>
            {word.isFavorite && (
              <Flag className="w-4 h-4 fill-orange-500 text-orange-500" />
            )}
          </div>
          <p className="text-gray-500 mt-0.5">{word.japanese}</p>
        </div>
        <div className="flex gap-1 ml-3 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
          <button
            onClick={onToggleFavorite}
            className="p-2 hover:bg-orange-50 rounded-full transition-colors"
          >
            <Flag
              className={`w-4 h-4 ${
                word.isFavorite ? 'fill-orange-500 text-orange-500' : 'text-gray-400'
              }`}
            />
          </button>
          <button
            onClick={onEdit}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <Edit2 className="w-4 h-4 text-gray-500" />
          </button>
          <button
            onClick={onDelete}
            className="p-2 hover:bg-red-50 rounded-full transition-colors"
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { user, subscription, isAuthenticated, isPro, loading: authLoading } = useAuth();
  const { isAlmostFull, isAtLimit, refresh: refreshWordCount } = useWordCount();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Projects & navigation
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectIndex, setCurrentProjectIndex] = useState(0);
  const [words, setWords] = useState<Word[]>([]);
  const [allFavoriteWords, setAllFavoriteWords] = useState<Word[]>([]); // All favorite words across all projects
  const [projectFavoriteCounts, setProjectFavoriteCounts] = useState<Record<string, number>>({}); // Favorite count per project
  const [wrongAnswers, setWrongAnswers] = useState<WrongAnswer[]>([]); // Wrong answers list
  const [showWrongAnswers, setShowWrongAnswers] = useState(false); // Show wrong answers mode
  const [loading, setLoading] = useState(true);
  const [wordsLoading, setWordsLoading] = useState(false);
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);

  // Word editing
  const [editingWordId, setEditingWordId] = useState<string | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [isWordListExpanded, setIsWordListExpanded] = useState(false);

  // Sharing
  const [sharing, setSharing] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  // Scan processing
  const [processing, setProcessing] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<ProgressStep[]>([]);
  const [, setScanInfo] = useState<{ currentCount: number; limit: number | null; isPro: boolean } | null>(null);
  const [totalWords, setTotalWords] = useState(0);

  // Modals
  const [showScanLimitModal, setShowScanLimitModal] = useState(false);
  const [showWordLimitModal, setShowWordLimitModal] = useState(false);
  const [showProjectNameModal, setShowProjectNameModal] = useState(false);
  const [showScanModeModal, setShowScanModeModal] = useState(false);
  const [isAddingToExisting, setIsAddingToExisting] = useState(false); // true = add to current project, false = new project
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [selectedScanMode, setSelectedScanMode] = useState<ScanMode>('all');
  const [selectedEikenLevel, setSelectedEikenLevel] = useState<EikenLevel>(null);

  // Delete modals
  const [deleteWordModalOpen, setDeleteWordModalOpen] = useState(false);
  const [deleteWordTargetId, setDeleteWordTargetId] = useState<string | null>(null);
  const [deleteWordLoading, setDeleteWordLoading] = useState(false);
  const [deleteProjectModalOpen, setDeleteProjectModalOpen] = useState(false);
  const [deleteProjectLoading, setDeleteProjectLoading] = useState(false);

  // Edit project name modal
  const [editProjectModalOpen, setEditProjectModalOpen] = useState(false);
  const [editProjectId, setEditProjectId] = useState<string | null>(null);
  const [editProjectNewName, setEditProjectNewName] = useState('');

  // Manual word input modal
  const [showManualWordModal, setShowManualWordModal] = useState(false);
  const [manualWordEnglish, setManualWordEnglish] = useState('');
  const [manualWordJapanese, setManualWordJapanese] = useState('');
  const [manualWordSaving, setManualWordSaving] = useState(false);

  // Background scan job polling
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  // Get repository
  const subscriptionStatus = subscription?.status || 'free';
  const repository = useMemo(() => getRepository(subscriptionStatus), [subscriptionStatus]);

  // Current project
  const currentProject = projects[currentProjectIndex] || null;

  // Helper: Stop polling
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    setCurrentJobId(null);
  }, []);

  // Helper: Handle completed job
  const handleCompletedJob = useCallback(async (job: ScanJob) => {
    if (!job.result) return;

    // Stop any ongoing polling first
    stopPolling();
    setCurrentJobId(null);
    setProcessing(false);

    // Save result to sessionStorage
    sessionStorage.setItem('scanvocab_extracted_words', JSON.stringify(job.result));
    if (job.project_id) {
      sessionStorage.setItem('scanvocab_existing_project_id', job.project_id);
    }
    if (job.project_title) {
      sessionStorage.setItem('scanvocab_project_name', job.project_title);
    }

    // Delete the job
    try {
      await fetch(`/api/scan-jobs/${job.id}`, { method: 'DELETE' });
    } catch (error) {
      console.error('Failed to delete completed job:', error);
    }

    // Navigate to confirm page
    router.push('/scan/confirm');
  }, [router, stopPolling]);

  // Helper: Start polling for job status
  const startPolling = useCallback((jobId: string) => {
    // Start processing
    fetch(`/api/scan-jobs/${jobId}/process`, { method: 'POST' })
      .catch(err => console.error('Failed to start processing:', err));

    // Poll every 2 seconds
    pollingRef.current = setInterval(async () => {
      try {
        const response = await fetch(`/api/scan-jobs/${jobId}`);
        const data = await response.json();

        if (!data.success) {
          stopPolling();
          setProcessing(false);
          // 404 (job not found) means job was already processed/deleted - silently stop
          // This can happen when returning from confirm page after successful save
          if (response.status === 404) {
            console.log('Job not found (already processed), stopping poll');
            return;
          }
          showToast({ message: data.error || 'エラーが発生しました', type: 'error' });
          return;
        }

        const job = data.job as ScanJob;

        if (job.status === 'completed') {
          stopPolling();
          setProcessingSteps((prev) =>
            prev.map((s) =>
              s.id === 'analyze'
                ? { ...s, status: 'complete' }
                : s.id === 'generate'
                ? { ...s, status: 'complete' }
                : s
            )
          );

          // Wait a bit before navigating
          setTimeout(() => {
            handleCompletedJob(job);
          }, 500);
        } else if (job.status === 'failed') {
          stopPolling();
          setProcessing(false);
          setProcessingSteps((prev) =>
            prev.map((s) =>
              s.status === 'active' || s.status === 'pending'
                ? { ...s, status: 'error', label: job.error_message || '処理に失敗しました' }
                : s
            )
          );
        } else if (job.status === 'processing') {
          // Still processing - update UI
          setProcessingSteps((prev) =>
            prev.map((s) =>
              s.id === 'upload'
                ? { ...s, status: 'complete' }
                : s.id === 'analyze'
                ? { ...s, status: 'active' }
                : s
            )
          );
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    }, 2000);
  }, [stopPolling, handleCompletedJob, showToast]);

  // Check for pending jobs - extracted as callback for reuse
  const checkPendingJobs = useCallback(async (): Promise<boolean> => {
    if (!isAuthenticated) return false;

    try {
      const response = await fetch('/api/scan-jobs');
      const data = await response.json();

      if (data.success && data.jobs && data.jobs.length > 0) {
        const pendingJob = data.jobs.find((j: ScanJob) => j.status === 'pending' || j.status === 'processing');
        const completedJob = data.jobs.find((j: ScanJob) => j.status === 'completed');

        if (completedJob) {
          // Completed job found - show results
          handleCompletedJob(completedJob);
          return true;
        } else if (pendingJob) {
          // Processing job found - start polling
          setCurrentJobId(pendingJob.id);
          setProcessing(true);
          setProcessingSteps([
            { id: 'upload', label: '画像をアップロード中...', status: 'complete' },
            { id: 'analyze', label: '文字を解析中...', status: 'active' },
            { id: 'generate', label: '問題を作成中...', status: 'pending' },
          ]);
          startPolling(pendingJob.id);
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error('Failed to check pending jobs:', error);
      return false;
    }
  }, [isAuthenticated, handleCompletedJob, startPolling]);

  // Check for pending jobs on app startup
  useEffect(() => {
    if (authLoading || !isAuthenticated) return;

    checkPendingJobs();

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
    };
  }, [authLoading, isAuthenticated, checkPendingJobs]);

  // Handle PWA returning from background - check for pending/completed jobs
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // App returned to foreground - check for any pending jobs
        // This handles the case where a fetch was interrupted when app went to background
        checkPendingJobs();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, checkPendingJobs]);

  // Scan info is populated from server responses

  // Control body scroll based on word list expansion (mobile Safari requires touch event prevention)
  // But allow scroll when modals are open
  useEffect(() => {
    const preventScroll = (e: TouchEvent) => {
      // Allow scroll if any modal/sheet is open or word list is expanded
      if (isWordListExpanded || isProjectDropdownOpen || showScanModeModal) {
        return;
      }
      e.preventDefault();
    };

    if (!isWordListExpanded && !isProjectDropdownOpen && !showScanModeModal) {
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.height = '100%';
      document.addEventListener('touchmove', preventScroll, { passive: false });
    } else {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.height = '';
    }

    return () => {
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.height = '';
      document.removeEventListener('touchmove', preventScroll);
    };
  }, [isWordListExpanded, isProjectDropdownOpen, showScanModeModal]);

  // Load projects
  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      const userId = isPro && user ? user.id : getGuestUserId();
      const data = await repository.getProjects(userId);
      setProjects(data);

      // Calculate total words and collect all favorite words
      let total = 0;
      const allFavorites: Word[] = [];
      const favoriteCounts: Record<string, number> = {};

      for (const project of data) {
        const projectWords = await repository.getWords(project.id);
        total += projectWords.length;

        // Count and collect favorites for this project
        const projectFavorites = projectWords.filter(w => w.isFavorite);
        favoriteCounts[project.id] = projectFavorites.length;
        allFavorites.push(...projectFavorites);
      }

      setTotalWords(total);
      setAllFavoriteWords(allFavorites);
      setProjectFavoriteCounts(favoriteCounts);

      // Load wrong answers
      const wrongAnswersList = getWrongAnswers();
      setWrongAnswers(wrongAnswersList);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setLoading(false);
    }
  }, [isPro, user, repository]);

  // Load words for current project
  const loadWords = useCallback(async () => {
    if (!currentProject) {
      setWords([]);
      return;
    }

    try {
      setWordsLoading(true);
      const wordsData = await repository.getWords(currentProject.id);
      setWords(wordsData);
    } catch (error) {
      console.error('Failed to load words:', error);
    } finally {
      setWordsLoading(false);
    }
  }, [currentProject, repository]);

  // Load projects after auth
  useEffect(() => {
    if (!authLoading) {
      loadProjects();
    }
  }, [authLoading, loadProjects]);

  // Load words when project changes
  useEffect(() => {
    loadWords();
  }, [loadWords]);

  // Convert wrong answers to Word type for display
  const wrongAnswerWords: Word[] = useMemo(() => {
    return wrongAnswers.map(wa => ({
      id: wa.wordId,
      projectId: wa.projectId,
      english: wa.english,
      japanese: wa.japanese,
      distractors: wa.distractors,
      status: 'review' as const,
      isFavorite: false,
      createdAt: new Date(wa.lastWrongAt).toISOString(),
      // Spaced repetition defaults
      easeFactor: 2.5,
      intervalDays: 0,
      repetition: 0,
    }));
  }, [wrongAnswers]);

  const filteredWords = showWrongAnswers
    ? wrongAnswerWords
    : showFavoritesOnly
    ? allFavoriteWords
    : words;

  // Navigation
  const selectProject = (index: number) => {
    setCurrentProjectIndex(index);
    setShowFavoritesOnly(false);
    setShowWrongAnswers(false);
    setIsProjectDropdownOpen(false);
  };

  // Word handlers
  const handleDeleteWord = (wordId: string) => {
    setDeleteWordTargetId(wordId);
    setDeleteWordModalOpen(true);
  };

  const handleConfirmDeleteWord = async () => {
    if (!deleteWordTargetId) return;

    setDeleteWordLoading(true);
    try {
      await repository.deleteWord(deleteWordTargetId);
      setWords((prev) => prev.filter((w) => w.id !== deleteWordTargetId));
      showToast({ message: '単語を削除しました', type: 'success' });
    } catch (error) {
      console.error('Failed to delete word:', error);
      showToast({ message: '削除に失敗しました', type: 'error' });
    } finally {
      setDeleteWordLoading(false);
      setDeleteWordModalOpen(false);
      setDeleteWordTargetId(null);
    }
  };

  const handleUpdateWord = async (wordId: string, english: string, japanese: string) => {
    // Find the original word to check if japanese was changed
    const originalWord = words.find((w) => w.id === wordId);
    const japaneseChanged = originalWord && originalWord.japanese !== japanese;

    // Update word immediately with new english/japanese
    await repository.updateWord(wordId, { english, japanese });
    setWords((prev) =>
      prev.map((w) => (w.id === wordId ? { ...w, english, japanese } : w))
    );
    setEditingWordId(null);

    // If japanese was changed, regenerate distractors in background
    if (japaneseChanged) {
      try {
        const response = await fetch('/api/regenerate-distractors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ english, japanese }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.distractors) {
            // Update word with new distractors
            await repository.updateWord(wordId, { distractors: data.distractors });
            setWords((prev) =>
              prev.map((w) => (w.id === wordId ? { ...w, distractors: data.distractors } : w))
            );
          }
        }
      } catch (error) {
        // Silently fail - old distractors will remain
        console.error('Failed to regenerate distractors:', error);
      }
    }
  };

  const handleToggleFavorite = async (wordId: string) => {
    // Find word in current project words or all favorite words
    const word = words.find((w) => w.id === wordId) || allFavoriteWords.find((w) => w.id === wordId);
    if (!word) return;
    const newFavorite = !word.isFavorite;
    await repository.updateWord(wordId, { isFavorite: newFavorite });

    // Update current project words
    setWords((prev) =>
      prev.map((w) => (w.id === wordId ? { ...w, isFavorite: newFavorite } : w))
    );

    // Update all favorite words
    if (newFavorite) {
      // Add to favorites
      setAllFavoriteWords((prev) => [...prev, { ...word, isFavorite: true }]);
    } else {
      // Remove from favorites
      setAllFavoriteWords((prev) => prev.filter((w) => w.id !== wordId));
    }

    // Update project favorite counts
    const projectId = word.projectId;
    setProjectFavoriteCounts((prev) => ({
      ...prev,
      [projectId]: (prev[projectId] || 0) + (newFavorite ? 1 : -1),
    }));
  };

  // Toggle project bookmark
  const handleToggleProjectFavorite = async (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;

    const newFavorite = !project.isFavorite;
    try {
      await repository.updateProject(projectId, { isFavorite: newFavorite });
      setProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, isFavorite: newFavorite } : p))
      );
    } catch (error) {
      console.error('Failed to toggle project favorite:', error);
      showToast({ message: 'ブックマークの変更に失敗しました', type: 'error' });
    }
  };

  // Project handlers
  const handleDeleteProject = () => {
    setDeleteProjectModalOpen(true);
  };

  const handleConfirmDeleteProject = async () => {
    if (!currentProject) return;

    setDeleteProjectLoading(true);
    try {
      await repository.deleteProject(currentProject.id);
      const newProjects = projects.filter((p) => p.id !== currentProject.id);
      setProjects(newProjects);
      if (currentProjectIndex >= newProjects.length && newProjects.length > 0) {
        setCurrentProjectIndex(newProjects.length - 1);
      }
      refreshWordCount();
      showToast({ message: '単語帳を削除しました', type: 'success' });
    } catch (error) {
      console.error('Failed to delete project:', error);
      showToast({ message: '削除に失敗しました', type: 'error' });
    } finally {
      setDeleteProjectLoading(false);
      setDeleteProjectModalOpen(false);
    }
  };

  const handleEditProjectName = (projectId: string, currentName: string) => {
    setEditProjectId(projectId);
    setEditProjectNewName(currentName);
    setEditProjectModalOpen(true);
  };

  const handleConfirmEditProjectName = async (newName: string) => {
    if (!editProjectId || !newName.trim()) return;

    try {
      await repository.updateProject(editProjectId, { title: newName.trim() });
      setProjects((prev) =>
        prev.map((p) => (p.id === editProjectId ? { ...p, title: newName.trim() } : p))
      );
      showToast({ message: '単語帳の名前を変更しました', type: 'success' });
    } catch (error) {
      console.error('Failed to update project name:', error);
      showToast({ message: '名前の変更に失敗しました', type: 'error' });
    } finally {
      setEditProjectModalOpen(false);
      setEditProjectId(null);
      setEditProjectNewName('');
    }
  };

  const handleSaveManualWord = async () => {
    if (!currentProject) {
      showToast({ message: 'まず単語帳を選択してください', type: 'error' });
      return;
    }

    if (!manualWordEnglish.trim() || !manualWordJapanese.trim()) {
      showToast({ message: '英単語と日本語訳を入力してください', type: 'error' });
      return;
    }

    setManualWordSaving(true);
    try {
      await repository.createWords([
        {
          projectId: currentProject.id,
          english: manualWordEnglish.trim(),
          japanese: manualWordJapanese.trim(),
          distractors: [],
          exampleSentence: '',
          exampleSentenceJa: '',
        },
      ]);

      showToast({ message: '単語を追加しました', type: 'success' });
      setManualWordEnglish('');
      setManualWordJapanese('');
      setShowManualWordModal(false);
      loadWords();
      refreshWordCount();
    } catch (error) {
      console.error('Failed to save manual word:', error);
      showToast({ message: '単語の保存に失敗しました', type: 'error' });
    } finally {
      setManualWordSaving(false);
    }
  };

  // Share handler
  const handleShare = async () => {
    if (!currentProject || !user) return;

    setSharing(true);
    try {
      let shareId = currentProject.shareId;
      if (!shareId) {
        // Retry up to 2 times if first attempt fails
        let lastError: Error | null = null;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            shareId = await remoteRepository.generateShareId(currentProject.id);
            break;
          } catch (error) {
            console.error(`Share ID generation attempt ${attempt + 1} failed:`, error);
            lastError = error instanceof Error ? error : new Error('Unknown error');
            // Wait a bit before retry
            if (attempt < 1) {
              await new Promise(resolve => setTimeout(resolve, 500));
            }
          }
        }

        if (!shareId) {
          throw lastError || new Error('Failed to generate share ID');
        }

        setProjects((prev) =>
          prev.map((p) => (p.id === currentProject.id ? { ...p, shareId } : p))
        );
      }
      const shareUrl = `${window.location.origin}/share/${shareId}`;
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch (error) {
      console.error('Failed to share:', error);
      showToast({ message: '共有リンクの生成に失敗しました', type: 'error' });
    } finally {
      setSharing(false);
    }
  };

  // Scan handlers
  const canScan = isAuthenticated;

  const handleScanButtonClick = (addToExisting: boolean = false) => {
    setIsAddingToExisting(addToExisting);
    setShowScanModeModal(true);
  };

  const handleScanModeSelect = (mode: ScanMode, eikenLevel: EikenLevel) => {
    setShowScanModeModal(false);

    // Pro-only features: circled, highlighted, eiken filter, idiom modes
    if ((mode === 'circled' || mode === 'highlighted' || mode === 'eiken' || mode === 'idiom') && !isPro) {
      router.push('/subscription');
      return;
    }

    setSelectedScanMode(mode as ExtractMode);
    setSelectedEikenLevel(eikenLevel);
    fileInputRef.current?.click();
  };

  const handleImageSelect = async (file: File) => {
    if (!isAuthenticated) {
      showToast({
        message: 'ログインが必要です',
        type: 'error',
        action: {
          label: 'ログイン',
          onClick: () => router.push('/login'),
        },
        duration: 4000,
      });
      return;
    }

    if (!isPro && isAtLimit) {
      setShowWordLimitModal(true);
      return;
    }

    setPendingFile(file);

    // If adding to existing project, skip project name modal
    if (isAddingToExisting && currentProject) {
      sessionStorage.setItem('scanvocab_existing_project_id', currentProject.id);
      sessionStorage.removeItem('scanvocab_project_name');
      processImage(file);
    } else {
      setShowProjectNameModal(true);
    }
  };

  // Common image processing function - Job-based for background processing
  const processImage = async (file: File) => {
    setProcessing(true);
    setProcessingSteps([
      { id: 'upload', label: '画像をアップロード中...', status: 'active' },
      { id: 'analyze', label: '文字を解析中...', status: 'pending' },
      { id: 'generate', label: '問題を作成中...', status: 'pending' },
    ]);

    try {
      // Process image (convert HEIC to JPEG if needed)
      let processedFile: File;
      try {
        processedFile = await processImageFile(file);
      } catch (imageError) {
        console.error('Image processing error:', imageError);
        throw new Error('画像の処理に失敗しました。別の画像をお試しください。');
      }

      // Convert file to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          if (!result || !result.includes(',')) {
            reject(new Error('画像データの読み取りに失敗しました'));
            return;
          }
          resolve(result);
        };
        reader.onerror = () => reject(new Error('ファイルの読み取りに失敗しました'));
        reader.readAsDataURL(processedFile);
      });

      // Get project info from sessionStorage
      const existingProjectId = sessionStorage.getItem('scanvocab_existing_project_id');
      const projectTitle = sessionStorage.getItem('scanvocab_project_name');

      // Create scan job
      const createResponse = await fetch('/api/scan-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: base64,
          scanMode: selectedScanMode,
          eikenLevel: selectedEikenLevel,
          projectId: existingProjectId || undefined,
          projectTitle: projectTitle || undefined,
        }),
      });

      const createResult = await createResponse.json();

      if (!createResponse.ok || !createResult.success) {
        const errorMsg = createResult.details
          ? `${createResult.error}: ${createResult.details}`
          : (createResult.error || 'ジョブの作成に失敗しました');
        throw new Error(errorMsg);
      }

      setProcessingSteps((prev) =>
        prev.map((s) =>
          s.id === 'upload'
            ? { ...s, status: 'complete' }
            : s.id === 'analyze'
            ? { ...s, status: 'active' }
            : s
        )
      );

      // Save job ID and start polling
      const jobId = createResult.jobId;
      setCurrentJobId(jobId);

      // Start polling for job status
      startPolling(jobId);
    } catch (error) {
      console.error('Scan error:', error);

      // Check if this is a network interruption error (PWA went to background)
      const isNetworkError = error instanceof Error && (
        error.message.includes('Load failed') ||
        error.message.includes('Failed to fetch') ||
        error.message.includes('network') ||
        error.message.includes('NetworkError') ||
        error.message.includes('aborted')
      );

      if (isNetworkError) {
        // PWA might have gone to background - check for pending jobs
        console.log('Network error detected, checking for pending jobs...');
        const foundJob = await checkPendingJobs();
        if (foundJob) {
          // Job was found and is being handled - don't show error
          console.log('Found existing job after network interruption');
          return;
        }
      }

      let errorMessage = '予期しないエラー';
      if (error instanceof Error) {
        if (error.message.includes('did not match the expected pattern')) {
          errorMessage = '画像データの処理に問題が発生しました。カメラ設定を「互換性優先」にするか、スクリーンショットをお試しください。';
        } else if (error.message.includes('HEIC') || error.message.includes('HEIF')) {
          errorMessage = error.message;
        } else if (isNetworkError) {
          errorMessage = '通信が中断されました。もう一度お試しください。';
        } else {
          errorMessage = error.message;
        }
      }

      setProcessingSteps((prev) =>
        prev.map((s) =>
          s.status === 'active' || s.status === 'pending'
            ? { ...s, status: 'error', label: errorMessage }
            : s
        )
      );
    }
  };

  const handleProjectNameConfirm = async (projectName: string) => {
    setShowProjectNameModal(false);
    const file = pendingFile;
    setPendingFile(null);

    if (!file) return;

    sessionStorage.setItem('scanvocab_project_name', projectName);
    sessionStorage.removeItem('scanvocab_project_id');
    processImage(file);
  };

  const handleCloseModal = () => {
    setProcessing(false);
    setProcessingSteps([]);
    stopPolling();

    // Cancel pending job if exists
    if (currentJobId) {
      fetch(`/api/scan-jobs/${currentJobId}`, { method: 'DELETE' })
        .catch(err => console.error('Failed to delete job:', err));
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  // Empty state - no projects
  if (projects.length === 0) {
    return (
      <div className="min-h-screen bg-white">
        {/* Hidden file input for empty state */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.heic,.heif"
          capture="environment"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              handleImageSelect(file);
              e.target.value = '';
            }
          }}
          className="hidden"
        />

        <header className="sticky top-0 bg-white/95 backdrop-blur-sm z-40 border-b border-gray-100">
          <div className="max-w-lg mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-blue-600">WordSnap</h1>
                {isPro && (
                  <span className="flex items-center gap-1 text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-md font-medium">
                    <Sparkles className="w-3 h-3" />
                    Pro
                  </span>
                )}
              </div>
              <Link href="/settings" className="p-2 hover:bg-gray-100 rounded-full">
                <Settings className="w-5 h-5 text-gray-500" />
              </Link>
            </div>
          </div>
        </header>

        <main className="flex flex-col items-center justify-center px-4 py-20">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-6">
            <BookOpen className="w-8 h-8 text-gray-400" />
          </div>
          <h2 className="text-lg font-medium text-gray-900 mb-2">単語帳がありません</h2>
          <p className="text-gray-500 text-sm text-center mb-8">
            右下のボタンから<br />ノートやプリントを撮影しましょう
          </p>
          {!isAuthenticated && (
            <p className="text-xs text-gray-400">
              <Link href="/signup" className="text-blue-600 hover:underline">
                アカウント登録
              </Link>
              でクラウド保存
            </p>
          )}
        </main>

        {/* Floating action button */}
        <button
          onClick={() => handleScanButtonClick()}
          disabled={processing || (!isPro && !canScan)}
          className="fixed bottom-6 right-6 w-14 h-14 flex items-center justify-center bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed z-50"
        >
          <Plus className="w-7 h-7" />
        </button>

        {processing && (
          <ProcessingModal
            steps={processingSteps}
            onClose={processingSteps.some((s) => s.status === 'error') ? handleCloseModal : undefined}
          />
        )}

        <ScanModeModal
          isOpen={showScanModeModal}
          onClose={() => setShowScanModeModal(false)}
          onSelectMode={handleScanModeSelect}
          isPro={isPro}
        />
        <ScanLimitModal isOpen={showScanLimitModal} onClose={() => setShowScanLimitModal(false)} todayWordsLearned={0} />
        <WordLimitModal isOpen={showWordLimitModal} onClose={() => setShowWordLimitModal(false)} currentCount={totalWords} />
        <ProjectNameModal
          isOpen={showProjectNameModal}
          onClose={() => { setShowProjectNameModal(false); setPendingFile(null); }}
          onConfirm={handleProjectNameConfirm}
        />
      </div>
    );
  }

  // Main view with project
  return (
    <div className={`min-h-screen bg-white flex flex-col ${!isWordListExpanded ? 'h-screen overflow-hidden' : ''}`}>
      {/* Word limit banner */}
      {!isPro && isAlmostFull && <WordLimitBanner currentCount={totalWords} />}

      {/* Hidden file input for new project */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        capture="environment"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            handleImageSelect(file);
            e.target.value = '';
          }
        }}
        className="hidden"
      />

      {/* Header with project navigation */}
      <header className="sticky top-0 bg-white/95 backdrop-blur-sm z-40 border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Left: Project selector toggle */}
            <div className="flex-1">
              <button
                onClick={() => setIsProjectDropdownOpen(true)}
                className="flex items-center gap-2 px-3 py-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <h1 className="font-semibold text-gray-900 truncate max-w-[140px]">
                  {showWrongAnswers ? '間違え一覧' : showFavoritesOnly ? '苦手な単語' : (currentProject?.title || '単語帳')}
                </h1>
                <ChevronDown className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Center: Add to current project buttons (hidden in wrong answers mode) */}
            {!showWrongAnswers && !showFavoritesOnly && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setShowManualWordModal(true)}
                  disabled={!currentProject}
                  className="w-8 h-8 flex items-center justify-center bg-gray-600 text-white rounded-full text-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="手で入力"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleScanButtonClick(true)}
                  disabled={processing || (!isPro && !canScan)}
                  className="w-8 h-8 flex items-center justify-center bg-blue-600 text-white rounded-full text-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="スキャン追加"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            )}

            {/* Right: Actions */}
            <div className="flex items-center gap-1 flex-1 justify-end">
              {user && (
                <button
                  onClick={handleShare}
                  disabled={sharing}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  {sharing ? (
                    <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                  ) : shareCopied ? (
                    <Check className="w-5 h-5 text-emerald-600" />
                  ) : currentProject?.shareId ? (
                    <LinkIcon className="w-5 h-5 text-blue-600" />
                  ) : (
                    <Share2 className="w-5 h-5 text-gray-400" />
                  )}
                </button>
              )}
              <button
                onClick={handleDeleteProject}
                className="p-2 hover:bg-red-50 rounded-full transition-colors"
              >
                <Trash2 className="w-5 h-5 text-gray-400 hover:text-red-500" />
              </button>
              <Link href="/settings" className="p-2 hover:bg-gray-100 rounded-full">
                <Settings className="w-5 h-5 text-gray-500" />
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="flex-1 max-w-lg mx-auto px-4 py-4 w-full pb-8">
        {/* Inline Flashcard */}
        <div className="mb-6">
          <InlineFlashcard words={filteredWords} />
        </div>

        {/* Study Mode Cards - 2 column grid (hidden in wrong answers mode) */}
        {!showWrongAnswers && (
          <>
            <div className="grid grid-cols-2 gap-3 mb-6">
              <StudyModeCard
                title="クイズ"
                description="4択単語テスト"
                icon={Play}
                href={`/quiz/${currentProject?.id}`}
                variant="red"
                disabled={filteredWords.length === 0}
              />
              <StudyModeCard
                title="カード"
                description="フラッシュカード"
                icon={Layers}
                href={isPro ? `/flashcard/${currentProject?.id}` : '/subscription'}
                variant="blue"
                disabled={filteredWords.length === 0}
                badge={!isPro ? 'Pro' : undefined}
              />
            </div>

            {/* Sentence Quiz Card - Full width (Pro only) */}
            <div className="mb-6">
              <StudyModeCard
                title="例文クイズ"
                description="例文で単語を覚える"
                icon={BookText}
                href={isPro ? `/sentence-quiz/${currentProject?.id}` : '/subscription'}
                variant="purple"
                disabled={filteredWords.length === 0}
                badge={!isPro ? 'Pro' : undefined}
              />
            </div>
          </>
        )}

        {/* Collapsible Word List */}
        {wordsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : (
          <WordList
            words={filteredWords}
            editingWordId={editingWordId}
            onEditStart={(wordId) => setEditingWordId(wordId)}
            onEditCancel={() => setEditingWordId(null)}
            onSave={(wordId, english, japanese) => handleUpdateWord(wordId, english, japanese)}
            onDelete={(wordId) => {
              if (showWrongAnswers) {
                // Remove from wrong answers list
                removeWrongAnswer(wordId);
                setWrongAnswers(getWrongAnswers());
                showToast({ message: '間違え一覧から削除しました', type: 'success' });
              } else {
                handleDeleteWord(wordId);
              }
            }}
            onToggleFavorite={(wordId) => handleToggleFavorite(wordId)}
            onExpandChange={setIsWordListExpanded}
          />
        )}
      </main>

      {/* Modals */}
      {processing && (
        <ProcessingModal
          steps={processingSteps}
          onClose={processingSteps.some((s) => s.status === 'error') ? handleCloseModal : undefined}
        />
      )}

      <ScanModeModal
        isOpen={showScanModeModal}
        onClose={() => setShowScanModeModal(false)}
        onSelectMode={handleScanModeSelect}
        isPro={isPro}
      />
      <ScanLimitModal isOpen={showScanLimitModal} onClose={() => setShowScanLimitModal(false)} todayWordsLearned={0} />
      <WordLimitModal isOpen={showWordLimitModal} onClose={() => setShowWordLimitModal(false)} currentCount={totalWords} />
      <ProjectNameModal
        isOpen={showProjectNameModal}
        onClose={() => { setShowProjectNameModal(false); setPendingFile(null); }}
        onConfirm={handleProjectNameConfirm}
      />

      <EditProjectNameModal
        isOpen={editProjectModalOpen}
        onClose={() => { setEditProjectModalOpen(false); setEditProjectId(null); }}
        onConfirm={handleConfirmEditProjectName}
        currentName={editProjectNewName}
      />

      <ManualWordInputModal
        isOpen={showManualWordModal}
        onClose={() => { setShowManualWordModal(false); setManualWordEnglish(''); setManualWordJapanese(''); }}
        onConfirm={handleSaveManualWord}
        isLoading={manualWordSaving}
        english={manualWordEnglish}
        setEnglish={setManualWordEnglish}
        japanese={manualWordJapanese}
        setJapanese={setManualWordJapanese}
      />

      <DeleteConfirmModal
        isOpen={deleteWordModalOpen}
        onClose={() => { setDeleteWordModalOpen(false); setDeleteWordTargetId(null); }}
        onConfirm={handleConfirmDeleteWord}
        title="単語を削除"
        message="この単語を削除します。この操作は取り消せません。"
        isLoading={deleteWordLoading}
      />

      <DeleteConfirmModal
        isOpen={deleteProjectModalOpen}
        onClose={() => setDeleteProjectModalOpen(false)}
        onConfirm={handleConfirmDeleteProject}
        title="単語帳を削除"
        message="この単語帳とすべての単語が削除されます。この操作は取り消せません。"
        isLoading={deleteProjectLoading}
      />

      {/* Project selection bottom sheet */}
      <ProjectSelectionSheet
        isOpen={isProjectDropdownOpen}
        onClose={() => setIsProjectDropdownOpen(false)}
        projects={projects}
        currentProjectIndex={currentProjectIndex}
        onSelectProject={selectProject}
        onSelectFavorites={() => {
          setShowFavoritesOnly(true);
          setShowWrongAnswers(false);
        }}
        onSelectWrongAnswers={() => {
          setShowWrongAnswers(true);
          setShowFavoritesOnly(false);
        }}
        onCreateNewProject={() => handleScanButtonClick(false)}
        onToggleProjectFavorite={handleToggleProjectFavorite}
        onEditProject={handleEditProjectName}
        showFavoritesOnly={showFavoritesOnly}
        showWrongAnswers={showWrongAnswers}
        favoriteWords={allFavoriteWords}
        wrongAnswers={wrongAnswers}
        projectFavoriteCounts={projectFavoriteCounts}
      />
    </div>
  );
}
