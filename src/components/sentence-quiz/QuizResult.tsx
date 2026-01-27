'use client';

import { Trophy, RotateCcw, Home } from 'lucide-react';
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
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      {/* Results */}
      <main className="flex-1 flex flex-col items-center justify-center p-6">
        <div className="bg-white rounded-3xl shadow-lg p-8 w-full max-w-sm text-center">
          <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Trophy className="w-10 h-10 text-purple-600" />
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            例文クイズ完了！
          </h1>

          <div className="mb-6">
            <p className="text-5xl font-bold text-purple-600 mb-1">
              {percentage}%
            </p>
            <p className="text-gray-500">
              {total}問中 {correct}問正解
            </p>
          </div>

          {/* Performance message */}
          <p className="text-gray-600 mb-8">
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
              className="w-full bg-purple-600 hover:bg-purple-700"
              size="lg"
            >
              <RotateCcw className="w-5 h-5 mr-2" />
              もう一度
            </Button>
            <Button
              variant="secondary"
              onClick={onGoHome}
              className="w-full"
              size="lg"
            >
              <Home className="w-5 h-5 mr-2" />
              ホームに戻る
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
