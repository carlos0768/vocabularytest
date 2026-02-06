'use client';

import { Icon } from './Icon';
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
            step.status === 'active' && 'bg-[var(--color-primary-light)]',
            step.status === 'complete' && 'bg-[var(--color-success-light)]',
            step.status === 'error' && 'bg-[var(--color-error-light)]',
            step.status === 'pending' && 'opacity-50'
          )}
        >
          {/* Status icon */}
          <div className="flex-shrink-0">
            {step.status === 'active' && (
              <Icon name="progress_activity" size={20} className="text-[var(--color-primary)] animate-spin" />
            )}
            {step.status === 'complete' && (
              <Icon name="check_circle" size={20} className="text-[var(--color-success)]" />
            )}
            {step.status === 'pending' && (
              <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
            )}
            {step.status === 'error' && (
              <div className="w-5 h-5 rounded-full bg-[var(--color-error)] flex items-center justify-center">
                <span className="text-white text-xs font-bold">!</span>
              </div>
            )}
          </div>

          {/* Label */}
          <span
            className={cn(
              'text-sm font-medium',
              step.status === 'active' && 'text-[var(--color-primary-dark)]',
              step.status === 'complete' && 'text-[var(--color-success)]',
              step.status === 'error' && 'text-[var(--color-error)]',
              step.status === 'pending' && 'text-[var(--color-muted)]'
            )}
          >
            {step.label}
          </span>
        </div>
      ))}
    </div>
  );
}
