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
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useWordCount } from '@/hooks/use-word-count';
import { ProgressSteps, type ProgressStep, useToast, DeleteConfirmModal, Button } from '@/components/ui';
import { ScanLimitModal, WordLimitModal, WordLimitBanner } from '@/components/limits';
import { InlineFlashcard, StudyModeCard, WordList } from '@/components/home';
import { getRepository } from '@/lib/db';
import { remoteRepository } from '@/lib/db/remote-repository';
import { getGuestUserId, FREE_WORD_LIMIT } from '@/lib/utils';
import { processImageFile } from '@/lib/image-utils';
import type { AIWordExtraction, AIGrammarExtraction, Project, Word } from '@/types';
import type { ExtractMode, EikenLevel } from '@/app/api/extract/route';
import type { EikenGrammarLevel } from '@/types';

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

// Scan mode types
type ScanMode = ExtractMode | 'grammar';

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

          {/* Grammar mode (Pro) */}
          <button
            onClick={() => onSelectMode('grammar', null)}
            className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-xl hover:border-emerald-300 hover:bg-emerald-50/50 transition-colors text-left"
          >
            <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
              <BookText className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="font-medium text-gray-900">文法をスキャン</p>
                {!isPro && (
                  <span className="flex items-center gap-1 text-xs bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded font-medium">
                    <Sparkles className="w-3 h-3" />
                    Pro
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500">文法問題を抽出して学習します</p>
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
  showFavoritesOnly,
  favoriteWords,
  projectFavoriteCounts,
}: {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  currentProjectIndex: number;
  onSelectProject: (index: number) => void;
  onSelectFavorites: () => void;
  showFavoritesOnly: boolean;
  favoriteWords: Word[];
  projectFavoriteCounts: Record<string, number>;
}) {
  if (!isOpen) return null;

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
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="w-5 h-5 text-blue-500" />
              <h3 className="font-medium text-gray-700">単語帳一覧</h3>
            </div>
            <div className="space-y-2">
              {projects.map((project, index) => {
                const isSelected = index === currentProjectIndex && !showFavoritesOnly;
                const favoriteCount = projectFavoriteCounts[project.id] || 0;
                return (
                  <button
                    key={project.id}
                    onClick={() => {
                      onSelectProject(index);
                      onClose();
                    }}
                    className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                      isSelected
                        ? 'border-emerald-500 bg-white'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-gray-900">{project.title}</p>
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
                      </div>
                      {isSelected && (
                        <div className="w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center">
                          <Check className="w-4 h-4 text-white" />
                        </div>
                      )}
                    </div>
                  </button>
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
  const [isGrammarMode, setIsGrammarMode] = useState(false);

  // Delete modals
  const [deleteWordModalOpen, setDeleteWordModalOpen] = useState(false);
  const [deleteWordTargetId, setDeleteWordTargetId] = useState<string | null>(null);
  const [deleteWordLoading, setDeleteWordLoading] = useState(false);
  const [deleteProjectModalOpen, setDeleteProjectModalOpen] = useState(false);
  const [deleteProjectLoading, setDeleteProjectLoading] = useState(false);

  // Get repository
  const subscriptionStatus = subscription?.status || 'free';
  const repository = useMemo(() => getRepository(subscriptionStatus), [subscriptionStatus]);

  // Current project
  const currentProject = projects[currentProjectIndex] || null;

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

  const filteredWords = showFavoritesOnly
    ? allFavoriteWords
    : words;

  // Navigation
  const selectProject = (index: number) => {
    setCurrentProjectIndex(index);
    setShowFavoritesOnly(false);
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
    await repository.updateWord(wordId, { english, japanese });
    setWords((prev) =>
      prev.map((w) => (w.id === wordId ? { ...w, english, japanese } : w))
    );
    setEditingWordId(null);
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

    // Pro-only features: circled, eiken filter, and grammar modes
    if ((mode === 'circled' || mode === 'eiken' || mode === 'grammar') && !isPro) {
      router.push('/subscription');
      return;
    }

    // Handle grammar mode - requires existing project
    if (mode === 'grammar') {
      if (!currentProject) {
        showToast({ message: 'まず単語帳を作成してください', type: 'error' });
        return;
      }
      setIsGrammarMode(true);
      setSelectedEikenLevel(eikenLevel);
      fileInputRef.current?.click();
      return;
    }

    setIsGrammarMode(false);
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

    // Grammar mode - process directly without project name modal
    if (isGrammarMode) {
      if (!currentProject) {
        showToast({ message: 'まず単語帳を作成してください', type: 'error' });
        return;
      }
      processGrammarImage(file);
      return;
    }

    if (!isPro && isAtLimit) {
      setShowWordLimitModal(true);
      return;
    }

    setPendingFile(file);

    // If adding to existing project, skip project name modal
    if (isAddingToExisting && currentProject) {
      sessionStorage.setItem('scanvocab_project_id', currentProject.id);
      sessionStorage.removeItem('scanvocab_project_name');
      processImage(file);
    } else {
      setShowProjectNameModal(true);
    }
  };

  // Common image processing function
  const processImage = async (file: File) => {
    setProcessing(true);
    setProcessingSteps([
      { id: 'upload', label: '画像をアップロード中...', status: 'active' },
      { id: 'analyze', label: '文字を解析中...', status: 'pending' },
      { id: 'generate', label: '問題を作成中...', status: 'pending' },
    ]);

    try {
      let processedFile: File;
      try {
        processedFile = await processImageFile(file);
      } catch (imageError) {
        console.error('Image processing error:', imageError);
        throw new Error('画像の処理に失敗しました。別の画像をお試しください。');
      }

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

      setProcessingSteps((prev) =>
        prev.map((s) =>
          s.id === 'upload' ? { ...s, status: 'complete' } :
          s.id === 'analyze' ? { ...s, status: 'active' } : s
        )
      );

      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, mode: selectedScanMode, eikenLevel: selectedEikenLevel }),
      });

      const result = await response.json();

      if (response.status === 401) {
        setProcessing(false);
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

      if (response.status === 403) {
        setProcessing(false);
        showToast({
          message: 'この機能はProプラン限定です',
          type: 'error',
          action: {
            label: 'プランを見る',
            onClick: () => router.push('/subscription'),
          },
          duration: 4000,
        });
        return;
      }

      if (response.status === 403) {
        setProcessing(false);
        showToast({
          message: 'この機能はProプラン限定です',
          type: 'error',
          action: {
            label: 'プランを見る',
            onClick: () => router.push('/subscription'),
          },
          duration: 4000,
        });
        return;
      }

      if (response.status === 429 || result.limitReached) {
        setProcessing(false);
        if (result.scanInfo) {
          setScanInfo(result.scanInfo);
        }
        setShowScanLimitModal(true);
        return;
      }

      if (!result.success) throw new Error(result.error);

      setProcessingSteps((prev) =>
        prev.map((s) =>
          s.id === 'analyze' ? { ...s, status: 'complete' } :
          s.id === 'generate' ? { ...s, status: 'active' } : s
        )
      );

      await new Promise((r) => setTimeout(r, 500));

      setProcessingSteps((prev) =>
        prev.map((s) => (s.id === 'generate' ? { ...s, status: 'complete' } : s))
      );

      if (result.scanInfo) {
        setScanInfo(result.scanInfo);

        if (!result.scanInfo.isPro && result.scanInfo.limit &&
          result.scanInfo.limit - result.scanInfo.currentCount === 1) {
          showToast({
            message: '今日のスキャン残り1回。Proなら無制限',
            type: 'warning',
            action: {
              label: '詳しく',
              onClick: () => router.push('/subscription'),
            },
            duration: 4000,
          });
        }
      }

      const extractedWords: AIWordExtraction[] = result.words;
      sessionStorage.setItem('scanvocab_extracted_words', JSON.stringify(extractedWords));
      router.push('/scan/confirm');
    } catch (error) {
      console.error('Scan error:', error);
      // Log full error details for debugging
      if (error instanceof Error) {
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
      }

      let errorMessage = '予期しないエラー';
      if (error instanceof Error) {
        // Make common errors more user-friendly
        if (error.message.includes('did not match the expected pattern')) {
          errorMessage = '画像の読み込みに失敗しました。別の画像をお試しください。';
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

  // Grammar image processing function
  const processGrammarImage = async (file: File) => {
    if (!currentProject) return;

    setProcessing(true);
    setProcessingSteps([
      { id: 'upload', label: '画像をアップロード中...', status: 'active' },
      { id: 'ocr', label: 'テキストを抽出中...', status: 'pending' },
      { id: 'analyze', label: '文法を解析中...', status: 'pending' },
    ]);

    try {
      let processedFile: File;
      try {
        processedFile = await processImageFile(file);
      } catch (imageError) {
        console.error('Image processing error:', imageError);
        throw new Error('画像の処理に失敗しました。別の画像をお試しください。');
      }

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

      setProcessingSteps((prev) =>
        prev.map((s) =>
          s.id === 'upload' ? { ...s, status: 'complete' } :
          s.id === 'ocr' ? { ...s, status: 'active' } : s
        )
      );

      // Call grammar API
      const eikenLevel: EikenGrammarLevel = selectedEikenLevel as EikenGrammarLevel;
      const response = await fetch('/api/grammar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, eikenLevel }),
      });

      setProcessingSteps((prev) =>
        prev.map((s) =>
          s.id === 'ocr' ? { ...s, status: 'complete' } :
          s.id === 'analyze' ? { ...s, status: 'active' } : s
        )
      );

      const result = await response.json();

      if (response.status === 401) {
        setProcessing(false);
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

      if (response.status === 429 || result.limitReached) {
        setProcessing(false);
        if (result.scanInfo) {
          setScanInfo(result.scanInfo);
        }
        setShowScanLimitModal(true);
        return;
      }

      if (!result.success) {
        throw new Error(result.error || '文法解析に失敗しました');
      }

      await new Promise((r) => setTimeout(r, 500));

      setProcessingSteps((prev) =>
        prev.map((s) => (s.id === 'analyze' ? { ...s, status: 'complete' } : s))
      );

      if (result.scanInfo) {
        setScanInfo(result.scanInfo);
      }

      // Store patterns and project ID in sessionStorage, then navigate to confirm page
      const patterns: AIGrammarExtraction[] = result.patterns;
      sessionStorage.setItem('scanvocab_grammar_patterns', JSON.stringify(patterns));
      sessionStorage.setItem('scanvocab_project_id', currentProject.id);

      setProcessing(false);
      setIsGrammarMode(false);
      router.push('/grammar/confirm');
    } catch (error) {
      console.error('Grammar scan error:', error);

      let errorMessage = '予期しないエラー';
      if (error instanceof Error) {
        errorMessage = error.message;
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
                  {currentProject?.title || '単語帳'}
                </h1>
                <ChevronDown className="w-4 h-4 text-gray-500" />
              </button>
            </div>

            {/* Center: New project button */}
            <button
              onClick={() => handleScanButtonClick()}
              disabled={processing || (!isPro && !canScan)}
              className="w-8 h-8 flex items-center justify-center bg-blue-600 text-white rounded-full text-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-5 h-5" />
            </button>

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
          <InlineFlashcard words={showFavoritesOnly ? allFavoriteWords : words} />
        </div>

        {/* Study Mode Cards - 2 column grid */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <StudyModeCard
            title="クイズ"
            description="4択単語テスト"
            icon={Play}
            href={`/quiz/${currentProject?.id}`}
            variant="red"
            disabled={words.length === 0}
          />
          <StudyModeCard
            title="カード"
            description="フラッシュカード"
            icon={Layers}
            href={isPro ? `/flashcard/${currentProject?.id}` : '/subscription'}
            variant="blue"
            disabled={words.length === 0}
            badge={!isPro ? 'Pro' : undefined}
          />
        </div>

        {/* Grammar Mode Card - Full width (Pro only) */}
        <div className="mb-6">
          <StudyModeCard
            title="文法問題"
            description="文法をスキャンして学習"
            icon={BookText}
            href={isPro ? `/grammar/${currentProject?.id}` : '/subscription'}
            variant="green"
            badge={!isPro ? 'Pro' : undefined}
          />
        </div>

        {/* Collapsible Word List */}
        {wordsLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        ) : (
          <WordList
            words={showFavoritesOnly ? allFavoriteWords : words}
            editingWordId={editingWordId}
            onEditStart={(wordId) => setEditingWordId(wordId)}
            onEditCancel={() => setEditingWordId(null)}
            onSave={(wordId, english, japanese) => handleUpdateWord(wordId, english, japanese)}
            onDelete={(wordId) => handleDeleteWord(wordId)}
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
        onSelectFavorites={() => setShowFavoritesOnly(true)}
        showFavoritesOnly={showFavoritesOnly}
        favoriteWords={allFavoriteWords}
        projectFavoriteCounts={projectFavoriteCounts}
      />
    </div>
  );
}
