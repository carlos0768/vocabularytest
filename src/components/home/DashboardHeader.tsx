'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Flame, BookOpen, ChevronRight, Sparkles } from 'lucide-react';
import type { Word, Project } from '@/types';

interface DashboardHeaderProps {
  isPro: boolean;
  streakDays: number;
  todayProgress: number; // 0-100
  wordsToReview: number;
  recentProjects: Project[];
  onStartReview: () => void;
  onViewAllProjects: () => void;
}

export function DashboardHeader({
  isPro,
  streakDays,
  todayProgress,
  wordsToReview,
  recentProjects,
  onStartReview,
  onViewAllProjects,
}: DashboardHeaderProps) {
  return (
    <div className="space-y-4">
      {/* Streak Card */}
      <div className="card p-4 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/30 dark:to-amber-950/30 border-orange-200 dark:border-orange-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-orange-400 to-red-500 rounded-full flex items-center justify-center">
              <Flame className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-sm text-orange-600 dark:text-orange-400 font-medium">連続学習</p>
              <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">{streakDays}日目!</p>
            </div>
          </div>
          {isPro && (
            <span className="chip chip-pro">
              <Sparkles className="w-3 h-3" />
              Pro
            </span>
          )}
        </div>
        {/* Today's progress bar */}
        <div className="mt-3">
          <div className="flex justify-between text-xs text-orange-600 dark:text-orange-400 mb-1">
            <span>今日の進捗</span>
            <span>{todayProgress}%</span>
          </div>
          <div className="h-2 bg-orange-200 dark:bg-orange-900 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-orange-400 to-red-500 transition-all duration-500"
              style={{ width: `${todayProgress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Today's Review Card */}
      {wordsToReview > 0 && (
        <button
          onClick={onStartReview}
          className="card p-4 w-full text-left hover:shadow-md transition-shadow group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/50 rounded-xl flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="font-semibold text-[var(--color-foreground)]">今日の復習</p>
                <p className="text-sm text-[var(--color-muted)]">{wordsToReview}単語が復習時期です</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-[var(--color-muted)] group-hover:text-[var(--color-primary)] transition-colors" />
          </div>
        </button>
      )}

      {/* Recent Projects */}
      {recentProjects.length > 0 && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-[var(--color-foreground)]">最近のプロジェクト</h3>
            <button
              onClick={onViewAllProjects}
              className="text-sm text-[var(--color-primary)] hover:underline"
            >
              すべて見る
            </button>
          </div>
          <div className="space-y-2">
            {recentProjects.slice(0, 3).map((project) => (
              <Link
                key={project.id}
                href={`/project/${project.id}`}
                className="flex items-center justify-between p-2 rounded-lg hover:bg-[var(--color-peach-light)] transition-colors"
              >
                <span className="text-[var(--color-foreground)] truncate">{project.title}</span>
                <ChevronRight className="w-4 h-4 text-[var(--color-muted)]" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface StreakData {
  currentStreak: number;
  todayCompleted: boolean;
  todayQuizCount: number;
  todayCorrectCount: number;
}

/**
 * Calculate streak from quiz activity data
 * This is a placeholder - actual implementation would use stored quiz results
 */
export function useStreakData(words: Word[]): StreakData {
  return useMemo(() => {
    // For now, return mock data
    // TODO: Implement actual streak tracking using quiz results stored in localStorage/Supabase
    const today = new Date().toDateString();
    
    // Check if any words were reviewed today
    const reviewedToday = words.filter(w => {
      if (!w.lastReviewedAt) return false;
      return new Date(w.lastReviewedAt).toDateString() === today;
    });

    return {
      currentStreak: reviewedToday.length > 0 ? 1 : 0, // Placeholder
      todayCompleted: reviewedToday.length >= 10,
      todayQuizCount: reviewedToday.length,
      todayCorrectCount: reviewedToday.filter(w => w.status === 'mastered').length,
    };
  }, [words]);
}

/**
 * Get words that are due for review based on spaced repetition
 */
export function useWordsToReview(words: Word[]): Word[] {
  return useMemo(() => {
    const now = new Date();
    return words.filter(w => {
      if (!w.nextReviewAt) return w.status === 'new'; // New words are always reviewable
      return new Date(w.nextReviewAt) <= now;
    });
  }, [words]);
}
