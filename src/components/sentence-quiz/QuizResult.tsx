'use client';

import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/button';

interface QuizResultProps {
  correct: number;
  total: number;
  onRestart: () => void;
  onGoHome: () => void;
}

export function QuizResult({ correct, total, onRestart, onGoHome }: QuizResultProps) {
  const percentage = Math.round((correct / total) * 100);

  return (
    <div className="h-screen flex flex-col bg-[var(--color-background)] overflow-hidden">
      {/* Results */}
      <main className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="card p-8 w-full max-w-sm text-center">
          <div className="w-20 h-20 bg-[var(--color-success-light)] rounded-full flex items-center justify-center mx-auto mb-6">
            <Icon name="emoji_events" size={40} className="text-[var(--color-success)]" />
          </div>

          <h1 className="text-2xl font-bold text-[var(--color-foreground)] mb-2">
            例文クイズ完了！
          </h1>

          <div className="mb-6">
            <p className="text-5xl font-bold text-[var(--color-primary)] mb-1">
              {percentage}%
            </p>
            <p className="text-[var(--color-muted)]">
              {total}問中 {correct}問正解
            </p>
          </div>

          {/* Performance message */}
          <p className="text-[var(--color-muted)] mb-8">
            {percentage === 100
              ? 'パーフェクト！素晴らしい！'
              : percentage >= 80
              ? 'よくできました！'
              : percentage >= 60
              ? 'もう少し！復習しましょう'
              : '繰り返し練習しましょう！'}
          </p>

          <div className="space-y-3">
            <Button
              onClick={onRestart}
              className="w-full bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)]"
              size="lg"
            >
              <Icon name="refresh" size={20} className="mr-2" />
              もう一度
            </Button>
            <Button
              variant="secondary"
              onClick={onGoHome}
              className="w-full"
              size="lg"
            >
              <Icon name="home" size={20} className="mr-2" />
              ホームに戻る
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
