'use client';

import { useState, useEffect, useCallback, useTransition } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Icon, useToast } from '@/components/ui';
import { getDb } from '@/lib/db/dexie';
import { GrammarDrillProgress } from '@/components/grammar/GrammarDrillProgress';
import { GrammarRuleCard } from '@/components/grammar/GrammarRuleCard';
import { GrammarExplanationPeek } from '@/components/grammar/GrammarExplanationPeek';
import { GrammarQuizDispatcher } from '@/components/grammar/GrammarQuizDispatcher';
import { GrammarDrillResult } from '@/components/grammar/GrammarDrillResult';
import type { GrammarPattern } from '@/types';

type DrillPhase = 'rule' | 'quiz' | 'complete';

interface PatternResult {
  pattern: GrammarPattern;
  correct: number;
  total: number;
}

export default function GrammarDrillPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;
  const [, startTransition] = useTransition();
  const { showToast } = useToast();

  const [patterns, setPatterns] = useState<GrammarPattern[]>([]);
  const [loading, setLoading] = useState(true);

  // Drill state
  const [currentPatternIndex, setCurrentPatternIndex] = useState(0);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [phase, setPhase] = useState<DrillPhase>('rule');
  const [answered, setAnswered] = useState(false);

  // Results tracking
  const [patternResults, setPatternResults] = useState<Record<string, { correct: number; total: number }>>({});

  // Load patterns
  useEffect(() => {
    async function load() {
      try {
        const db = getDb();
        const patternList = await db.grammarPatterns.where('projectId').equals(projectId).toArray();
        patternList.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        if (patternList.length === 0) {
          showToast({ message: '文法パターンがありません', type: 'error' });
          startTransition(() => { router.replace(`/grammar/${projectId}`); });
          return;
        }

        setPatterns(patternList);
      } catch (e) {
        console.error('Failed to load grammar patterns:', e);
        showToast({ message: '読み込みに失敗しました', type: 'error' });
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [projectId, router, showToast, startTransition]);

  const currentPattern = patterns[currentPatternIndex];
  const currentQuiz = currentPattern?.quizQuestions?.[currentQuizIndex];

  const handleStartQuiz = useCallback(() => {
    setPhase('quiz');
    setCurrentQuizIndex(0);
    setAnswered(false);
  }, []);

  const handleAnswer = useCallback((isCorrect: boolean) => {
    if (!currentPattern) return;
    setAnswered(true);

    // Track result for this pattern
    setPatternResults((prev) => {
      const existing = prev[currentPattern.id] || { correct: 0, total: 0 };
      return {
        ...prev,
        [currentPattern.id]: {
          correct: existing.correct + (isCorrect ? 1 : 0),
          total: existing.total + 1,
        },
      };
    });
  }, [currentPattern]);

  const handleNext = useCallback(() => {
    if (!currentPattern) return;

    const quizCount = currentPattern.quizQuestions?.length ?? 0;

    if (currentQuizIndex < quizCount - 1) {
      // More quiz questions for this pattern
      setCurrentQuizIndex((prev) => prev + 1);
      setAnswered(false);
    } else if (currentPatternIndex < patterns.length - 1) {
      // Move to next pattern
      setCurrentPatternIndex((prev) => prev + 1);
      setCurrentQuizIndex(0);
      setPhase('rule');
      setAnswered(false);
    } else {
      // All done
      setPhase('complete');
      // Update spaced repetition for all patterns
      updatePatternSR();
    }
  }, [currentPattern, currentPatternIndex, currentQuizIndex, patterns.length]);

  const updatePatternSR = useCallback(async () => {
    try {
      const db = getDb();
      for (const pattern of patterns) {
        const result = patternResults[pattern.id];
        if (!result) continue;

        const allCorrect = result.correct === result.total;
        const newRepetition = allCorrect ? pattern.repetition + 1 : 0;
        const newEaseFactor = allCorrect
          ? Math.max(1.3, pattern.easeFactor + 0.1)
          : Math.max(1.3, pattern.easeFactor - 0.2);
        const newInterval = allCorrect
          ? newRepetition <= 1 ? 1 : newRepetition === 2 ? 6 : Math.round(pattern.intervalDays * newEaseFactor)
          : 0;

        await db.grammarPatterns.update(pattern.id, {
          repetition: newRepetition,
          easeFactor: newEaseFactor,
          intervalDays: newInterval,
          lastReviewedAt: new Date().toISOString(),
          nextReviewAt: new Date(Date.now() + newInterval * 86400000).toISOString(),
        });
      }
    } catch (e) {
      console.error('Failed to update SR:', e);
    }
  }, [patterns, patternResults]);

  const handleRetry = useCallback(() => {
    setCurrentPatternIndex(0);
    setCurrentQuizIndex(0);
    setPhase('rule');
    setAnswered(false);
    setPatternResults({});
  }, []);

  const handleHome = useCallback(() => {
    startTransition(() => { router.replace('/'); });
  }, [router, startTransition]);

  const handleClose = useCallback(() => {
    startTransition(() => { router.back(); });
  }, [router, startTransition]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (patterns.length === 0) return null;

  // Results view
  if (phase === 'complete') {
    const results: PatternResult[] = patterns.map((pattern) => ({
      pattern,
      correct: patternResults[pattern.id]?.correct ?? 0,
      total: patternResults[pattern.id]?.total ?? 0,
    }));

    return (
      <div className="min-h-screen bg-[var(--color-background)] flex flex-col">
        <GrammarDrillProgress current={patterns.length} total={patterns.length} onClose={handleClose} />
        <GrammarDrillResult results={results} onRetry={handleRetry} onHome={handleHome} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-background)] flex flex-col">
      {/* Progress header */}
      <GrammarDrillProgress
        current={currentPatternIndex + (phase === 'quiz' ? 1 : 0)}
        total={patterns.length}
        onClose={handleClose}
      />

      {/* Rule Card */}
      {phase === 'rule' && currentPattern && (
        <GrammarRuleCard pattern={currentPattern} onStartQuiz={handleStartQuiz} />
      )}

      {/* Quiz */}
      {phase === 'quiz' && currentPattern && currentQuiz && (
        <div className="flex-1 flex flex-col">
          {/* Explanation peek */}
          <GrammarExplanationPeek pattern={currentPattern} />

          {/* Quiz question */}
          <div className="flex-1">
            <GrammarQuizDispatcher
              key={`${currentPatternIndex}-${currentQuizIndex}`}
              question={currentQuiz}
              onAnswer={handleAnswer}
            />
          </div>

          {/* Next button */}
          {answered && (
            <div className="px-5 py-4 animate-fade-in" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
              <button
                onClick={handleNext}
                className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-[var(--color-foreground)] text-white font-bold text-base active:scale-[0.98] transition-transform"
              >
                {currentPatternIndex === patterns.length - 1 && currentQuizIndex === (currentPattern.quizQuestions?.length ?? 1) - 1
                  ? '結果を見る'
                  : currentQuizIndex < (currentPattern.quizQuestions?.length ?? 1) - 1
                  ? '次の問題'
                  : '次の文法'
                }
                <Icon name="arrow_forward" size={20} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
