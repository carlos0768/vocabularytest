'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
import { shuffleArray, recordCorrectAnswer, recordWrongAnswer, recordActivity } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import type { Word, SentenceQuizQuestion, MultiFillInBlankQuestion as MultiFillInBlankQuestionType, SubscriptionStatus } from '@/types';

// 統合された問題タイプ
type QuizQuestion = SentenceQuizQuestion | MultiFillInBlankQuestionType;

const QUIZ_SIZE = 15; // 1回15問
const MIN_WORDS_REQUIRED = 10; // 最低10単語必要

export default function SentenceQuizPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const { subscription, loading: authLoading, user } = useAuth();
  const returnPath = searchParams.get('from');

  const backToProject = () => {
    router.push(returnPath || `/project/${projectId}`);
  };

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

  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const repository = useMemo(() => getRepository(subscriptionStatus), [subscriptionStatus]);

  // 問題を生成するAPI呼び出し
  const generateQuestions = useCallback(async (words: Word[]) => {
    setGenerating(true);
    setError(null);

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
      console.error('Failed to generate questions:', err);
      setError(err instanceof Error ? err.message : '問題の生成に失敗しました');
    } finally {
      setGenerating(false);
      setLoading(false);
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
        const words = await repository.getWords(projectId);
        if (words.length < MIN_WORDS_REQUIRED) {
          setError(`例文クイズには最低${MIN_WORDS_REQUIRED}単語が必要です（現在: ${words.length}単語）`);
          setLoading(false);
          return;
        }
        setAllWords(words);
        await generateQuestions(words);
      } catch (error) {
        console.error('Failed to load words:', error);
        router.push('/');
      }
    };

    loadWords();
  }, [projectId, repository, router, generateQuestions, authLoading, subscription?.status]);

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

    // ステータス更新
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

        if (newStatus !== word.status) {
          await repository.updateWord(word.id, { status: newStatus });
          // ローカル状態も更新
          setAllWords((prev) =>
            prev.map((w) =>
              w.id === word.id ? { ...w, status: newStatus } : w
            )
          );
        }
      }
    } catch (error) {
      console.error('Failed to update word status:', error);
    }

    // 次へ進む
    if (currentIndex + 1 >= questions.length) {
      setIsComplete(true);
    } else {
      setCurrentIndex((prev) => prev + 1);
    }
  };

  // 再スタート
  const handleRestart = async () => {
    setLoading(true);
    await generateQuestions(allWords);
  };

  // ホームへ
  const handleGoHome = () => {
    backToProject();
  };

  // ローディング
  if (loading || generating) {
    return <LoadingScreen words={allWords} />;
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
