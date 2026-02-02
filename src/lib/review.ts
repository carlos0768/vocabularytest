/**
 * Today's Review Module
 * 
 * SM-2アルゴリズムに基づき、今日復習すべき単語を管理するモジュール。
 */

import { getRepository } from '@/lib/db';
import { getCachedProjects, getCachedProjectWords } from '@/lib/home-cache';
import type { Word } from '@/types';

export interface ReviewWord {
  word: Word;
  projectId: string;
  projectName: string;
  daysOverdue: number;  // 何日遅れているか（0 = 今日が予定日）
}

/**
 * 単語が復習予定日を過ぎているかチェック
 */
export function isReviewDue(word: Word): boolean {
  if (!word.nextReviewAt) return false;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const nextReview = new Date(word.nextReviewAt);
  nextReview.setHours(0, 0, 0, 0);
  
  return nextReview <= today;
}

/**
 * 単語が何日遅れているか計算
 */
export function getDaysOverdue(word: Word): number {
  if (!word.nextReviewAt) return 0;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const nextReview = new Date(word.nextReviewAt);
  nextReview.setHours(0, 0, 0, 0);
  
  const diffTime = today.getTime() - nextReview.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  return Math.max(0, diffDays);
}

/**
 * 今日の復習単語を全プロジェクトから収集
 */
export function getTodayReviewWords(): ReviewWord[] {
  const projects = getCachedProjects();
  const projectWords = getCachedProjectWords();
  
  const reviewWords: ReviewWord[] = [];
  
  for (const project of projects) {
    const words = projectWords[project.id] || [];
    
    for (const word of words) {
      if (isReviewDue(word)) {
        reviewWords.push({
          word,
          projectId: project.id,
          projectName: project.title,
          daysOverdue: getDaysOverdue(word),
        });
      }
    }
  }
  
  // ソート: 遅れている日数が多い順 → 次にeaseFactorが低い順（難しい単語優先）
  return reviewWords.sort((a, b) => {
    // 1. 遅れ日数で降順
    if (b.daysOverdue !== a.daysOverdue) {
      return b.daysOverdue - a.daysOverdue;
    }
    // 2. easeFactorで昇順（低い方が難しい）
    const aEase = a.word.easeFactor ?? 2.5;
    const bEase = b.word.easeFactor ?? 2.5;
    return aEase - bEase;
  });
}

/**
 * 今日の復習単語数を取得
 */
export function getTodayReviewCount(): number {
  return getTodayReviewWords().length;
}

/**
 * 復習完了後のSM-2パラメータ更新
 * 
 * @param word 更新する単語
 * @param quality 回答品質 (0-5)
 *   5 = 完璧、4 = 正解だが少し迷った、3 = 正解だけど難しかった、
 *   2 = 不正解だけで正解を思い出した、1 = 不正解、0 = 全くわからなかった
 */
export function updateSM2Parameters(word: Word, quality: number): Partial<Word> {
  // 現在の値（デフォルト値を設定）
  let easeFactor = word.easeFactor ?? 2.5;
  let intervalDays = word.intervalDays ?? 0;
  let repetition = word.repetition ?? 0;
  
  // easeFactor更新（最低1.3）
  easeFactor = Math.max(1.3, easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  
  if (quality < 3) {
    // 間違えた場合: リピテーションリセット、間隔を1日に
    repetition = 0;
    intervalDays = 1;
  } else {
    // 正解した場合
    repetition += 1;
    
    if (repetition === 1) {
      intervalDays = 1;
    } else if (repetition === 2) {
      intervalDays = 6;
    } else {
      intervalDays = Math.round(intervalDays * easeFactor);
    }
  }
  
  const now = new Date();
  const nextReviewAt = new Date(now);
  nextReviewAt.setDate(now.getDate() + intervalDays);
  
  return {
    easeFactor,
    intervalDays,
    repetition,
    lastReviewedAt: now.toISOString(),
    nextReviewAt: nextReviewAt.toISOString(),
    status: quality >= 3 ? 'mastered' : 'review',
  };
}

/**
 * リモートリポジトリ用: 復習単語を直接取得（キャッシュがない場合）
 */
export async function fetchTodayReviewWords(userId: string): Promise<ReviewWord[]> {
  const repository = getRepository('active');
  const projects = await repository.getProjects(userId);
  
  const reviewWords: ReviewWord[] = [];
  
  for (const project of projects) {
    const words = await repository.getWords(project.id);
    
    for (const word of words) {
      if (isReviewDue(word)) {
        reviewWords.push({
          word,
          projectId: project.id,
          projectName: project.title,
          daysOverdue: getDaysOverdue(word),
        });
      }
    }
  }
  
  return reviewWords.sort((a, b) => {
    if (b.daysOverdue !== a.daysOverdue) {
      return b.daysOverdue - a.daysOverdue;
    }
    const aEase = a.word.easeFactor ?? 2.5;
    const bEase = b.word.easeFactor ?? 2.5;
    return aEase - bEase;
  });
}
