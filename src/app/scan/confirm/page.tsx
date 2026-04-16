'use client';

import { useState, useEffect, useLayoutEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useWordCount } from '@/hooks/use-word-count';
import { useAuth } from '@/hooks/use-auth';
import { useUserPreferences } from '@/hooks/use-user-preferences';
import { getRepository } from '@/lib/db';
import { getDb } from '@/lib/db/dexie';
import { FREE_WORD_LIMIT, getGuestUserId } from '@/lib/utils';
import { invalidateHomeCache } from '@/lib/home-cache';
import { createBrowserClient } from '@/lib/supabase';
import type { AIWordExtraction, LexiconEntry, Word } from '@/types';
import { ensureSourceLabels, mergeSourceLabels } from '../../../../shared/source-labels';

interface EditableWord extends AIWordExtraction {
  tempId: string;
  isEditing: boolean;
  isSelected: boolean;
}

const QUIZ_PREFILL_BATCH_SIZE = 30;
const QUIZ_PREFILL_MAX_ATTEMPTS = 3;

function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasValidDistractors(value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  if (value.length < 3) return false;
  if (value.length === 3 && value[0] === '選択肢1') return false;
  return value.every((item) => typeof item === 'string' && item.trim().length > 0);
}

function hasExampleSentence(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasPartOfSpeechTags(value: unknown): boolean {
  return Array.isArray(value) && value.some((item) => typeof item === 'string' && item.trim().length > 0);
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const supabase = createBrowserClient();
  const { data: { session } } = await supabase.auth.getSession();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  return headers;
}

// Check sessionStorage synchronously before any React rendering
// This prevents any flash by determining data availability immediately
function getInitialData(): {
  words: AIWordExtraction[] | null;
  sourceLabels: string[];
  lexiconEntries: LexiconEntry[];
  projectName: string | null;
  projectIcon: string | null;
  existingProjectId: string | null;
  scanAiEnabled: boolean | null;
} {
  if (typeof window === 'undefined') {
    return {
      words: null,
      sourceLabels: [],
      lexiconEntries: [],
      projectName: null,
      projectIcon: null,
      existingProjectId: null,
      scanAiEnabled: null,
    };
  }
  try {
    const stored = sessionStorage.getItem('scanvocab_extracted_words');
    const sourceLabelsStored = sessionStorage.getItem('scanvocab_source_labels');
    const lexiconEntriesStored = sessionStorage.getItem('scanvocab_lexicon_entries');
    const projectName = sessionStorage.getItem('scanvocab_project_name');
    const projectIcon = sessionStorage.getItem('scanvocab_project_icon');
    const existingProjectId = sessionStorage.getItem('scanvocab_existing_project_id');
    const aiEnabledRaw = sessionStorage.getItem('scanvocab_ai_enabled');
    const scanAiEnabled =
      aiEnabledRaw === '1' ? true : aiEnabledRaw === '0' ? false : null;
    const sourceLabels = sourceLabelsStored
      ? ensureSourceLabels(JSON.parse(sourceLabelsStored) as unknown[])
      : [];
    const lexiconEntries = lexiconEntriesStored
      ? (JSON.parse(lexiconEntriesStored) as LexiconEntry[])
      : [];

    if (stored) {
      const words = JSON.parse(stored) as AIWordExtraction[];
      return { words, sourceLabels, lexiconEntries, projectName, projectIcon, existingProjectId, scanAiEnabled };
    }
  } catch {
    // Parse error - will redirect
  }
  return {
    words: null,
    sourceLabels: [],
    lexiconEntries: [],
    projectName: null,
    projectIcon: null,
    existingProjectId: null,
    scanAiEnabled: null,
  };
}

export default function ConfirmPage() {
  const router = useRouter();
  const { count: currentWordCount, canAddWords, refresh: refreshWordCount } = useWordCount();
  const { isPro, subscription, user } = useAuth();
  const { aiEnabled: accountAiEnabled } = useUserPreferences();
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
  const aiEnabledForGeneration = (initialData.scanAiEnabled ?? accountAiEnabled) !== false;

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
          ? { ...w, english, japanese, japaneseSource: undefined, isEditing: false }
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
      partOfSpeechTags: [],
      exampleSentence: '',
      exampleSentenceJa: '',
      tempId: `word-manual-${Date.now()}`,
      isEditing: true,
      isSelected: true,
    };
    setWords((prev) => [...prev, newWord]);
  };

  const persistLexiconEntries = async (entries: LexiconEntry[]) => {
    if (entries.length === 0) return;
    try {
      await getDb().lexiconEntries.bulkPut(entries);
    } catch (error) {
      console.error('Failed to cache lexicon entries locally:', error);
    }
  };

  const prefillQuizData = async (
    createdWords: Word[],
    updateWord: (id: string, updates: Partial<Word>) => Promise<void>
  ): Promise<Word[]> => {
    if (createdWords.length === 0) return createdWords;
    const headers = await getAuthHeaders();

    const seedWords = createdWords
      .filter((word) =>
        word.english.trim().length > 0 &&
        word.japanese.trim().length > 0 &&
        (
          !hasValidDistractors(word.distractors) ||
          !hasExampleSentence(word.exampleSentence) ||
          !hasPartOfSpeechTags(word.partOfSpeechTags)
        )
      )
      .map((word) => ({
        id: word.id,
        english: word.english,
        japanese: word.japanese,
      }));

    if (seedWords.length === 0) return createdWords;

    const resultMap = new Map<string, {
      distractors: string[];
      partOfSpeechTags: string[];
      exampleSentence: string;
      exampleSentenceJa: string;
    }>();

    const batches = chunkArray(seedWords, QUIZ_PREFILL_BATCH_SIZE);

    for (const batch of batches) {
      let pending = batch;

      for (let attempt = 1; attempt <= QUIZ_PREFILL_MAX_ATTEMPTS && pending.length > 0; attempt += 1) {
        try {
          const response = await fetch('/api/generate-quiz-distractors', {
            method: 'POST',
            headers,
            body: JSON.stringify({ words: pending }),
          });

          if (!response.ok) {
            throw new Error(`prefill request failed: ${response.status}`);
          }

          const data = await response.json();
          if (!data.success || !Array.isArray(data.results)) {
            throw new Error('prefill response format is invalid');
          }

          const succeeded = new Set<string>();
          for (const result of data.results) {
            if (!result?.wordId || !Array.isArray(result.distractors)) continue;
            succeeded.add(result.wordId);
            resultMap.set(result.wordId, {
              distractors: result.distractors,
              partOfSpeechTags: Array.isArray(result.partOfSpeechTags) ? result.partOfSpeechTags : [],
              exampleSentence: result.exampleSentence || '',
              exampleSentenceJa: result.exampleSentenceJa || '',
            });
          }

          pending = pending.filter((word) => !succeeded.has(word.id));
          if (pending.length > 0 && attempt < QUIZ_PREFILL_MAX_ATTEMPTS) {
            await sleep(250 * attempt);
          }
        } catch (error) {
          if (attempt >= QUIZ_PREFILL_MAX_ATTEMPTS) {
            console.error('Quiz prefill failed after max attempts:', {
              failedWordIds: pending.map((word) => word.id),
              error,
            });
            break;
          }
          await sleep(250 * attempt);
        }
      }
    }

    const updates: Array<Promise<void>> = [];
    for (const word of createdWords) {
      const generated = resultMap.get(word.id);
      if (!generated) continue;

      const patch: Partial<Word> = {
        distractors: generated.distractors,
        partOfSpeechTags: generated.partOfSpeechTags,
      };

      if (generated.exampleSentence.trim().length > 0) {
        patch.exampleSentence = generated.exampleSentence;
        patch.exampleSentenceJa = generated.exampleSentenceJa;
      }

      updates.push(updateWord(word.id, patch));
    }

    await Promise.all(updates);

    return createdWords.map((word) => {
      const generated = resultMap.get(word.id);
      if (!generated) return word;
      return {
        ...word,
        distractors: generated.distractors,
        partOfSpeechTags: generated.partOfSpeechTags,
        ...(generated.exampleSentence.trim().length > 0
          ? {
              exampleSentence: generated.exampleSentence,
              exampleSentenceJa: generated.exampleSentenceJa,
            }
          : {}),
      };
    });
  };

  const prefillQuiz2Data = async () => {
    // Embedding-backed similar-word warmup is disabled to reduce DB I/O.
  };

  const handleSaveProject = async () => {
    const selectedWords = words.filter(w => w.isSelected);

    if (selectedWords.length === 0) {
      alert('保存する単語を選択してください');
      return;
    }

    // Only require project title for new projects
    if (!isAddingToExisting && !projectTitle.trim()) {
      alert('単語帳名を入力してください');
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
      const userId = user ? user.id : getGuestUserId();

      let targetProjectId: string;

      if (isAddingToExisting && existingProjectId) {
        const existingProject = await repository.getProject(existingProjectId);
        if (!existingProject || existingProject.userId !== userId) {
          throw new Error('選択した単語帳へのアクセス権がありません');
        }
        const mergedSourceLabels = mergeSourceLabels(existingProject.sourceLabels, initialData.sourceLabels);
        if (mergedSourceLabels.length !== existingProject.sourceLabels.length) {
          await repository.updateProject(existingProjectId, { sourceLabels: mergedSourceLabels });
        }
        // Add to existing project
        targetProjectId = existingProjectId;
      } else {
        // Create new project
        const project = await repository.createProject({
          userId,
          title: projectTitle.trim(),
          sourceLabels: initialData.sourceLabels,
          iconImage: initialData.projectIcon ?? undefined,
        });
        targetProjectId = project.id;
      }

      // Add words to project
      await persistLexiconEntries(initialData.lexiconEntries);

      const createdWords = await repository.createWords(
        selectedWords.map((w) => ({
          projectId: targetProjectId,
          english: w.english,
          japanese: w.japanese,
          japaneseSource: w.japaneseSource,
          lexiconEntryId: w.lexiconEntryId,
          cefrLevel: w.cefrLevel,
          distractors: w.distractors,
          partOfSpeechTags: w.partOfSpeechTags,
          exampleSentence: w.exampleSentence,
          exampleSentenceJa: w.exampleSentenceJa,
        }))
      );

      if (aiEnabledForGeneration) {
        await prefillQuizData(createdWords, repository.updateWord.bind(repository));
      }

      // Pro users: warm quiz2 similarity data during save.
      await prefillQuiz2Data();

      // Clear session storage
      sessionStorage.removeItem('scanvocab_extracted_words');
      sessionStorage.removeItem('scanvocab_source_labels');
      sessionStorage.removeItem('scanvocab_lexicon_entries');
      sessionStorage.removeItem('scanvocab_project_name');
      sessionStorage.removeItem('scanvocab_project_icon');
      sessionStorage.removeItem('scanvocab_existing_project_id');
      sessionStorage.removeItem('scanvocab_ai_enabled');

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

      // Navigate back: to the project page if adding to existing, otherwise home
      if (isAddingToExisting && existingProjectId) {
        router.push(`/project/${existingProjectId}`);
      } else {
        router.push('/');
      }
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
      {/* iOS-style header */}
      <header className="sticky top-0 bg-[var(--color-background)] z-40 border-b border-[var(--color-border-light)]">
        <div className="max-w-lg mx-auto px-5 py-4 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full border border-[var(--color-border)] flex items-center justify-center"
          >
            <Icon name="chevron_left" size={24} className="text-[var(--color-foreground)]" />
          </button>
          <h1 className="text-lg font-bold text-[var(--color-foreground)] flex-1">
            {isAddingToExisting ? '追加する単語を確認' : '確認・編集'}
          </h1>
          <button
            onClick={handleAddManualWord}
            className="w-10 h-10 rounded-full border border-[var(--color-border)] flex items-center justify-center"
          >
            <Icon name="add" size={20} className="text-[var(--color-foreground)]" />
          </button>
        </div>
      </header>

      {/* Limit warning */}
      {showLimitWarning && (
        <div className="bg-[var(--color-warning-light)] border-b border-[var(--color-border)]">
          <div className="max-w-lg mx-auto px-5 py-3">
            <div className="flex items-start gap-3">
              <Icon name="warning" size={20} className="text-[var(--color-warning)] shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-[var(--color-foreground)]">単語数が上限に近づいています</p>
                <p className="text-xs text-[var(--color-muted)] mt-1">
                  現在: {currentWordCount}語 / 上限: {FREE_WORD_LIMIT}語　
                  今回: +{selectedCount}語 → 合計{currentWordCount + selectedCount}語
                  {excessCount > 0 && <span className="text-[var(--color-error)] font-medium"> （{excessCount}語超過）</span>}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-lg mx-auto px-5 pt-5">
        {/* Project title input */}
        {!isAddingToExisting && (
          <div className="mb-5">
            <label className="block text-sm font-medium text-[var(--color-foreground)] mb-1.5">単語帳名</label>
            <input
              type="text"
              value={projectTitle}
              onChange={(e) => setProjectTitle(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] focus:ring-2 focus:ring-[var(--color-foreground)]/20 outline-none bg-[var(--color-surface-secondary)]"
              placeholder="例: ノート P21-23"
            />
          </div>
        )}

        {/* Stats bar */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-[var(--color-muted)]">
            {selectedCount}語選択中{!isPro && ` / 残り${availableSlots}語`}
          </p>
        </div>

        {/* Word list - iOS table style with checkboxes */}
        <div className="card overflow-hidden">
          <div className="divide-y divide-[var(--color-border-light)]">
            {words.map((word) => (
              <WordCard
                key={`${word.tempId}:${word.english}:${word.japanese}`}
                word={word}
                showCheckbox={!isPro && showLimitWarning}
                onToggle={() => handleToggleWord(word.tempId)}
                onDelete={() => handleDeleteWord(word.tempId)}
                onEdit={() => handleEditWord(word.tempId)}
                onSave={(english, japanese) => handleSaveWord(word.tempId, english, japanese)}
                onCancel={() => handleCancelEdit(word.tempId)}
              />
            ))}
          </div>
        </div>

        {words.length === 0 && (
          <div className="text-center py-8 text-[var(--color-muted)] text-sm">
            単語がありません。戻って再度スキャンしてください。
          </div>
        )}
      </main>

      {/* Bottom action bar - iOS style */}
      <div className="fixed bottom-0 left-0 right-0 bg-[var(--color-surface)] border-t border-[var(--color-border)] px-5 py-4 safe-area-bottom z-40">
        <div className="max-w-lg mx-auto">
          <button
            onClick={handleSaveProject}
            disabled={saving || selectedCount === 0 || (!isPro && excessCount > 0)}
            className="w-full py-4 rounded-xl bg-[var(--color-foreground)] text-white font-bold text-base disabled:opacity-50 transition-opacity"
          >
            {saving ? '保存中...' : isAddingToExisting ? `${selectedCount}語を追加` : `単語帳として追加 (${selectedCount}語)`}
          </button>
          {!isPro && excessCount > 0 && (
            <p className="text-xs text-[var(--color-error)] text-center mt-2">{excessCount}語減らしてください</p>
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
      <div className="bg-[var(--color-surface-secondary)] p-4">
        <div className="space-y-3">
          <input
            type="text"
            value={english}
            onChange={(e) => setEnglish(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-base focus:outline-none focus:ring-2 focus:ring-[var(--color-foreground)]/20"
            autoFocus
            placeholder="英単語"
          />
          <input
            type="text"
            value={japanese}
            onChange={(e) => setJapanese(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-foreground)]/20"
            placeholder="日本語訳"
          />
          <div className="flex gap-2">
            <button onClick={onCancel} className="flex-1 py-2 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] text-sm font-medium text-[var(--color-muted)]">
              キャンセル
            </button>
            <button onClick={() => onSave(english, japanese)} className="flex-1 py-2 rounded-xl bg-[var(--color-foreground)] text-white text-sm font-semibold">
              保存
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`px-4 py-3.5 flex items-center gap-3 group ${!word.isSelected ? 'opacity-50' : ''}`}>
      {showCheckbox && (
        <button
          onClick={onToggle}
          className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
            word.isSelected
              ? 'bg-[var(--color-foreground)] border-[var(--color-foreground)]'
              : 'border-[var(--color-border)]'
          }`}
        >
          {word.isSelected && <Icon name="check" size={12} className="text-white" />}
        </button>
      )}
      <div className="flex-1 min-w-0">
        <p className="font-medium text-[var(--color-foreground)]">{word.english}</p>
        <p className="text-sm text-[var(--color-muted)]">{word.japanese}</p>
      </div>
      <div className="flex gap-1">
        <button onClick={onEdit} className="p-1.5 rounded-md active:bg-[var(--color-surface-secondary)]">
          <Icon name="edit" size={16} className="text-[var(--color-muted)]" />
        </button>
        <button onClick={onDelete} className="p-1.5 rounded-md active:bg-[var(--color-error-light)]">
          <Icon name="delete" size={16} className="text-[var(--color-error)]" />
        </button>
      </div>
    </div>
  );
}
