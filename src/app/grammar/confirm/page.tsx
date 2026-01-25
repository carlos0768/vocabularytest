'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Trash2, ChevronDown, BookText, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import type { AIGrammarExtraction } from '@/types';

interface EditablePattern extends AIGrammarExtraction {
  tempId: string;
  isSelected: boolean;
}

export default function GrammarConfirmPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [patterns, setPatterns] = useState<EditablePattern[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);

  const selectedCount = patterns.filter(p => p.isSelected).length;
  const totalQuestions = patterns
    .filter(p => p.isSelected)
    .reduce((acc, p) => acc + (p.quizQuestions?.length || 0), 0);

  // Load extracted patterns from session storage
  useEffect(() => {
    setMounted(true);
    const stored = sessionStorage.getItem('scanvocab_grammar_patterns');
    const storedProjectId = sessionStorage.getItem('scanvocab_project_id');

    if (storedProjectId) {
      setProjectId(storedProjectId);
    }

    if (stored) {
      try {
        const parsed: AIGrammarExtraction[] = JSON.parse(stored);
        setPatterns(
          parsed.map((p, i) => ({
            ...p,
            tempId: `pattern-${i}`,
            isSelected: true,
          }))
        );
      } catch {
        router.push('/');
      }
    } else {
      router.push('/');
    }
  }, [router]);

  const handleTogglePattern = (tempId: string) => {
    setPatterns((prev) =>
      prev.map((p) =>
        p.tempId === tempId ? { ...p, isSelected: !p.isSelected } : p
      )
    );
  };

  const handleDeletePattern = (tempId: string) => {
    setPatterns((prev) => prev.filter((p) => p.tempId !== tempId));
  };

  const handleSave = async () => {
    const selectedPatterns = patterns.filter(p => p.isSelected);

    if (selectedPatterns.length === 0) {
      showToast({ message: '保存する文法パターンを選択してください', type: 'error' });
      return;
    }

    if (!projectId) {
      showToast({ message: 'プロジェクトが見つかりません', type: 'error' });
      return;
    }

    setSaving(true);
    try {
      // Get existing patterns from sessionStorage
      const existingData = sessionStorage.getItem(`grammar_patterns_${projectId}`);
      const existingPatterns: AIGrammarExtraction[] = existingData ? JSON.parse(existingData) : [];

      // Add new patterns (without tempId and isSelected)
      const newPatterns = selectedPatterns.map(({ tempId, isSelected, ...pattern }) => pattern);
      const allPatterns = [...existingPatterns, ...newPatterns];

      // Save to sessionStorage
      sessionStorage.setItem(`grammar_patterns_${projectId}`, JSON.stringify(allPatterns));

      // Clear temporary storage
      sessionStorage.removeItem('scanvocab_grammar_patterns');
      sessionStorage.removeItem('scanvocab_project_id');

      showToast({
        message: `${selectedPatterns.length}つの文法パターンを保存しました`,
        type: 'success',
      });

      // Navigate to grammar quiz page
      router.push(`/grammar/${projectId}`);
    } catch (error) {
      console.error('Save error:', error);
      showToast({ message: '保存に失敗しました', type: 'error' });
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
      <header className="sticky top-0 bg-white/95 backdrop-blur-sm z-40 border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-1.5 -ml-1.5 hover:bg-gray-100 rounded-md transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="text-lg font-semibold text-gray-900">
              文法パターンを確認
            </h1>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-lg mx-auto px-4 py-6">
        {/* Pattern count */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-gray-500">
            抽出された文法パターン
          </h2>
          <span className="text-sm font-medium text-emerald-600">
            {selectedCount}パターン・{totalQuestions}問
          </span>
        </div>

        {/* Pattern list */}
        <div className="space-y-3">
          {patterns.map((pattern, index) => (
            <PatternCard
              key={pattern.tempId}
              pattern={pattern}
              isExpanded={expandedIndex === index}
              onToggleExpand={() => setExpandedIndex(expandedIndex === index ? null : index)}
              onToggleSelect={() => handleTogglePattern(pattern.tempId)}
              onDelete={() => handleDeletePattern(pattern.tempId)}
            />
          ))}
        </div>

        {patterns.length === 0 && (
          <div className="text-center py-8 text-gray-400 text-sm">
            文法パターンがありません。戻って再度スキャンしてください。
          </div>
        )}
      </main>

      {/* Bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm p-4 safe-area-bottom border-t border-gray-100">
        <div className="max-w-lg mx-auto">
          <Button
            onClick={handleSave}
            disabled={saving || selectedCount === 0}
            className="w-full bg-emerald-600 hover:bg-emerald-700"
            size="lg"
          >
            {saving ? (
              '保存中...'
            ) : (
              <>
                <Play className="w-5 h-5 mr-2" />
                {selectedCount}パターン・{totalQuestions}問を保存
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// Pattern card component
function PatternCard({
  pattern,
  isExpanded,
  onToggleExpand,
  onToggleSelect,
  onDelete,
}: {
  pattern: EditablePattern;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`rounded-xl border overflow-hidden transition-all ${
        pattern.isSelected
          ? 'border-gray-200 bg-white'
          : 'border-gray-100 bg-gray-50 opacity-60'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4">
        {/* Checkbox */}
        <button
          onClick={onToggleSelect}
          className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
            pattern.isSelected
              ? 'bg-emerald-600 border-emerald-600'
              : 'border-gray-300 hover:border-gray-400'
          }`}
        >
          {pattern.isSelected && <Check className="w-3 h-3 text-white" />}
        </button>

        {/* Content */}
        <button
          onClick={onToggleExpand}
          className="flex-1 flex items-center justify-between text-left"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-xl">
              <BookText className="w-4 h-4 text-emerald-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 text-sm">{pattern.patternName}</h3>
              <p className="text-xs text-gray-500">{pattern.patternNameEn}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">
              {pattern.quizQuestions?.length || 0}問
            </span>
            <ChevronDown
              className={`w-4 h-4 text-gray-400 transition-transform ${
                isExpanded ? 'rotate-180' : ''
              }`}
            />
          </div>
        </button>

        {/* Delete button */}
        <button
          onClick={onDelete}
          className="p-1.5 hover:bg-red-50 rounded-md transition-colors"
        >
          <Trash2 className="w-4 h-4 text-red-400" />
        </button>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-3 border-t border-gray-100 pt-3">
          {/* Original sentence */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">元の文</p>
            <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-2 italic">
              "{pattern.originalSentence}"
            </p>
          </div>

          {/* Structure */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">構造</p>
            <p className="text-sm text-blue-600 font-mono bg-blue-50 rounded-lg p-2">
              {pattern.structure}
            </p>
          </div>

          {/* Explanation */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">解説</p>
            <p className="text-sm text-gray-600 leading-relaxed">{pattern.explanation}</p>
          </div>

          {/* Example */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">例文</p>
            <div className="bg-emerald-50 rounded-lg p-2 space-y-0.5">
              <p className="text-sm text-emerald-800 font-medium">{pattern.example}</p>
              <p className="text-xs text-emerald-600">{pattern.exampleJa}</p>
            </div>
          </div>

          {/* Level badge */}
          {pattern.level && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500">レベル:</span>
              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
                英検{pattern.level === 'pre2' ? '準2' : pattern.level === 'pre1' ? '準1' : pattern.level}級
              </span>
            </div>
          )}

          {/* Quiz questions preview */}
          {pattern.quizQuestions && pattern.quizQuestions.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 mb-2">
                クイズ問題 ({pattern.quizQuestions.length}問)
              </p>
              <div className="space-y-2">
                {pattern.quizQuestions.slice(0, 2).map((q, i) => (
                  <div key={i} className="text-xs bg-gray-50 rounded-lg p-2">
                    <p className="text-gray-700">{q.question}</p>
                    <p className="text-gray-400 mt-1">正解: {q.correctAnswer}</p>
                  </div>
                ))}
                {pattern.quizQuestions.length > 2 && (
                  <p className="text-xs text-gray-400 text-center">
                    +{pattern.quizQuestions.length - 2}問
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
