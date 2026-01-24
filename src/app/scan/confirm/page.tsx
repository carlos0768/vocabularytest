'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Check, Trash2, Edit2, X, Save, AlertTriangle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useProjects } from '@/hooks/use-projects';
import { useWordCount } from '@/hooks/use-word-count';
import { useAuth } from '@/hooks/use-auth';
import { FREE_WORD_LIMIT } from '@/lib/utils';
import type { AIWordExtraction } from '@/types';

interface EditableWord extends AIWordExtraction {
  tempId: string;
  isEditing: boolean;
  isSelected: boolean;
}

export default function ConfirmPage() {
  const router = useRouter();
  const { createProject } = useProjects();
  const { count: currentWordCount, canAddWords, refresh: refreshWordCount } = useWordCount();
  const { isPro, subscription } = useAuth();
  const { showToast } = useToast();

  const [words, setWords] = useState<EditableWord[]>([]);
  const [projectTitle, setProjectTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Check if adding these words would exceed limit
  const { wouldExceed, excessCount, availableSlots } = canAddWords(words.filter(w => w.isSelected).length);
  const selectedCount = words.filter(w => w.isSelected).length;
  const showLimitWarning = !isPro && wouldExceed;

  // Load extracted words and project name from session storage
  useEffect(() => {
    setMounted(true);
    const stored = sessionStorage.getItem('scanvocab_extracted_words');
    const storedProjectName = sessionStorage.getItem('scanvocab_project_name');
    if (stored) {
      try {
        const parsed: AIWordExtraction[] = JSON.parse(stored);
        setWords(
          parsed.map((w, i) => ({
            ...w,
            tempId: `word-${i}`,
            isEditing: false,
            isSelected: true, // All selected by default
          }))
        );
        // Use stored project name or default title based on date
        if (storedProjectName) {
          setProjectTitle(storedProjectName);
        } else {
          const now = new Date();
          setProjectTitle(
            `スキャン ${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`
          );
        }
      } catch {
        router.push('/');
      }
    } else {
      router.push('/');
    }
  }, [router]);

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

  const handleSaveProject = async () => {
    const selectedWords = words.filter(w => w.isSelected);

    if (selectedWords.length === 0) {
      alert('保存する単語を選択してください');
      return;
    }

    if (!projectTitle.trim()) {
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
      // Create project
      const project = await createProject(projectTitle.trim());
      if (!project) {
        throw new Error('プロジェクトの作成に失敗しました');
      }

      // Add words to project using direct repository call
      const { getRepository } = await import('@/lib/db');
      const subscriptionStatus = subscription?.status || 'free';
      const repository = getRepository(subscriptionStatus);
      await repository.createWords(
        selectedWords.map((w) => ({
          projectId: project.id,
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

      // Navigate to project page
      router.push(`/project/${project.id}`);
    } catch (error) {
      console.error('Save error:', error);
      alert('保存に失敗しました。もう一度お試しください。');
    } finally {
      setSaving(false);
    }
  };

  if (!mounted) {
    return null;
  }

  return (
    <div className="min-h-screen bg-white pb-32">
      {/* Header */}
      <header className="sticky top-0 bg-white/95 backdrop-blur-sm z-40">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-1.5 -ml-1.5 hover:bg-gray-100 rounded-md transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="text-lg font-semibold text-gray-900">確認・編集</h1>
          </div>
        </div>
      </header>

      {/* Limit warning banner */}
      {showLimitWarning && (
        <div className="bg-amber-50 border-b border-amber-100">
          <div className="max-w-lg mx-auto px-4 py-3">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-800">
                  単語数が上限に近づいています
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  現在: {currentWordCount}語 / 上限: {FREE_WORD_LIMIT}語
                  <br />
                  今回: +{selectedCount}語 → 合計{currentWordCount + selectedCount}語
                  {excessCount > 0 && (
                    <span className="text-red-600 font-medium">
                      （{excessCount}語超過）
                    </span>
                  )}
                </p>
                <p className="text-xs text-amber-700 mt-2">
                  保存できる単語を<span className="font-medium">{availableSlots}語</span>まで選んでください。
                </p>
              </div>
            </div>

            {/* Pro upgrade mini card */}
            <div className="mt-3 bg-white rounded-lg p-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span className="text-sm text-gray-700">Proなら単語数無制限</span>
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
        {/* Project title input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            プロジェクト名
          </label>
          <input
            type="text"
            value={projectTitle}
            onChange={(e) => setProjectTitle(e.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none transition-all bg-gray-50 focus:bg-white"
            placeholder="例: ノート P21-23"
          />
        </div>

        {/* Word count */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-gray-500">
            抽出された単語
          </h2>
          <span className={`text-sm font-medium ${showLimitWarning && excessCount > 0 ? 'text-red-600' : 'text-blue-600'}`}>
            {selectedCount}語選択中
            {!isPro && ` / 残り${availableSlots}語`}
          </span>
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
          <div className="text-center py-8 text-gray-400 text-sm">
            単語がありません。戻って再度スキャンしてください。
          </div>
        )}
      </main>

      {/* Bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm p-4 safe-area-bottom border-t border-gray-100">
        <div className="max-w-lg mx-auto">
          <Button
            onClick={handleSaveProject}
            disabled={saving || selectedCount === 0 || (!isPro && excessCount > 0)}
            className="w-full"
            size="lg"
          >
            {saving ? (
              '保存中...'
            ) : (
              <>
                <Check className="w-5 h-5 mr-2" />
                {selectedCount}語を保存して学習を始める
              </>
            )}
          </Button>
          {!isPro && excessCount > 0 && (
            <p className="text-xs text-red-500 text-center mt-2">
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
      <div className="bg-blue-50 rounded-xl p-4">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              英単語
            </label>
            <input
              type="text"
              value={english}
              onChange={(e) => setEnglish(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-base bg-white"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              日本語訳
            </label>
            <input
              type="text"
              value={japanese}
              onChange={(e) => setJapanese(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 outline-none text-sm bg-white"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={onCancel}
              className="flex-1"
            >
              <X className="w-4 h-4 mr-1" />
              キャンセル
            </Button>
            <Button
              size="sm"
              onClick={() => onSave(english, japanese)}
              className="flex-1"
            >
              <Save className="w-4 h-4 mr-1" />
              保存
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl p-4 group transition-colors ${
        word.isSelected
          ? 'bg-gray-50 hover:bg-gray-100'
          : 'bg-gray-100 opacity-50'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        {showCheckbox && (
          <button
            onClick={onToggle}
            className={`mt-1 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
              word.isSelected
                ? 'bg-blue-600 border-blue-600'
                : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            {word.isSelected && <Check className="w-3 h-3 text-white" />}
          </button>
        )}

        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900">
            {word.english}
          </p>
          <p className="text-sm text-gray-500 mt-0.5">{word.japanese}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {word.distractors.map((d, i) => (
              <span
                key={i}
                className="text-xs bg-gray-200 text-gray-500 px-2 py-0.5 rounded-md"
              >
                {d}
              </span>
            ))}
          </div>
        </div>

        <div className="flex gap-1 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            className="p-1.5 hover:bg-gray-200 rounded-md transition-colors"
            title="編集"
          >
            <Edit2 className="w-4 h-4 text-gray-500" />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 hover:bg-red-50 rounded-md transition-colors"
            title="削除"
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>
        </div>
      </div>
    </div>
  );
}
