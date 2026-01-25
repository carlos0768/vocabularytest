'use client';

import { motion } from 'framer-motion';
import { Check, X, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FeedbackPanelProps {
  isCorrect: boolean;
  correctAnswer: string;
  userAnswer?: string;
  explanation: string;
  grammarPoint?: string;
  className?: string;
}

export function FeedbackPanel({
  isCorrect,
  correctAnswer,
  userAnswer,
  explanation,
  grammarPoint,
  className,
}: FeedbackPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn('space-y-4', className)}
    >
      {/* Result card */}
      <div
        className={cn(
          'p-4 rounded-2xl border-2',
          isCorrect
            ? 'bg-emerald-50 border-emerald-200'
            : 'bg-red-50 border-red-200'
        )}
      >
        <div className="flex items-center gap-2 mb-2">
          {isCorrect ? (
            <>
              <div className="p-1 bg-emerald-500 rounded-full">
                <Check className="w-4 h-4 text-white" strokeWidth={3} />
              </div>
              <span className="font-semibold text-emerald-800">正解!</span>
            </>
          ) : (
            <>
              <div className="p-1 bg-red-500 rounded-full">
                <X className="w-4 h-4 text-white" strokeWidth={3} />
              </div>
              <span className="font-semibold text-red-800">不正解</span>
            </>
          )}
        </div>

        {!isCorrect && (
          <div className="space-y-2 mt-3">
            {userAnswer && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-500">あなたの回答:</span>
                <span className="text-sm font-medium text-red-700 line-through">
                  {userAnswer}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">正解:</span>
              <span className="text-sm font-medium text-emerald-700">
                {correctAnswer}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Explanation card */}
      <div className="p-4 rounded-2xl bg-blue-50 border-2 border-blue-200">
        <div className="flex items-center gap-2 mb-2">
          <Lightbulb className="w-5 h-5 text-blue-600" />
          <span className="font-semibold text-blue-800">解説</span>
        </div>
        <p className="text-sm text-blue-800 leading-relaxed">{explanation}</p>
        {grammarPoint && (
          <div className="mt-3 pt-3 border-t border-blue-200">
            <span className="text-xs text-blue-600 font-medium">
              ポイント: {grammarPoint}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
