import type { CloudRunTimingEntry } from '@/lib/ai/providers/cloud-run-timing';

export type ScanJobNotificationStatus = 'completed' | 'failed' | 'warning';
export type ScanJobTimingStatus = 'completed' | 'failed';

export interface ScanJobNotificationParams {
  userId: string;
  jobId: string;
  projectId: string | null;
  projectTitle: string;
  status: ScanJobNotificationStatus;
  wordCount?: number;
  /** 失敗通知の本文にそのまま載せる、ユーザー向けの失敗理由（日本語） */
  errorMessage?: string;
}

interface CommonNotificationParams {
  userId: string;
  jobId: string;
  projectTitle: string;
}

export function buildScanJobWarningNotificationParams(
  params: CommonNotificationParams,
): ScanJobNotificationParams {
  return {
    userId: params.userId,
    jobId: params.jobId,
    projectId: null,
    projectTitle: params.projectTitle,
    status: 'warning',
  };
}

export function buildScanJobFailedNotificationParams(
  params: CommonNotificationParams & { errorMessage?: string },
): ScanJobNotificationParams {
  const errorMessage = params.errorMessage?.trim();
  return {
    userId: params.userId,
    jobId: params.jobId,
    projectId: null,
    projectTitle: params.projectTitle,
    status: 'failed',
    wordCount: 0,
    ...(errorMessage ? { errorMessage } : {}),
  };
}

export function buildScanJobCompletedNotificationParams(
  params: CommonNotificationParams & {
    projectId: string | null;
    wordCount: number;
  },
): ScanJobNotificationParams {
  return {
    userId: params.userId,
    jobId: params.jobId,
    projectId: params.projectId,
    projectTitle: params.projectTitle,
    status: 'completed',
    wordCount: params.wordCount,
  };
}

export type FlushScanJobTimingLogs<TTiming> = (
  entries: CloudRunTimingEntry[],
  timing: TTiming,
  jobId: string,
  userId: string,
  status: ScanJobTimingStatus,
) => Promise<void>;

export async function flushScanJobTimingLogs<TTiming>(params: {
  flushTiming: FlushScanJobTimingLogs<TTiming>;
  cloudRunTimingEntries: CloudRunTimingEntry[];
  timing: TTiming;
  jobId: string;
  userId: string;
  status: ScanJobTimingStatus;
}): Promise<void> {
  await params.flushTiming(
    params.cloudRunTimingEntries,
    params.timing,
    params.jobId,
    params.userId,
    params.status,
  );
}
