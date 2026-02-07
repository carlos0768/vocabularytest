'use client';

import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/button';
import type { ScanJob } from '@/hooks/use-scan-jobs';

interface ScanJobNotificationProps {
  job: ScanJob;
  onDismiss: () => void;
}

export function ScanJobNotification({ job, onDismiss }: ScanJobNotificationProps) {
  const router = useRouter();

  const result = job.result ? JSON.parse(job.result) : null;
  const wordCount = result?.wordCount || 0;

  const handleView = () => {
    if (job.project_id) {
      router.push(`/project/${job.project_id}`);
    }
    onDismiss();
  };

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 animate-slide-up lg:left-auto lg:right-6 lg:bottom-6 lg:w-96">
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-lg p-4">
        <div className="flex items-start gap-3">
          {/* Success icon */}
          <div className="w-10 h-10 rounded-full bg-[var(--color-success-light)] flex items-center justify-center flex-shrink-0">
            <Icon name="check_circle" size={24} className="text-[var(--color-success)]" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-[var(--color-foreground)] mb-1">
              スキャン完了！
            </h3>
            <p className="text-sm text-[var(--color-muted)] mb-3">
              「{job.project_title}」に{wordCount}語追加されました
            </p>

            {/* Actions */}
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={handleView}
                className="flex-1"
              >
                確認する
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={onDismiss}
              >
                閉じる
              </Button>
            </div>
          </div>

          {/* Close button */}
          <button
            onClick={onDismiss}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-[var(--color-muted)]"
          >
            <Icon name="close" size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}

// Container for multiple notifications
interface ScanJobNotificationsProps {
  jobs: ScanJob[];
  onDismiss: (jobId: string) => void;
}

export function ScanJobNotifications({ jobs, onDismiss }: ScanJobNotificationsProps) {
  if (jobs.length === 0) return null;

  // Show only the most recent completed job
  const latestJob = jobs[0];

  return (
    <ScanJobNotification
      job={latestJob}
      onDismiss={() => onDismiss(latestJob.id)}
    />
  );
}
