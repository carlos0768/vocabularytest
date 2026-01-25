'use client';

import { cn } from '@/lib/utils';

interface QuestionDisplayProps {
  question: string;
  questionJa?: string;
  className?: string;
}

export function QuestionDisplay({
  question,
  questionJa,
  className,
}: QuestionDisplayProps) {
  // Highlight blanks (_____)
  const highlightedQuestion = question.replace(
    /_____/g,
    '<span class="inline-block min-w-[60px] border-b-2 border-emerald-400 text-emerald-600 font-semibold">_____</span>'
  );

  return (
    <div className={cn('space-y-2', className)}>
      <p
        className="text-lg font-medium text-gray-900 leading-relaxed"
        dangerouslySetInnerHTML={{ __html: highlightedQuestion }}
      />
      {questionJa && (
        <p className="text-sm text-gray-500">{questionJa}</p>
      )}
    </div>
  );
}
