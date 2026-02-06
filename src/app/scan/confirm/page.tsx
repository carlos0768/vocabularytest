'use client';

import { useState, useEffect, useLayoutEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useWordCount } from '@/hooks/use-word-count';
import { useAuth } from '@/hooks/use-auth';
import { getRepository } from '@/lib/db';
import { FREE_WORD_LIMIT, getGuestUserId } from '@/lib/utils';
import { invalidateHomeCache } from '@/lib/home-cache';
import type { AIWordExtraction } from '@/types';

interface EditableWord extends AIWordExtraction {
  tempId: string;
  isEditing: boolean;
  isSelected: boolean;
}

// Check sessionStorage synchronously before any React rendering
// This prevents any flash by determining data availability immediately
function getInitialData(): { words: AIWordExtraction[] | null; projectName: string | null; existingProjectId: string | null } {
  if (typeof window === 'undefined') {
    return { words: null, projectName: null, existingProjectId: null };
  }
  try {
    const stored = sessionStorage.getItem('scanvocab_extracted_words');
    const projectName = sessionStorage.getItem('scanvocab_project_name');
    const existingProjectId = sessionStorage.getItem('scanvocab_existing_project_id');

    if (stored) {
      const words = JSON.parse(stored) as AIWordExtraction[];
      return { words, projectName, existingProjectId };
    }
  } catch {
    // Parse error - will redirect
  }
  return { words: null, projectName: null, existingProjectId: null };
}

export default function ConfirmPage() {
  const router = useRouter();
  const { count: currentWordCount, canAddWords, refresh: refreshWordCount } = useWordCount();
  const { isPro, subscription, user } = useAuth();
  const { showToast } = useToast();

  // Initialize state synchronously with sessionStorage data
  const [initialData] = useState(getInitialData);
  const [dataReady, setDataReady] = useState(false);
  const [shouldRedirect, setShouldRedirect] = useState(false);

  const [words, setWords] = useState<EditableWord[]>(() => {
    if (initialData.words) {
      return initialData.words.map((w, i) => ({
        ...w,
        tempId: `word-${i}`,
        isEditing: false,
        isSelected: true,
      }));
    }
    return [];
  });

  const [projectTitle, setProjectTitle] = useState(() => {
    if (initialData.existingProjectId) return '';
    if (initialData.projectName) return initialData.projectName;
    const now = new Date();
    return `スキャン ${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
  });

  const [existingProjectId, setExistingProjectId] = useState<string | null>(initialData.existingProjectId);
  const [saving, setSaving] = useState(false);

  // Check if adding these words would exceed limit
  const { wouldExceed, excessCount, availableSlots } = canAddWords(words.filter(w => w.isSelected).length);
  const selectedCount = words.filter(w => w.isSelected).length;
  const showLimitWarning = !isPro && wouldExceed;

  // Check if adding to existing project
  const isAddingToExisting = !!existingProjectId;

  // Use useLayoutEffect to check data before paint
  useLayoutEffect(() => {
    if (initialData.words && initialData.words.length > 0) {
      setDataReady(true);
    } else {
      // No data - need to redirect
      setShouldRedirect(true);
    }
  }, [initialData.words]);

  // Handle redirect in a separate effect to show toast
  useEffect(() => {
    if (shouldRedirect) {
      showToast({
        message: 'スキャンデータが見つかりません。もう一度スキャンしてください。',
        type: 'error',
      });
      router.replace('/');
    }
  }, [shouldRedirect, showToast, router]);

  const handleToggleWord = (tempId: string) => {
    setWords((prev) =>
      prev.map((w) =>
        w.tempId === tempId ? { ...w, isSelected: !w.isSelected } : w
      )
    );
  };

  const handleDeleteWord = (tempId: string) => {
    setWords((prev) => prev.filter((w) => w.tempId !== tempId));
  };

  const handleEditWord = (tempId: string) => {
    setWords((prev) =>
      prev.map((w) =>
        w.tempId === tempId ? { ...w, isEditing: true } : w
      )
    );
  };

  const handleSaveWord = (tempId: string, english: string, japanese: string) => {
    setWords((prev) =>
      prev.map((w) =>
        w.tempId === tempId
          ? { ...w, english, japanese, isEditing: false }
          : w
      )
    );
  };

  const handleCancelEdit = (tempId: string) => {
    setWords((prev) =>
      prev.map((w) =>
        w.tempId === tempId ? { ...w, isEditing: false } : w
      )
    );
  };

  const handleAddManualWord = () => {
    const newWord: EditableWord = {
      english: '',
      japanese: '',
      distractors: [],
      exampleSentence: '',
      exampleSentenceJa: '',
      tempId: `word-manual-${Date.now()}`,
      isEditing: true,
      isSelected: true,
    };
    setWords((prev) => [...prev, newWord]);
  };

  const handleSaveProject = async () => {
    const selectedWords = words.filter(w => w.isSelected);

    if (selectedWords.length === 0) {
      alert('保存する単語を選択してください');
      return;
    }

    // Only require project title for new projects
    if (!isAddingToExisting && !projectTitle.trim()) {
      alert('プロジェクト名を入力してください');
      return;
    }

    // Check limit again before saving
    if (!isPro && wouldExceed) {
      alert(`保存できる単語は${availableSlots}語までです。単語を減らしてください。`);
      return;
    }

    setSaving(true);
    try {
      // Get repository and userId
      const subscriptionStatus = subscription?.status || 'free';
      const repository = getRepository(subscriptionStatus);
      const userId = isPro && user ? user.id : getGuestUserId();

      let targetProjectId: string;

      if (isAddingToExisting && existingProjectId) {
        // Add to existing project
        targetProjectId = existingProjectId;
      } else {
        // Create new project
        const project = await repository.createProject({
          userId,
          title: projectTitle.trim(),
        });
        targetProjectId = project.id;
      }

      // Add words to project
      await repository.createWords(
        selectedWords.map((w) => ({
          projectId: targetProjectId,
          english: w.english,
          japanese: w.japanese,
          distractors: w.distractors,
          exampleSentence: w.exampleSentence,
          exampleSentenceJa: w.exampleSentenceJa,
        }))
      );

      // Clear session storage
      sessionStorage.removeItem('scanvocab_extracted_words');
      sessionStorage.removeItem('scanvocab_project_name');
      sessionStorage.removeItem('scanvocab_existing_project_id');

      // Refresh word count
      refreshWordCount();

      // Check if user just crossed 80 words (nudge)
      const newTotal = currentWordCount + selectedWords.length;
      if (!isPro && currentWordCount < 80 && newTotal >= 80) {
        showToast({
          message: `80語達成! あと${FREE_WORD_LIMIT - newTotal}語で上限です`,
          type: 'success',
          action: {
            label: 'Pro詳細',
            onClick: () => router.push('/subscription'),
          },
          duration: 4000,
        });
      }

      // Show success message for adding words
      if (isAddingToExisting) {
        showToast({
          message: `${selectedWords.length}語を追加しました`,
          type: 'success',
        });
      }

      // Invalidate home page cache so it fetches fresh data
      invalidateHomeCache();

      // Navigate directly to home (project detail is integrated into home page)
      router.push('/');
    } catch (error) {
      console.error('Save error:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      alert(`保存に失敗しました: ${errorMessage}`);
    } finally {
      setSaving(false);
    }
  };

  // Show loading state until data is ready
  // This creates a seamless transition from the scan page's processing modal
  if (!dataReady) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center">
        <div className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] p-6 w-full max-w-sm shadow-card">
          <h2 className="text-base font-medium mb-4 text-center text-[var(--color-foreground)]">
            読み込み中
          </h2>
          <div className="flex justify-center">
            <div className="w-8 h-8 border-2 border-[var(--color-border)] border-t-[var(--color-primary)] rounded-full animate-spin" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)] pb-32">
      {/* Header */}
      <header className="sticky top-0 bg-[var(--color-background)]/95 z-40">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-1.5 -ml-1.5 hover:bg-[var(--color-primary-light)] rounded-md transition-colors"
            >
              <Icon name="arrow_back" size={20} className="text-[var(--color-muted)]" />
            </button>
            <h1 className="text-lg font-semibold text-[var(--color-foreground)]">
              {isAddingToExisting ? '追加する単語を確認' : '確認・編集'}
            </h1>
          </div>
        </div>
      </header>

      {/* Limit warning banner */}
      {showLimitWarning && (
        <div className="bg-[var(--color-warning-light)] border-b border-[var(--color-border)]">
          <div className="max-w-lg mx-auto px-4 py-3">
            <div className="flex items-start gap-3">
              <Icon name="warning" size={20} className="text-[var(--color-warning)] shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-[var(--color-foreground)]">
                  単語数が上限に近づいています
                </p>
                <p className="text-xs text-[var(--color-muted)] mt-1">
                  現在: {currentWordCount}語 / 上限: {FREE_WORD_LIMIT}語
                  <br />
                  今回: +{selectedCount}語 → 合計{currentWordCount + selectedCount}語
                  {excessCount > 0 && (
                    <span className="text-[var(--color-error)] font-medium">
                      （{excessCount}語超過）
                    </span>
                  )}
                </p>
                <p className="text-xs text-[var(--color-muted)] mt-2">
                  保存できる単語を<span className="font-medium">{availableSlots}語</span>まで選んでください。
                </p>
              </div>
            </div>

            {/* Pro upgrade mini card */}
            <div className="mt-3 bg-[var(--color-surface)] rounded-[var(--radius-md)] p-3 flex items-center justify-between border border-[var(--color-border)]">
              <div className="flex items-center gap-2">
                <Icon name="auto_awesome" size={16} className="text-[var(--color-primary)]" />
                <span className="text-sm text-[var(--color-foreground)]">Proなら単語数無制限</span>
              </div>
              <Link href="/subscription">
                <Button size="sm" variant="secondary">
                  詳しく見る
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="max-w-lg mx-auto px-4 py-6">
        {/* Project title input - only for new projects */}
        {!isAddingToExisting && (
          <div className="mb-6">
            <label className="block text-sm font-medium text-[var(--color-foreground)] mb-1.5">
              プロジェクト名
            </label>
            <input
              type="text"
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-[var(--color-border)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-light)] outline-none transition-all bg-[var(--color-background)] focus:bg-[var(--color-surface)]"
              placeholder="例: ノート P21-23"
            />
          </div>
        )}

        {/* Word count and add button */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-[var(--color-muted)]">
            抽出された単語
          </h2>
          <div className="flex items-center gap-3">
            <span className={`text-sm font-medium ${showLimitWarning && excessCount > 0 ? 'text-[var(--color-error)]' : 'text-[var(--color-primary)]'}`}>
              {selectedCount}語選択中
              {!isPro && ` / 残り${availableSlots}語`}
            </span>
            <button
              onClick={handleAddManualWord}
              className="p-1.5 hover:bg-[var(--color-primary-light)] rounded-full transition-colors text-[var(--color-primary)]"
              title="手で入力"
            >
              <Icon name="add" size={20} />
            </button>
          </div>
        </div>

        {/* Word list */}
        <div className="space-y-3">
          {words.map((word) => (
            <WordCard
              key={`${word.tempId}:${word.english}:${word.japanese}`}
              word={word}
              showCheckbox={!isPro && showLimitWarning}
              onToggle={() => handleToggleWord(word.tempId)}
              onDelete={() => handleDeleteWord(word.tempId)}
              onEdit={() => handleEditWord(word.tempId)}
              onSave={(english, japanese) =>
                handleSaveWord(word.tempId, english, japanese)
              }
              onCancel={() => handleCancelEdit(word.tempId)}
            />
          ))}
        </div>

        {words.length === 0 && (
          <div className="text-center py-8 text-[var(--color-muted)] text-sm">
            単語がありません。戻って再度スキャンしてください。
          </div>
        )}
      </main>

      {/* Bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-[var(--color-background)]/95 p-4 safe-area-bottom border-t border-[var(--color-border-light)]">
        <div className="max-w-lg mx-auto">
          <Button
            onClick={handleSaveProject}
            disabled={saving || selectedCount === 0 || (!isPro && excessCount > 0)}
            className="w-full"
            size="lg"
          >
            {saving ? (
              '保存中...'
            ) : isAddingToExisting ? (
              <>
                <Icon name="add" size={20} className="mr-2" />
                {selectedCount}語を追加
              </>
            ) : (
              <>
                <Icon name="check" size={20} className="mr-2" />
                {selectedCount}語を保存して学習を始める
              </>
            )}
          </Button>
          {!isPro && excessCount > 0 && (
            <p className="text-xs text-[var(--color-error)] text-center mt-2">
              {excessCount}語減らしてください
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// Word card component with edit and checkbox functionality
function WordCard({
  word,
  showCheckbox,
  onToggle,
  onDelete,
  onEdit,
  onSave,
  onCancel,
}: {
  word: EditableWord;
  showCheckbox: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: () => void;
  onSave: (english: string, japanese: string) => void;
  onCancel: () => void;
}) {
  const [english, setEnglish] = useState(word.english);
  const [japanese, setJapanese] = useState(word.japanese);

  if (word.isEditing) {
    return (
      <div className="bg-[var(--color-primary-light)] rounded-[var(--radius-lg)] p-4">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted)] mb-1">
              英単語
            </label>
            <input
              type="text"
              value={english}
              onChange={(e) => setEnglish(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-light)] outline-none text-base bg-[var(--color-surface)]"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--color-muted)] mb-1">
              日本語訳
            </label>
            <input
              type="text"
              value={japanese}
              onChange={(e) => setJapanese(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-light)] outline-none text-sm bg-[var(--color-surface)]"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={onCancel}
              className="flex-1"
            >
              <Icon name="close" size={16} className="mr-1" />
              キャンセル
            </Button>
            <Button
              size="sm"
              onClick={() => onSave(english, japanese)}
              className="flex-1"
            >
              <Icon name="save" size={16} className="mr-1" />
              保存
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-[var(--radius-lg)] p-4 group transition-colors ${
        word.isSelected
          ? 'bg-[var(--color-surface)] hover:bg-[var(--color-primary-light)]'
          : 'bg-[var(--color-border-light)] opacity-50'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        {showCheckbox && (
          <button
            onClick={onToggle}
            className={`mt-1 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
              word.isSelected
                ? 'bg-[var(--color-primary)] border-[var(--color-primary)]'
                : 'border-[var(--color-border)] hover:border-[var(--color-border)]'
            }`}
          >
            {word.isSelected && <Icon name="check" size={12} className="text-white" />}
          </button>
        )}

        <div className="flex-1 min-w-0">
          <p className="font-medium text-[var(--color-foreground)]">
            {word.english}
          </p>
          <p className="text-sm text-[var(--color-muted)] mt-0.5">{word.japanese}</p>
        </div>

        <div className="flex gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            className="p-1.5 hover:bg-[var(--color-primary-light)] rounded-md transition-colors"
            title="編集"
          >
            <Icon name="edit" size={16} className="text-[var(--color-muted)]" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 hover:bg-[var(--color-error-light)] rounded-md transition-colors"
            title="削除"
          >
            <Icon name="delete" size={16} className="text-[var(--color-error)]" />
          </button>
        </div>
      </div>
    </div>
  );
}
