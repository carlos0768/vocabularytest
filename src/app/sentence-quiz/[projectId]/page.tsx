'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import {
  LoadingScreen,
  QuizProgress,
  FillInBlankQuestion,
  MultiFillInBlankQuestion,
  WordOrderQuestion,
  QuizResult,
} from '@/components/sentence-quiz';
import { getRepository } from '@/lib/db';
import { shuffleArray, recordCorrectAnswer, recordWrongAnswer, recordActivity, getGuestUserId } from '@/lib/utils';
import { calculateNextReview } from '@/lib/spaced-repetition';
import { useAuth } from '@/hooks/use-auth';
import type { Word, SentenceQuizQuestion, MultiFillInBlankQuestion as MultiFillInBlankQuestionType, SubscriptionStatus } from '@/types';

// 統合された問題タイプ
type QuizQuestion = SentenceQuizQuestion | MultiFillInBlankQuestionType;

const QUIZ_SIZE = 15; // 1回15問
const MIN_WORDS_REQUIRED = 10; // 最低10単語必要

// 進捗保存用の型
interface SentenceQuizProgress {
  questions: QuizQuestion[];
  currentIndex: number;
  results: { correct: number; total: number };
  savedAt: number;
}

// 進捗保存キー
const getProgressKey = (projectId: string, favoritesOnly: boolean) => 
  `sentence_quiz_progress_${projectId}${favoritesOnly ? '_favorites' : ''}`;

export default function SentenceQuizPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const { subscription, loading: authLoading, user } = useAuth();
  const returnPath = searchParams.get('from');
  const favoritesOnly = searchParams.get('favorites') === 'true';

  const [allWords, setAllWords] = useState<Word[]>([]);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<{ correct: number; total: number }>({
    correct: 0,
    total: 0,
  });
  const [isComplete, setIsComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasRestoredProgress = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // 進捗を保存
  const saveProgress = useCallback(() => {
    if (questions.length > 0 && !isComplete && currentIndex > 0) {
      const progress: SentenceQuizProgress = {
        questions,
        currentIndex,
        results,
        savedAt: Date.now(),
      };
      sessionStorage.setItem(getProgressKey(projectId, favoritesOnly), JSON.stringify(progress));
    }
  }, [questions, currentIndex, results, isComplete, projectId, favoritesOnly]);

  // 進捗をクリア
  const clearProgress = useCallback(() => {
    sessionStorage.removeItem(getProgressKey(projectId, favoritesOnly));
  }, [projectId, favoritesOnly]);

  // ホームに戻る（進捗を保存）
  const backToProject = () => {
    saveProgress();
    router.push(returnPath || `/project/${projectId}`);
  };

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const repository = useMemo(() => getRepository(subscriptionStatus), [subscriptionStatus]);

  // 生成をキャンセルしてホームに戻る
  const handleCancelGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    router.push(returnPath || `/project/${projectId}`);
  }, [router, returnPath, projectId]);

  // 問題を生成するAPI呼び出し
  const generateQuestions = useCallback(async (words: Word[]) => {
    setGenerating(true);
    setError(null);

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      // 15単語を選択（単語数が15未満なら重複して15問分作る）
      let selectedWords: Word[] = [];

      if (words.length >= QUIZ_SIZE) {
        // 単語が15以上ある場合はランダムに15個選択
        selectedWords = shuffleArray(words).slice(0, QUIZ_SIZE);
      } else {
        // 単語が15未満の場合は重複して15問分作る
        const shuffled = shuffleArray(words);
        while (selectedWords.length < QUIZ_SIZE) {
          selectedWords.push(...shuffled);
        }
        selectedWords = selectedWords.slice(0, QUIZ_SIZE);
        // 最終的にシャッフルして順番をランダムに
        selectedWords = shuffleArray(selectedWords);
      }

      const response = await fetch('/api/sentence-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          words: selectedWords.map((w) => ({
            id: w.id,
            english: w.english,
            japanese: w.japanese,
            status: w.status,
          })),
        }),
        signal: abortControllerRef.current.signal,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || '問題の生成に失敗しました');
      }

      setQuestions(data.questions);
      setCurrentIndex(0);
      setResults({ correct: 0, total: 0 });
      setIsComplete(false);
    } catch (err) {
      // Ignore abort errors
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('Generation cancelled by user');
        return;
      }
      console.error('Failed to generate questions:', err);
      setError(err instanceof Error ? err.message : '問題の生成に失敗しました');
    } finally {
      setGenerating(false);
      setLoading(false);
      abortControllerRef.current = null;
    }
  }, []);

  // 初期ロード
  useEffect(() => {
    if (authLoading) return;

    // Pro限定チェック
    if (subscription?.status !== 'active') {
      router.push('/');
      return;
    }

    const loadWords = async () => {
      try {
        let words: Word[];

        if (projectId === 'all' && favoritesOnly) {
          // 全プロジェクト横断でお気に入り単語を取得
          const userId = subscription?.status === 'active' && user ? user.id : getGuestUserId();
          const projects = await repository.getProjects(userId);
          const allWords = await Promise.all(projects.map(p => repository.getWords(p.id)));
          words = allWords.flat().filter(w => w.isFavorite);
        } else {
          words = await repository.getWords(projectId);
          if (favoritesOnly) {
            words = words.filter(w => w.isFavorite);
          }
        }
        
        if (words.length < MIN_WORDS_REQUIRED) {
          const label = favoritesOnly ? '苦手単語' : '単語';
          setError(`例文クイズには最低${MIN_WORDS_REQUIRED}${label}が必要です（現在: ${words.length}${label}）`);
          setLoading(false);
          return;
        }
        setAllWords(words);

        // 保存された進捗があるか確認（1時間以内のみ有効）
        if (!hasRestoredProgress.current) {
          hasRestoredProgress.current = true;
          const savedProgressStr = sessionStorage.getItem(getProgressKey(projectId, favoritesOnly));
          if (savedProgressStr) {
            try {
              const savedProgress: SentenceQuizProgress = JSON.parse(savedProgressStr);
              const oneHourAgo = Date.now() - 60 * 60 * 1000;
              if (savedProgress.savedAt > oneHourAgo && savedProgress.questions.length > 0) {
                // 進捗を復元
                setQuestions(savedProgress.questions);
                setCurrentIndex(savedProgress.currentIndex);
                setResults(savedProgress.results);
                setLoading(false);
                setGenerating(false);
                return;
              }
            } catch (e) {
              console.error('Failed to restore progress:', e);
            }
            // 無効な進捗はクリア
            sessionStorage.removeItem(getProgressKey(projectId, favoritesOnly));
          }
        }

        await generateQuestions(words);
      } catch (error) {
        console.error('Failed to load words:', error);
        router.push('/');
      }
    };

    loadWords();
  }, [projectId, repository, router, generateQuestions, authLoading, subscription?.status, favoritesOnly]);

  // 回答処理
  const handleAnswer = async (isCorrect: boolean) => {
    const currentQuestion = questions[currentIndex];

    // 結果を更新
    setResults((prev) => ({
      correct: prev.correct + (isCorrect ? 1 : 0),
      total: prev.total + 1,
    }));

    // 統計記録
    if (isCorrect) {
      recordCorrectAnswer(false);
    } else {
      recordWrongAnswer(
        currentQuestion.wordId,
        currentQuestion.targetWord,
        currentQuestion.japaneseMeaning,
        projectId,
        [] // 例文クイズにはdistractorsがない
      );
    }
    recordActivity();

    // ステータス更新 & スペースド・リピティション更新
    try {
      const word = allWords.find((w) => w.id === currentQuestion.wordId);
      if (word) {
        let newStatus = word.status;
        if (isCorrect) {
          if (word.status === 'new') newStatus = 'review';
          else if (word.status === 'review') newStatus = 'mastered';
        } else {
          if (word.status === 'mastered') newStatus = 'review';
          else if (word.status === 'review') newStatus = 'new';
        }

        // Calculate spaced repetition update using SM-2 algorithm
        const srUpdate = calculateNextReview(isCorrect, word);

        // Combine status and spaced repetition updates
        const updates = { status: newStatus, ...srUpdate };
        await repository.updateWord(word.id, updates);

        // ローカル状態も更新
        setAllWords((prev) =>
          prev.map((w) =>
            w.id === word.id ? { ...w, ...updates } : w
          )
        );
      }
    } catch (error) {
      console.error('Failed to update word status:', error);
    }

    // 次へ進む
    if (currentIndex + 1 >= questions.length) {
      setIsComplete(true);
      clearProgress(); // クイズ完了時に進捗をクリア
    } else {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  // 再スタート
  const handleRestart = async () => {
    clearProgress(); // 再スタート時に進捗をクリア
    setLoading(true);
    await generateQuestions(allWords);
  };

  // ホームへ
  const handleGoHome = () => {
    backToProject();
  };

  // ローディング
  if (loading || generating) {
    return <LoadingScreen words={allWords} onCancel={handleCancelGeneration} />;
  }

  // エラー
  if (error) {
    const canRetry = allWords.length >= MIN_WORDS_REQUIRED;
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--color-background)] p-6">
        <div className="text-center max-w-sm">
          <p className="text-[var(--color-error)] mb-6">{error}</p>
          <div className="space-y-3">
            {canRetry && (
              <button
                onClick={() => generateQuestions(allWords)}
                className="w-full px-4 py-2 bg-[var(--color-primary)] text-white rounded-xl hover:bg-[var(--color-primary-dark)]"
              >
                再試行
              </button>
            )}
            <button
              onClick={handleGoHome}
              className="w-full px-4 py-2 bg-[var(--color-border-light)] text-[var(--color-foreground)] rounded-xl hover:bg-[var(--color-border)]"
            >
              ホームに戻る
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 完了画面
  if (isComplete) {
    return (
      <QuizResult
        correct={results.correct}
        total={results.total}
        onRestart={handleRestart}
        onGoHome={handleGoHome}
      />
    );
  }

  // 問題がない場合
  if (questions.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center bg-[var(--color-background)]">
        <p className="text-[var(--color-muted)]">問題がありません</p>
      </div>
    );
  }

  const currentQuestion = questions[currentIndex];

  return (
    <div className="h-[100dvh] flex flex-col bg-[var(--color-background)] overflow-hidden fixed inset-0 touch-none">
      <QuizProgress
        currentIndex={currentIndex}
        total={questions.length}
        onClose={handleGoHome}
      />

      <main className="flex-1 flex flex-col px-4 pb-4 min-h-0">
        {currentQuestion.type === 'multi-fill-in-blank' ? (
          <MultiFillInBlankQuestion
            question={currentQuestion}
            onAnswer={handleAnswer}
          />
        ) : currentQuestion.type === 'fill-in-blank' ? (
          <FillInBlankQuestion
            question={currentQuestion}
            onAnswer={handleAnswer}
          />
        ) : (
          <WordOrderQuestion
            question={currentQuestion}
            onAnswer={handleAnswer}
          />
        )}
      </main>
    </div>
  );
}
