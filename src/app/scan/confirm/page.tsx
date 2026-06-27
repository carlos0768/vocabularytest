'use client';

import { useState, useEffect, useLayoutEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DesktopScanConfirmView } from '@/components/desktop/DesktopScan';
import { Icon } from '@/components/ui/Icon';
import { TranslationDisplay } from '@/components/word/TranslationDisplay';
import { useToast } from '@/components/ui/toast';
import { useWordCount } from '@/hooks/use-word-count';
import { useAuth } from '@/hooks/use-auth';
import { useOnboarding } from '@/hooks/use-onboarding';
import { useUserPreferences } from '@/hooks/use-user-preferences';
import { getRepository } from '@/lib/db';
import { getDb } from '@/lib/db/dexie';
import { FREE_WORD_LIMIT, getGuestUserId } from '@/lib/utils';
import { invalidateHomeCache } from '@/lib/home-cache';
import { createBrowserClient } from '@/lib/supabase';
import {
  isWordOrderEligible,
  normalizeWordOrderQuizCache,
} from '@/lib/quiz/word-order';
import type { AIWordExtraction, LexiconEntry, Word, WordOrderQuizCache } from '@/types';
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
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
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
  return typeof value === 'string' && (value as string).trim().length > 0;
}

function hasPartOfSpeechTags(value: unknown): boolean {
  return Array.isArray(value) && value.some((item) => typeof item === 'string' && item.trim().length > 0);
}

function hasPronunciation(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const supabase = createBrowserClient();
  const { data: { session } } = await supabase.auth.getSession();
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  return headers;
}

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
    return { words: null, sourceLabels: [], lexiconEntries: [], projectName: null, projectIcon: null, existingProjectId: null, scanAiEnabled: null };
  }
  try {
    const stored = sessionStorage.getItem('scanvocab_extracted_words');
    const sourceLabelsStored = sessionStorage.getItem('scanvocab_source_labels');
    const lexiconEntriesStored = sessionStorage.getItem('scanvocab_lexicon_entries');
    const projectName = sessionStorage.getItem('scanvocab_project_name');
    const projectIcon = sessionStorage.getItem('scanvocab_project_icon');
    const existingProjectId = sessionStorage.getItem('scanvocab_existing_project_id');
    const aiEnabledRaw = sessionStorage.getItem('scanvocab_ai_enabled');
    const scanAiEnabled = aiEnabledRaw === '1' ? true : aiEnabledRaw === '0' ? false : null;
    const sourceLabels = sourceLabelsStored ? ensureSourceLabels(JSON.parse(sourceLabelsStored) as unknown[]) : [];
    const lexiconEntries = lexiconEntriesStored ? (JSON.parse(lexiconEntriesStored) as LexiconEntry[]) : [];
    if (stored) {
      return { words: JSON.parse(stored) as AIWordExtraction[], sourceLabels, lexiconEntries, projectName, projectIcon, existingProjectId, scanAiEnabled };
    }
  } catch { /* fall through */ }
  return { words: null, sourceLabels: [], lexiconEntries: [], projectName: null, projectIcon: null, existingProjectId: null, scanAiEnabled: null };
}

export default function ConfirmPage() {
  const router = useRouter();
  const { count: currentWordCount, canAddWords, refresh: refreshWordCount } = useWordCount();
  const { isPro, subscription, user } = useAuth();
  const { step: onboardingStep, setStep: setOnboardingStep } = useOnboarding();
  const { aiEnabled: accountAiEnabled } = useUserPreferences();
  const { showToast } = useToast();

  const [initialData] = useState(getInitialData);
  const [dataReady, setDataReady] = useState(false);
  const [shouldRedirect, setShouldRedirect] = useState(false);

  const [words, setWords] = useState<EditableWord[]>(() => {
    if (initialData.words) {
      return initialData.words.map((w, i) => ({ ...w, tempId: `word-${i}`, isEditing: false, isSelected: true }));
    }
    return [];
  });

  const [projectTitle, setProjectTitle] = useState(() => {
    if (initialData.existingProjectId) return '';
    if (initialData.projectName) return initialData.projectName;
    const now = new Date();
    return `スキャン ${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
  });

  const [existingProjectId] = useState<string | null>(initialData.existingProjectId);
  const [saving, setSaving] = useState(false);
  const aiEnabledForGeneration = (initialData.scanAiEnabled ?? accountAiEnabled) !== false;

  const { wouldExceed, excessCount, availableSlots } = canAddWords(words.filter(w => w.isSelected).length);
  const selectedCount = words.filter(w => w.isSelected).length;
  const showLimitWarning = !isPro && wouldExceed;
  const isAddingToExisting = !!existingProjectId;

  useLayoutEffect(() => {
    if (initialData.words && initialData.words.length > 0) setDataReady(true);
    else setShouldRedirect(true);
  }, [initialData.words]);

  useEffect(() => {
    if (shouldRedirect) {
      showToast({ message: 'スキャンデータが見つかりません。もう一度スキャンしてください。', type: 'error' });
      router.replace('/');
    }
  }, [shouldRedirect, showToast, router]);

  const handleDeleteWord = (tempId: string) => setWords((prev) => prev.filter((w) => w.tempId !== tempId));
  const handleToggleWord = (tempId: string) => setWords((prev) => prev.map((w) => w.tempId === tempId ? { ...w, isSelected: !w.isSelected } : w));
  const handleEditWord = (tempId: string) => setWords((prev) => prev.map((w) => w.tempId === tempId ? { ...w, isEditing: true } : w));
  const handleSaveWord = (tempId: string, english: string, japanese: string) =>
    setWords((prev) => prev.map((w) => w.tempId === tempId ? { ...w, english, japanese, japaneseSource: undefined, isEditing: false } : w));
  const handleCancelEdit = (tempId: string) => setWords((prev) => prev.map((w) => w.tempId === tempId ? { ...w, isEditing: false } : w));
  const handleAddManualWord = () => {
    const newWord: EditableWord = {
      english: '', japanese: '', distractors: [], partOfSpeechTags: [], exampleSentence: '', exampleSentenceJa: '',
      tempId: `word-manual-${Date.now()}`, isEditing: true, isSelected: true,
    };
    setWords((prev) => [...prev, newWord]);
  };

  const persistLexiconEntries = async (entries: LexiconEntry[]) => {
    if (entries.length === 0) return;
    try { await getDb().lexiconEntries.bulkPut(entries); }
    catch (error) { console.error('Failed to cache lexicon entries locally:', error); }
  };

  const prefillQuizData = async (createdWords: Word[], updateWord: (id: string, updates: Partial<Word>) => Promise<void>): Promise<Word[]> => {
    if (createdWords.length === 0) return createdWords;
    const headers = await getAuthHeaders();
    const seedWords = createdWords
      .filter((w) => w.english.trim().length > 0 && w.japanese.trim().length > 0 &&
        !isWordOrderEligible(w) &&
        (!hasValidDistractors(w.distractors) || !hasExampleSentence(w.exampleSentence) || !hasPronunciation(w.pronunciation) || !hasPartOfSpeechTags(w.partOfSpeechTags)))
      .map((w) => ({ id: w.id, english: w.english, japanese: w.japanese }));
    const wordOrderSeedWords = createdWords
      .filter((w) => w.english.trim().length > 0 && w.japanese.trim().length > 0 &&
        isWordOrderEligible(w) &&
        !normalizeWordOrderQuizCache(w, w.wordOrderQuiz))
      .map((w) => ({ id: w.id, english: w.english, japanese: w.japanese }));
    if (seedWords.length === 0 && wordOrderSeedWords.length === 0) return createdWords;

    const resultMap = new Map<string, { distractors: string[]; partOfSpeechTags: string[]; pronunciation: string; exampleSentence: string; exampleSentenceJa: string }>();
    if (seedWords.length > 0) {
      const batches = chunkArray(seedWords, QUIZ_PREFILL_BATCH_SIZE);

      for (const batch of batches) {
        let pending = batch;
        for (let attempt = 1; attempt <= QUIZ_PREFILL_MAX_ATTEMPTS && pending.length > 0; attempt += 1) {
          try {
            const response = await fetch('/api/generate-quiz-distractors', { method: 'POST', headers, body: JSON.stringify({ words: pending }) });
            if (!response.ok) throw new Error(`prefill request failed: ${response.status}`);
            const data = await response.json();
            if (!data.success || !Array.isArray(data.results)) throw new Error('prefill response format is invalid');
            const succeeded = new Set<string>();
            for (const result of data.results) {
              if (!result?.wordId || !Array.isArray(result.distractors)) continue;
              succeeded.add(result.wordId);
              resultMap.set(result.wordId, { distractors: result.distractors, partOfSpeechTags: Array.isArray(result.partOfSpeechTags) ? result.partOfSpeechTags : [], pronunciation: result.pronunciation || '', exampleSentence: result.exampleSentence || '', exampleSentenceJa: result.exampleSentenceJa || '' });
            }
            pending = pending.filter((w) => !succeeded.has(w.id));
            if (pending.length > 0 && attempt < QUIZ_PREFILL_MAX_ATTEMPTS) await sleep(250 * attempt);
          } catch (error) {
            if (attempt >= QUIZ_PREFILL_MAX_ATTEMPTS) { console.error('Quiz prefill failed:', error); break; }
            await sleep(250 * attempt);
          }
        }
      }
    }

    const wordById = new Map(createdWords.map((word) => [word.id, word]));
    const wordOrderResultMap = new Map<string, WordOrderQuizCache>();
    if (wordOrderSeedWords.length > 0) {
      const batches = chunkArray(wordOrderSeedWords, QUIZ_PREFILL_BATCH_SIZE);
      for (const batch of batches) {
        let pending = batch;
        for (let attempt = 1; attempt <= QUIZ_PREFILL_MAX_ATTEMPTS && pending.length > 0; attempt += 1) {
          try {
            const response = await fetch('/api/generate-word-order-quiz', { method: 'POST', headers, body: JSON.stringify({ words: pending }) });
            if (!response.ok) throw new Error(`word-order prefill request failed: ${response.status}`);
            const data = await response.json();
            if (!data.success || !Array.isArray(data.results)) throw new Error('word-order prefill response format is invalid');
            const succeeded = new Set<string>();
            for (const result of data.results as Array<{ wordId?: unknown; quiz?: unknown }>) {
              if (typeof result?.wordId !== 'string') continue;
              const sourceWord = wordById.get(result.wordId);
              if (!sourceWord) continue;
              const quiz = normalizeWordOrderQuizCache(sourceWord, result.quiz);
              if (!quiz) continue;
              succeeded.add(result.wordId);
              wordOrderResultMap.set(result.wordId, quiz);
            }
            pending = pending.filter((w) => !succeeded.has(w.id));
            if (pending.length > 0 && attempt < QUIZ_PREFILL_MAX_ATTEMPTS) await sleep(250 * attempt);
          } catch (error) {
            if (attempt >= QUIZ_PREFILL_MAX_ATTEMPTS) { console.error('Word-order quiz prefill failed:', error); break; }
            await sleep(250 * attempt);
          }
        }
      }
    }

    const updates: Array<Promise<void>> = [];
    for (const word of createdWords) {
      const generated = resultMap.get(word.id);
      const wordOrderQuiz = wordOrderResultMap.get(word.id);
      if (!generated && !wordOrderQuiz) continue;
      const patch: Partial<Word> = {};
      if (generated) {
        patch.distractors = generated.distractors;
        patch.partOfSpeechTags = generated.partOfSpeechTags;
        if (generated.pronunciation.trim().length > 0) patch.pronunciation = generated.pronunciation;
        if (generated.exampleSentence.trim().length > 0) { patch.exampleSentence = generated.exampleSentence; patch.exampleSentenceJa = generated.exampleSentenceJa; }
      }
      if (wordOrderQuiz) patch.wordOrderQuiz = wordOrderQuiz;
      updates.push(updateWord(word.id, patch));
    }
    await Promise.all(updates);

    return createdWords.map((word) => {
      const generated = resultMap.get(word.id);
      const wordOrderQuiz = wordOrderResultMap.get(word.id);
      if (!generated && !wordOrderQuiz) return word;
      return {
        ...word,
        ...(generated ? {
          distractors: generated.distractors,
          partOfSpeechTags: generated.partOfSpeechTags,
          ...(generated.pronunciation.trim().length > 0 ? { pronunciation: generated.pronunciation } : {}),
          ...(generated.exampleSentence.trim().length > 0 ? { exampleSentence: generated.exampleSentence, exampleSentenceJa: generated.exampleSentenceJa } : {}),
        } : {}),
        ...(wordOrderQuiz ? { wordOrderQuiz } : {}),
      };
    });
  };

  const handleSaveProject = async () => {
    const selectedWords = words.filter(w => w.isSelected);
    if (selectedWords.length === 0) { alert('保存する単語を選択してください'); return; }

    setSaving(true);
    try {
      const subscriptionStatus = subscription?.status || 'free';
      const repository = getRepository(subscriptionStatus);
      const userId = user ? user.id : getGuestUserId();
      let targetProjectId: string;

      if (isAddingToExisting && existingProjectId) {
        const existingProject = await repository.getProject(existingProjectId);
        if (!existingProject || existingProject.userId !== userId) throw new Error('選択した単語帳へのアクセス権がありません');
        const mergedSourceLabels = mergeSourceLabels(existingProject.sourceLabels, initialData.sourceLabels);
        if (mergedSourceLabels.length !== existingProject.sourceLabels.length) await repository.updateProject(existingProjectId, { sourceLabels: mergedSourceLabels });
        targetProjectId = existingProjectId;
      } else {
        const project = await repository.createProject({ userId, title: projectTitle.trim(), sourceLabels: initialData.sourceLabels, iconImage: initialData.projectIcon ?? undefined });
        targetProjectId = project.id;
      }

      await persistLexiconEntries(initialData.lexiconEntries);
      const createdWords = await repository.createWords(selectedWords.map((w) => ({
        projectId: targetProjectId, english: w.english, japanese: w.japanese, rawJapanese: w.rawJapanese, japaneseSource: w.japaneseSource,
        translations: w.translations, customSections: w.customSections,
        lexiconEntryId: w.lexiconEntryId, lexiconSenseId: w.lexiconSenseId, cefrLevel: w.cefrLevel, distractors: w.distractors,
        partOfSpeechTags: w.partOfSpeechTags, pronunciation: w.pronunciation, exampleSentence: w.exampleSentence, exampleSentenceJa: w.exampleSentenceJa,
      })));

      if (aiEnabledForGeneration) void prefillQuizData(createdWords, repository.updateWord.bind(repository));

      ['scanvocab_extracted_words','scanvocab_source_labels','scanvocab_lexicon_entries','scanvocab_project_name','scanvocab_project_icon','scanvocab_existing_project_id','scanvocab_ai_enabled'].forEach(k => sessionStorage.removeItem(k));

      // Onboarding: signed_up → first_scan_done on first successful save.
      if (onboardingStep === 'signed_up') {
        await setOnboardingStep('first_scan_done');
      }

      refreshWordCount();

      const newTotal = currentWordCount + selectedWords.length;
      if (!isPro && currentWordCount < 80 && newTotal >= 80) {
        showToast({ message: `80語達成! あと${FREE_WORD_LIMIT - newTotal}語で上限です`, type: 'success', action: { label: 'Pro詳細', onClick: () => router.push('/subscription') }, duration: 4000 });
      }
      if (isAddingToExisting) showToast({ message: `${selectedWords.length}語を追加しました`, type: 'success' });

      invalidateHomeCache();
      if (isAddingToExisting && existingProjectId) router.push(`/project/${existingProjectId}`);
      else router.push('/');
    } catch (error) {
      console.error('Save error:', error);
      alert(`保存に失敗しました: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  /* ---------- Loading state ---------- */
  if (!dataReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--color-background)]">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-[var(--solid-ink)] border-t-transparent" />
          <p className="text-[var(--color-muted)]">読み込み中</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <DesktopScanConfirmView
        words={words}
        projectTitle={projectTitle}
        isAddingToExisting={isAddingToExisting}
        selectedCount={selectedCount}
        availableSlots={availableSlots}
        showLimitWarning={showLimitWarning}
        excessCount={excessCount}
        currentWordCount={currentWordCount}
        saving={saving}
        isPro={isPro}
        onProjectTitleChange={setProjectTitle}
        onToggleWord={handleToggleWord}
        onEditWord={handleEditWord}
        onSaveWord={handleSaveWord}
        onCancelEdit={handleCancelEdit}
        onDeleteWord={handleDeleteWord}
        onAddManualWord={handleAddManualWord}
        onBack={() => router.back()}
        onSaveProject={() => void handleSaveProject()}
      />
      <div className="flex min-h-screen flex-col bg-[var(--color-background)] pt-3 font-[var(--font-body)] lg:hidden">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-[14px] pb-2.5 pt-2">
        <button type="button" onClick={() => router.back()} className="flex h-[38px] w-[38px] items-center justify-center rounded-[19px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px">
          <Icon name="chevron_left" size={18} />
        </button>
        <div className="flex flex-1 flex-col items-center gap-px">
          <div className="font-mono text-[9px] font-bold tracking-[0.06em] text-[var(--color-accent)]">✓ SCAN COMPLETE</div>
          <div className="text-sm font-bold text-[var(--solid-ink)]">
            {isAddingToExisting ? '追加する単語を確認' : '確認・編集'}
          </div>
        </div>
        <button type="button" onClick={handleAddManualWord} className="flex h-[38px] w-[38px] items-center justify-center rounded-[19px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px">
          <Icon name="add" size={18} />
        </button>
      </div>

      {/* Scan preview + project name */}
      <div className="flex items-center gap-2.5 px-[18px] pb-3 pt-0.5">
        <div
          className="relative h-[68px] w-[54px] shrink-0 overflow-hidden rounded border-2 border-[var(--solid-ink)]"
          style={{ background: 'linear-gradient(135deg, #d4c9a8, #e8dfc2)' }}
        >
          {[8, 16, 24, 34, 42, 50, 58].map((y, i) => (
            <div key={i} className="absolute left-1.5 h-0.5 rounded-sm" style={{ top: y, width: `${80 - i * 4}%`, background: `rgba(26,26,26,${0.3 - i * 0.02})` }} />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] font-bold tracking-[0.06em] text-[var(--color-muted)]">PROJECT</div>
          {isAddingToExisting ? (
            <div className="mt-[3px] rounded-lg border-2 border-[var(--solid-ink)] bg-white px-2.5 py-[7px]">
              <div className="text-sm font-bold text-[var(--solid-ink)]">既存の単語帳に追加</div>
            </div>
          ) : (
            <div className="mt-[3px] flex items-center gap-1.5 rounded-lg border-2 border-[var(--solid-ink)] bg-white px-2.5 py-[7px]">
              <input
                type="text"
                value={projectTitle}
                onChange={(e) => setProjectTitle(e.target.value)}
                className="flex-1 bg-transparent text-sm font-bold text-[var(--solid-ink)] focus:outline-none"
                placeholder="単語帳名"
              />
              <Icon name="edit" size={13} className="text-[var(--color-muted)]" />
            </div>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="flex gap-1.5 px-[18px] pb-3">
        <StatChip label="抽出" value={words.length} />
        <StatChip label="選択中" value={selectedCount} accent="var(--color-success)" />
        {!isPro && <StatChip label={`残り${availableSlots}語`} value={availableSlots} accent={showLimitWarning ? 'var(--color-warning)' : 'var(--solid-ink)'} />}
      </div>

      {/* Limit warning */}
      {showLimitWarning && (
        <div className="mx-[18px] mb-3 rounded-lg border border-[var(--color-warning)] bg-[rgba(255,165,0,0.06)] px-3 py-2.5">
          <div className="flex items-start gap-2">
            <Icon name="warning" size={16} className="mt-0.5 shrink-0 text-[var(--color-warning)]" />
            <div>
              <p className="text-xs font-bold text-[var(--solid-ink)]">単語数が上限に近づいています</p>
              <p className="text-[11px] text-[var(--color-muted)]">
                現在: {currentWordCount}語 / 上限: {FREE_WORD_LIMIT}語
                {excessCount > 0 && <span className="font-semibold text-[var(--color-error)]"> （{excessCount}語超過）</span>}
              </p>
            </div>
          </div>
        </div>
      )}


      {/* Word count + add button */}
      <div className="flex items-center justify-between px-[18px] pb-2.5">
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
          抽出された単語 ({words.length})
        </div>
        <button type="button" onClick={handleAddManualWord} className="text-[11px] font-semibold text-[var(--color-accent)]">
          + 手動で追加
        </button>
      </div>

      {/* Word list */}
      <div className="flex flex-col gap-[5px] px-[14px] pb-[110px]">
        {words.map((w, i) =>
          w.isEditing ? (
            <EditingWordRow key={w.tempId} w={w} onSave={handleSaveWord} onCancel={handleCancelEdit} />
          ) : (
            <WordRow key={w.tempId} w={w} index={i} onEdit={handleEditWord} onDelete={handleDeleteWord} />
          )
        )}
        {words.length === 0 && (
          <div className="py-8 text-center text-sm text-[var(--color-muted)]">単語がありません。戻って再度スキャンしてください。</div>
        )}
      </div>

      {/* Bottom action */}
      <div className="fixed inset-x-0 bottom-0 flex gap-2 bg-gradient-to-t from-[#fafaf7] via-[#fafaf7] to-transparent px-[18px] pb-[30px] pt-3.5">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex items-center gap-1 rounded-xl border-2 border-[var(--solid-ink)] bg-white px-4 py-3 text-[13px] font-bold text-[var(--solid-ink)]"
        >
          <Icon name="close" size={13} />
        </button>
        <div className="flex-1">
          <button
            type="button"
            onClick={handleSaveProject}
            disabled={saving || selectedCount === 0 || (!isPro && excessCount > 0)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] py-3 text-sm font-bold text-white disabled:opacity-50"
          >
            {saving ? (
              <><div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> 保存中...</>
            ) : (
              <><Icon name="check" size={14} /> {isAddingToExisting ? `${selectedCount}語を追加` : `${selectedCount}語を保存`}</>
            )}
          </button>
        </div>
      </div>
      </div>
    </>
  );
}

/* ---------- Stat chip ---------- */
function StatChip({ label, value, accent = 'var(--solid-ink)' }: { label: string; value: number; accent?: string }) {
  return (
    <div className="flex flex-1 flex-col gap-0.5 rounded-lg border-2 border-[var(--color-border)] bg-white px-2.5 py-2">
      <span className="font-mono text-[9px] font-bold tracking-[0.06em] text-[var(--color-muted)]">{label}</span>
      <span className="font-display text-lg font-extrabold tabular-nums leading-none" style={{ color: accent }}>{value}</span>
    </div>
  );
}

/* ---------- Word row (DS style) ---------- */
function WordRow({
  w,
  index,
  onEdit,
  onDelete,
}: {
  w: EditableWord;
  index: number;
  onEdit: (tempId: string) => void;
  onDelete: (tempId: string) => void;
}) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-[10px] bg-white px-3 py-2.5"
      style={{ border: `1.25px solid var(--color-border)` }}
    >
      <div className="min-w-0 flex-1">
        <div className="font-display text-sm font-bold text-[var(--solid-ink)]">{w.english || `単語 ${index + 1}`}</div>
        <div className="mt-px text-[11px] text-[var(--color-muted)]">
          <TranslationDisplay word={w} compact />
        </div>
      </div>
      <div className="flex gap-0.5">
        <button
          type="button"
          onClick={() => onEdit(w.tempId)}
          className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-md border border-[var(--color-border)] bg-white text-[var(--color-muted)]"
        >
          <Icon name="edit" size={12} />
        </button>
        <button
          type="button"
          onClick={() => onDelete(w.tempId)}
          className="inline-flex h-[26px] w-[26px] items-center justify-center rounded-md border border-[var(--color-border)] bg-white text-[var(--color-error)]"
        >
          <Icon name="delete" size={12} />
        </button>
      </div>
    </div>
  );
}

/* ---------- Editing word row (DS style) ---------- */
function EditingWordRow({
  w,
  onSave,
  onCancel,
}: {
  w: EditableWord;
  onSave: (tempId: string, english: string, japanese: string) => void;
  onCancel: (tempId: string) => void;
}) {
  const [english, setEnglish] = useState(w.english);
  const [japanese, setJapanese] = useState(w.japanese);

  return (
    <div className="rounded-[10px] border-2 border-[var(--solid-ink)] bg-[#faf7f1] p-3">
      <div className="mb-2 flex gap-2">
        <div className="flex-1">
          <div className="mb-[3px] font-mono text-[9px] font-bold tracking-[0.06em] text-[var(--color-muted)]">英単語</div>
          <div className="relative">
            <input
              type="text"
              value={english}
              onChange={(e) => setEnglish(e.target.value)}
              autoFocus
              placeholder="英単語"
              className="w-full rounded-md border-2 border-[var(--solid-ink)] bg-white px-2.5 py-[7px] font-display text-[13px] font-bold text-[var(--solid-ink)] focus:outline-none"
            />
          </div>
        </div>
        <div className="flex-[1.4]">
          <div className="mb-[3px] font-mono text-[9px] font-bold tracking-[0.06em] text-[var(--color-muted)]">日本語訳</div>
          <input
            type="text"
            value={japanese}
            onChange={(e) => setJapanese(e.target.value)}
            placeholder="日本語訳"
            className="w-full rounded-md border-2 border-[var(--solid-ink)] bg-white px-2.5 py-[7px] text-xs text-[var(--solid-ink)] focus:outline-none"
          />
        </div>
      </div>
      <div className="flex justify-end gap-1.5">
        <button
          type="button"
          onClick={() => onCancel(w.tempId)}
          className="rounded-md border border-[var(--color-border)] bg-white px-2.5 py-[5px] text-[11px] font-bold text-[var(--color-muted)]"
        >
          キャンセル
        </button>
        <button
          type="button"
          onClick={() => onSave(w.tempId, english, japanese)}
          className="rounded-md border border-[var(--solid-ink)] bg-[var(--solid-ink)] px-2.5 py-[5px] text-[11px] font-bold text-white"
        >
          保存
        </button>
      </div>
    </div>
  );
}
