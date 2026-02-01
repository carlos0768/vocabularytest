/**
 * Stats Analytics Module
 *
 * 統計画面の詳細分析データを集計するモジュール。
 * LocalStorageのデータを元に学習推移・苦手ランキング・プロジェクト別統計・時間帯分析を行う。
 */

import { getActivityHistory, getWrongAnswers, type WrongAnswer, type DailyActivity } from '@/lib/utils';
import { getCachedProjects, getCachedProjectWords } from '@/lib/home-cache';

// ============ Types ============

export interface LearningTrendItem {
  date: string;       // YYYY-MM-DD
  label: string;      // M/D display format
  quizCount: number;
  correctCount: number;
  accuracy: number;    // 0-100
}

export interface WeakWordItem {
  wordId: string;
  projectId: string;
  english: string;
  japanese: string;
  wrongCount: number;
  lastWrongAt: number;
}

export interface ProjectStatsItem {
  projectId: string;
  title: string;
  totalWords: number;
  masteredWords: number;
  reviewWords: number;
  newWords: number;
  masteryRate: number; // 0-100
}

export interface StudyTimeSlot {
  hour: number;        // 0-23
  count: number;       // quiz count in this hour
  correctCount: number;
  accuracy: number;    // 0-100
}

// ============ Data Functions ============

/**
 * 過去N日間の日次学習推移データを取得する
 */
export function getLearningTrend(days: number = 30): LearningTrendItem[] {
  const weeksNeeded = Math.ceil(days / 7);
  const history = getActivityHistory(weeksNeeded + 1); // extra week for safety

  const today = new Date();
  const result: LearningTrendItem[] = [];

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const label = `${date.getMonth() + 1}/${date.getDate()}`;

    const activity = history.find(h => h.date === dateStr);
    const quizCount = activity?.quizCount ?? 0;
    const correctCount = activity?.correctCount ?? 0;
    const accuracy = quizCount > 0 ? Math.round((correctCount / quizCount) * 100) : 0;

    result.push({ date: dateStr, label, quizCount, correctCount, accuracy });
  }

  return result;
}

/**
 * 苦手単語ランキング（誤答回数の多い順）
 */
export function getWeakWordsRanking(limit: number = 10): WeakWordItem[] {
  const wrongAnswers = getWrongAnswers();

  return wrongAnswers
    .sort((a, b) => b.wrongCount - a.wrongCount)
    .slice(0, limit)
    .map((w: WrongAnswer) => ({
      wordId: w.wordId,
      projectId: w.projectId,
      english: w.english,
      japanese: w.japanese,
      wrongCount: w.wrongCount,
      lastWrongAt: w.lastWrongAt,
    }));
}

/**
 * プロジェクト別統計データを取得する（home-cacheから集計）
 */
export function getProjectStats(): ProjectStatsItem[] {
  const projects = getCachedProjects();
  const projectWords = getCachedProjectWords();

  return projects.map(project => {
    const words = projectWords[project.id] || [];
    const totalWords = words.length;
    const masteredWords = words.filter(w => w.status === 'mastered').length;
    const reviewWords = words.filter(w => w.status === 'review').length;
    const newWords = words.filter(w => w.status === 'new').length;
    const masteryRate = totalWords > 0 ? Math.round((masteredWords / totalWords) * 100) : 0;

    return {
      projectId: project.id,
      title: project.title,
      totalWords,
      masteredWords,
      reviewWords,
      newWords,
      masteryRate,
    };
  }).sort((a, b) => b.totalWords - a.totalWords);
}

/**
 * 時間帯別の学習分布データを取得する。
 * LocalStorageのactivity_historyには時間情報がないため、
 * 現在時刻で簡易推計する代わりに、専用のstudy_time_historyを参照する。
 */
export function getStudyTimeDistribution(): StudyTimeSlot[] {
  const slots: StudyTimeSlot[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    count: 0,
    correctCount: 0,
    accuracy: 0,
  }));

  if (typeof window === 'undefined') return slots;

  const stored = localStorage.getItem('scanvocab_study_time_history');
  if (stored) {
    try {
      const data: { hour: number; count: number; correctCount: number }[] = JSON.parse(stored);
      for (const entry of data) {
        if (entry.hour >= 0 && entry.hour < 24) {
          slots[entry.hour].count = entry.count;
          slots[entry.hour].correctCount = entry.correctCount;
          slots[entry.hour].accuracy = entry.count > 0
            ? Math.round((entry.correctCount / entry.count) * 100)
            : 0;
        }
      }
    } catch {
      // ignore
    }
  }

  return slots;
}

/**
 * クイズ回答時に時間帯データを記録する（recordCorrectAnswer/recordWrongAnswerから呼ぶ用）
 */
export function recordStudyTime(isCorrect: boolean): void {
  if (typeof window === 'undefined') return;

  const hour = new Date().getHours();
  const stored = localStorage.getItem('scanvocab_study_time_history');
  let data: { hour: number; count: number; correctCount: number }[] = [];

  if (stored) {
    try {
      data = JSON.parse(stored);
    } catch {
      data = [];
    }
  }

  // Ensure all 24 hours exist
  if (data.length !== 24) {
    data = Array.from({ length: 24 }, (_, h) => {
      const existing = data.find(d => d.hour === h);
      return existing || { hour: h, count: 0, correctCount: 0 };
    });
  }

  data[hour].count += 1;
  if (isCorrect) {
    data[hour].correctCount += 1;
  }

  localStorage.setItem('scanvocab_study_time_history', JSON.stringify(data));
}

/**
 * 週次の正答率推移を取得する（過去8週間）
 */
export function getWeeklyAccuracyTrend(): { weekLabel: string; accuracy: number; quizCount: number }[] {
  const history = getActivityHistory(9); // 9 weeks to cover 8 full weeks
  const weeks: Map<string, { correct: number; total: number }> = new Map();

  for (const day of history) {
    const date = new Date(day.date);
    // ISO week start (Monday)
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    const weekKey = weekStart.toISOString().split('T')[0];

    if (!weeks.has(weekKey)) {
      weeks.set(weekKey, { correct: 0, total: 0 });
    }
    const week = weeks.get(weekKey)!;
    week.total += day.quizCount;
    week.correct += day.correctCount;
  }

  return Array.from(weeks.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-8)
    .map(([key, val]) => {
      const date = new Date(key);
      return {
        weekLabel: `${date.getMonth() + 1}/${date.getDate()}`,
        accuracy: val.total > 0 ? Math.round((val.correct / val.total) * 100) : 0,
        quizCount: val.total,
      };
    });
}
