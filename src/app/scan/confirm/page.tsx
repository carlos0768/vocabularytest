'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Trash2, Edit2, X, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProjects } from '@/hooks/use-projects';
import { useWords } from '@/hooks/use-words';
import { getGuestUserId } from '@/lib/utils';
import type { AIWordExtraction } from '@/types';

interface EditableWord extends AIWordExtraction {
  tempId: string;
  isEditing: boolean;
}

export default function ConfirmPage() {
  const router = useRouter();
  const { createProject } = useProjects();
  const [words, setWords] = useState<EditableWord[]>([]);
  const [projectTitle, setProjectTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Load extracted words from session storage
  useEffect(() => {
    setMounted(true);
    const stored = sessionStorage.getItem('scanvocab_extracted_words');
    if (stored) {
      try {
        const parsed: AIWordExtraction[] = JSON.parse(stored);
        setWords(
          parsed.map((w, i) => ({
            ...w,
            tempId: `word-${i}`,
            isEditing: false,
          }))
        );
        // Set default title based on date
        const now = new Date();
        setProjectTitle(
          `スキャン ${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`
        );
      } catch {
        router.push('/');
      }
    } else {
      router.push('/');
    }
  }, [router]);

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
    if (words.length === 0) {
      alert('保存する単語がありません');
      return;
    }

    if (!projectTitle.trim()) {
      alert('プロジェクト名を入力してください');
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
      const repository = getRepository('free');
      await repository.createWords(
        words.map((w) => ({
          projectId: project.id,
          english: w.english,
          japanese: w.japanese,
          distractors: w.distractors,
          status: 'new' as const,
        }))
      );

      // Clear session storage
      sessionStorage.removeItem('scanvocab_extracted_words');

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
    <div className="min-h-screen pb-24">
      {/* Header */}
      <header className="sticky top-0 bg-white/80 backdrop-blur-sm border-b border-gray-200 z-40">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="text-lg font-semibold">確認・編集</h1>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-lg mx-auto px-4 py-6">
        {/* Project title input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            プロジェクト名
          </label>
          <input
            type="text"
            value={projectTitle}
            onChange={(e) => setProjectTitle(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
            placeholder="例: ノート P21-23"
          />
        </div>

        {/* Word count */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-medium text-gray-900">
            抽出された単語 ({words.length}語)
          </h2>
        </div>

        {/* Word list */}
        <div className="space-y-3">
          {words.map((word) => (
            <WordCard
              key={word.tempId}
              word={word}
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
          <div className="text-center py-8 text-gray-500">
            単語がありません。戻って再度スキャンしてください。
          </div>
        )}
      </main>

      {/* Bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 safe-area-bottom">
        <div className="max-w-lg mx-auto">
          <Button
            onClick={handleSaveProject}
            disabled={saving || words.length === 0}
            className="w-full"
            size="lg"
          >
            {saving ? (
              '保存中...'
            ) : (
              <>
                <Check className="w-5 h-5 mr-2" />
                保存して学習を始める
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Word card component with edit functionality
function WordCard({
  word,
  onDelete,
  onEdit,
  onSave,
  onCancel,
}: {
  word: EditableWord;
  onDelete: () => void;
  onEdit: () => void;
  onSave: (english: string, japanese: string) => void;
  onCancel: () => void;
}) {
  const [english, setEnglish] = useState(word.english);
  const [japanese, setJapanese] = useState(word.japanese);

  useEffect(() => {
    setEnglish(word.english);
    setJapanese(word.japanese);
  }, [word.english, word.japanese]);

  if (word.isEditing) {
    return (
      <div className="bg-white rounded-xl border-2 border-blue-500 p-4 shadow-sm">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">
              英単語
            </label>
            <input
              type="text"
              value={english}
              onChange={(e) => setEnglish(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 outline-none text-lg"
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
              className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 outline-none"
            />
          </div>
          <div className="flex gap-2 pt-2">
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
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm group">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-lg font-medium text-gray-900 truncate">
            {word.english}
          </p>
          <p className="text-gray-600 mt-0.5">{word.japanese}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {word.distractors.map((d, i) => (
              <span
                key={i}
                className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded"
              >
                {d}
              </span>
            ))}
          </div>
        </div>
        <div className="flex gap-1 ml-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            title="編集"
          >
            <Edit2 className="w-4 h-4 text-gray-500" />
          </button>
          <button
            onClick={onDelete}
            className="p-2 hover:bg-red-50 rounded-full transition-colors"
            title="削除"
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>
        </div>
      </div>
    </div>
  );
}
