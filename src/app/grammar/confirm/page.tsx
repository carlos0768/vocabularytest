'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, useToast } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { getDb } from '@/lib/db/dexie';
import type { GrammarPattern } from '@/types';
import type { ValidatedGrammarPattern } from '@/lib/schemas/grammar-response';

export default function GrammarConfirmPage() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [patterns, setPatterns] = useState<(ValidatedGrammarPattern & { selected: boolean })[]>([]);
  const [projectName, setProjectName] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Load extracted patterns from sessionStorage
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('grammar_extracted_patterns');
      if (!raw) {
        showToast({ message: '文法データが見つかりません', type: 'error' });
        startTransition(() => { router.replace('/'); });
        return;
      }
      const parsed = JSON.parse(raw) as ValidatedGrammarPattern[];
      setPatterns(parsed.map((p) => ({ ...p, selected: true })));

      const now = new Date();
      const defaultName = `文法 ${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
      setProjectName(defaultName);
      setLoaded(true);
    } catch {
      showToast({ message: '文法データの読み込みに失敗しました', type: 'error' });
      startTransition(() => { router.replace('/'); });
    }
  }, [router, showToast, startTransition]);

  const selectedCount = patterns.filter((p) => p.selected).length;

  const handleToggle = (index: number) => {
    setPatterns((prev) => prev.map((p, i) => i === index ? { ...p, selected: !p.selected } : p));
  };

  const handleSave = async () => {
    if (selectedCount === 0) {
      showToast({ message: '少なくとも1つのパターンを選択してください', type: 'warning' });
      return;
    }
    if (!projectName.trim()) {
      showToast({ message: 'プロジェクト名を入力してください', type: 'warning' });
      return;
    }

    setSaving(true);
    try {
      const db = getDb();
      const userId = user?.id || 'guest';
      const existingProjectId = sessionStorage.getItem('grammar_existing_project_id');

      let projectId: string;

      if (existingProjectId) {
        projectId = existingProjectId;
      } else {
        // Create new grammar project
        projectId = crypto.randomUUID();
        await db.projects.add({
          id: projectId,
          userId,
          title: projectName.trim(),
          projectType: 'grammar',
          sourceLabels: [],
          createdAt: new Date().toISOString(),
        });
      }

      // Save selected grammar patterns
      const selectedPatterns = patterns.filter((p) => p.selected);
      const grammarPatterns: GrammarPattern[] = selectedPatterns.map((p) => ({
        id: crypto.randomUUID(),
        projectId,
        patternName: p.patternName,
        patternNameEn: p.patternNameEn,
        originalSentence: p.originalSentence,
        explanation: p.explanation,
        structure: p.structure,
        example: p.example,
        exampleJa: p.exampleJa,
        level: p.level,
        quizQuestions: p.quizQuestions,
        createdAt: new Date().toISOString(),
        easeFactor: 2.5,
        intervalDays: 0,
        repetition: 0,
      }));

      await db.grammarPatterns.bulkAdd(grammarPatterns);

      // Clear sessionStorage
      sessionStorage.removeItem('grammar_extracted_patterns');
      sessionStorage.removeItem('grammar_existing_project_id');

      showToast({ message: `${selectedPatterns.length}件の文法パターンを保存しました`, type: 'success' });
      startTransition(() => { router.replace(`/grammar/${projectId}`); });
    } catch (error) {
      console.error('Grammar save error:', error);
      showToast({ message: '保存に失敗しました', type: 'error' });
      setSaving(false);
    }
  };

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const levelLabel = (level: string) => level === '1' ? '1級' : '準1級';

  return (
    <div className="min-h-screen bg-[var(--color-background)] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[var(--color-background)]/95 border-b border-[var(--color-border-light)]">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => { startTransition(() => { router.back(); }); }}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-[var(--color-surface-secondary)]"
          >
            <Icon name="arrow_back" size={22} />
          </button>
          <h1 className="text-lg font-bold text-[var(--color-foreground)]">文法パターン確認</h1>
          <div className="w-10" />
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 max-w-lg mx-auto px-4 py-4 w-full space-y-4">
        {/* Project name input */}
        <div>
          <label className="text-xs font-semibold text-[var(--color-muted)] mb-1 block">プロジェクト名</label>
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-foreground)] text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]"
            placeholder="文法プロジェクト名"
          />
        </div>

        {/* Pattern count */}
        <p className="text-sm text-[var(--color-muted)]">
          {patterns.length}件の文法パターンが見つかりました（{selectedCount}件選択中）
        </p>

        {/* Pattern list */}
        <div className="space-y-3">
          {patterns.map((pattern, index) => (
            <button
              key={index}
              onClick={() => handleToggle(index)}
              className={`w-full text-left card p-4 transition-all ${
                pattern.selected
                  ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                  : 'opacity-50'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                  pattern.selected
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary)]'
                    : 'border-[var(--color-border)]'
                }`}>
                  {pattern.selected && <Icon name="check" size={14} className="text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-bold text-[var(--color-foreground)] truncate">{pattern.patternName}</p>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      pattern.level === '1'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-blue-100 text-blue-700'
                    }`}>
                      {levelLabel(pattern.level)}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--color-muted)] mb-1">{pattern.patternNameEn}</p>
                  <p className="text-xs text-[var(--color-muted)] line-clamp-2">{pattern.explanation}</p>
                  <p className="text-xs text-[var(--color-primary)] mt-1">
                    問題 {pattern.quizQuestions.length}問
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </main>

      {/* Footer */}
      <div className="sticky bottom-0 bg-[var(--color-surface)] border-t border-[var(--color-border)] px-5 py-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <div className="max-w-lg mx-auto">
          <button
            onClick={handleSave}
            disabled={saving || selectedCount === 0}
            className="w-full py-3.5 rounded-xl bg-[var(--color-foreground)] text-white font-bold text-sm disabled:opacity-50 active:scale-[0.98] transition-transform"
          >
            {saving ? '保存中...' : `${selectedCount}件のパターンを保存`}
          </button>
        </div>
      </div>
    </div>
  );
}
