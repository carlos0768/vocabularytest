'use client';

import { GeneratingProjectCard } from '@/components/project/GeneratingProjectCard';
import { ProgressSteps, type ProgressStep, Button } from '@/components/ui';

export function ProcessingModal({
  steps,
  onClose,
  generatingBook,
}: {
  steps: ProgressStep[];
  onClose?: () => void;
  /** While the full-screen modal is open, show the same “generating wordbook” preview as on Home. */
  generatingBook?: { title: string; iconDataUrl?: string };
}) {
  const hasError = steps.some((s) => s.status === 'error');

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card p-6 w-full max-w-sm animate-fade-in-up">
        <h2 className="text-lg font-bold mb-4 text-center text-[var(--color-foreground)]">
          {hasError ? 'エラーが発生しました' : '解析中'}
        </h2>
        {generatingBook && !hasError ? (
          <div className="mb-4 pointer-events-none">
            <GeneratingProjectCard title={generatingBook.title} iconDataUrl={generatingBook.iconDataUrl} />
          </div>
        ) : null}
        <ProgressSteps steps={steps} />
        {hasError && onClose && (
          <Button
            variant="secondary"
            onClick={onClose}
            className="mt-4 w-full"
          >
            閉じる
          </Button>
        )}
      </div>
    </div>
  );
}
