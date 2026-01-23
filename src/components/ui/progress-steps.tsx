'use client';

import { CheckCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ProgressStep {
  id: string;
  label: string;
  status: 'pending' | 'active' | 'complete' | 'error';
}

interface ProgressStepsProps {
  steps: ProgressStep[];
  className?: string;
}

// Progress steps component for showing AI processing status
// Displays: "文字を解析中..." → "問題を作成中..." → "誤答を生成中..."
export function ProgressSteps({ steps, className }: ProgressStepsProps) {
  return (
    <div className={cn('space-y-3', className)}>
      {steps.map((step) => (
        <div
          key={step.id}
          className={cn(
            'flex items-center gap-3 p-3 rounded-xl transition-all duration-300',
            step.status === 'active' && 'bg-blue-50',
            step.status === 'complete' && 'bg-green-50',
            step.status === 'error' && 'bg-red-50',
            step.status === 'pending' && 'opacity-50'
          )}
        >
          {/* Status icon */}
          <div className="flex-shrink-0">
            {step.status === 'active' && (
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
            )}
            {step.status === 'complete' && (
              <CheckCircle className="w-5 h-5 text-green-600" />
            )}
            {step.status === 'pending' && (
              <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
            )}
            {step.status === 'error' && (
              <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
                <span className="text-white text-xs font-bold">!</span>
              </div>
            )}
          </div>

          {/* Label */}
          <span
            className={cn(
              'text-sm font-medium',
              step.status === 'active' && 'text-blue-700',
              step.status === 'complete' && 'text-green-700',
              step.status === 'error' && 'text-red-700',
              step.status === 'pending' && 'text-gray-500'
            )}
          >
            {step.label}
          </span>
        </div>
      ))}
    </div>
  );
}
