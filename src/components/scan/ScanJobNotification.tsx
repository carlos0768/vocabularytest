'use client';

import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/button';
import type { ScanJob } from '@/hooks/use-scan-jobs';

/** Aggregated notification for a single project (may represent multiple scan jobs) */
interface AggregatedNotification {
  projectId: string | null;
  projectTitle: string;
  totalWordCount: number;
  jobIds: string[];
  /** True only when every job in this project group is completed */
  allComplete: boolean;
}

interface ScanJobNotificationProps {
  notification: AggregatedNotification;
  onDismiss: () => void;
}

export function ScanJobNotification({ notification, onDismiss }: ScanJobNotificationProps) {
  const router = useRouter();

  const handleView = () => {
    if (notification.projectId) {
      router.push(`/project/${notification.projectId}`);
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
              「{notification.projectTitle}」に{notification.totalWordCount}語追加されました
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

// Container for multiple notifications — aggregates by project
interface ScanJobNotificationsProps {
  jobs: ScanJob[];
  onDismiss: (jobId: string) => void;
}

/**
 * Groups completed jobs by project and shows a single notification
 * per project with the aggregated word count.
 * Only shows when ALL jobs for a project are completed (no pending/processing).
 */
export function ScanJobNotifications({ jobs, onDismiss }: ScanJobNotificationsProps) {
  if (jobs.length === 0) return null;

  // Group jobs by project_id (or project_title as fallback key)
  const groupMap = new Map<string, AggregatedNotification>();
  for (const job of jobs) {
    const key = job.project_id || job.project_title || 'unknown';
    const existing = groupMap.get(key);
    const result = job.result ? JSON.parse(job.result) : null;
    const wordCount = result?.wordCount || 0;

    if (existing) {
      existing.totalWordCount += wordCount;
      existing.jobIds.push(job.id);
      if (job.status !== 'completed') existing.allComplete = false;
    } else {
      groupMap.set(key, {
        projectId: job.project_id,
        projectTitle: job.project_title,
        totalWordCount: wordCount,
        jobIds: [job.id],
        allComplete: job.status === 'completed',
      });
    }
  }

  // Only show notifications for groups where all jobs are complete
  const readyNotifications = Array.from(groupMap.values()).filter(n => n.allComplete);
  if (readyNotifications.length === 0) return null;

  // Show the first ready notification
  const notification = readyNotifications[0];

  const handleDismiss = () => {
    // Dismiss all jobs in this project group
    for (const jobId of notification.jobIds) {
      onDismiss(jobId);
    }
  };

  return (
    <ScanJobNotification
      notification={notification}
      onDismiss={handleDismiss}
    />
  );
}
