import { Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { withWebAppBase } from './web-base-url';
import { generateId } from './utils';

export type ScanMode = 'all' | 'circled' | 'highlighted' | 'eiken' | 'idiom' | 'wrong';
export type ScanJobSaveMode = 'server_cloud' | 'client_local';

export interface CreateScanJobInput {
  session: Session;
  imageUri: string;
  projectTitle: string;
  projectIcon?: string | null;
  scanMode?: ScanMode;
  eikenLevel?: string | null;
  targetProjectId?: string;
  mimeType?: string | null;
}

export interface ScanJobRecord {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  save_mode?: ScanJobSaveMode;
  project_id?: string | null;
  target_project_id?: string | null;
  result?: string | null;
  error_message?: string | null;
}

export interface CompletedScanJob {
  job: ScanJobRecord;
  parsedResult: Record<string, unknown> | null;
}

function getClientPlatform(): 'android' | 'ios' | 'web' {
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'ios') return 'ios';
  return 'web';
}

function guessFileExtension(uri: string, mimeType?: string | null): string {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'image/heic' || mimeType === 'image/heif') return 'heic';
  if (mimeType === 'application/pdf') return 'pdf';

  const matchedExtension = uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  if (matchedExtension?.[1]) {
    return matchedExtension[1].toLowerCase();
  }

  return 'jpg';
}

async function uploadScanImage(
  userId: string,
  imageUri: string,
  mimeType?: string | null
): Promise<string> {
  const response = await fetch(imageUri);
  const blob = await response.blob();
  const buffer = await blob.arrayBuffer();
  const extension = guessFileExtension(imageUri, mimeType);
  const contentType = mimeType || blob.type || 'image/jpeg';
  const imagePath = `${userId}/${Date.now()}-${generateId()}.${extension}`;

  const { error } = await supabase.storage
    .from('scan-images')
    .upload(imagePath, buffer, {
      contentType,
      upsert: false,
    });

  if (error) {
    throw new Error(`画像のアップロードに失敗しました: ${error.message}`);
  }

  return imagePath;
}

export async function createScanJob(input: CreateScanJobInput): Promise<{
  jobId: string;
  saveMode: ScanJobSaveMode;
}> {
  const imagePath = await uploadScanImage(
    input.session.user.id,
    input.imageUri,
    input.mimeType
  );

  const response = await fetch(withWebAppBase('/api/scan-jobs/create'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.session.access_token}`,
    },
    body: JSON.stringify({
      imagePaths: [imagePath],
      projectTitle: input.projectTitle,
      projectIcon: input.projectIcon ?? null,
      scanMode: input.scanMode ?? 'all',
      eikenLevel: input.eikenLevel ?? null,
      targetProjectId: input.targetProjectId,
      clientPlatform: getClientPlatform(),
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.jobId) {
    throw new Error(
      typeof data?.error === 'string' && data.error.length > 0
        ? data.error
        : 'スキャンジョブの作成に失敗しました。'
    );
  }

  return {
    jobId: data.jobId as string,
    saveMode: (data.saveMode as ScanJobSaveMode) ?? 'server_cloud',
  };
}

async function acknowledgeScanJob(session: Session, jobId: string): Promise<void> {
  await fetch(withWebAppBase(`/api/scan-jobs?jobId=${jobId}`), {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
  }).catch(() => {
    // Best-effort cleanup only.
  });
}

export async function waitForScanJobCompletion(
  session: Session,
  jobId: string,
  options?: {
    timeoutMs?: number;
    intervalMs?: number;
  }
): Promise<CompletedScanJob> {
  const timeoutMs = options?.timeoutMs ?? 180_000;
  const intervalMs = options?.intervalMs ?? 2_000;
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const response = await fetch(withWebAppBase(`/api/scan-jobs?jobId=${jobId}`), {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.job) {
      throw new Error(
        typeof data?.error === 'string' && data.error.length > 0
          ? data.error
          : 'スキャンジョブの取得に失敗しました。'
      );
    }

    const job = data.job as ScanJobRecord;
    if (job.status === 'completed') {
      let parsedResult: Record<string, unknown> | null = null;
      if (typeof job.result === 'string' && job.result.length > 0) {
        try {
          parsedResult = JSON.parse(job.result) as Record<string, unknown>;
        } catch {
          parsedResult = null;
        }
      }

      await acknowledgeScanJob(session, jobId);
      return { job, parsedResult };
    }

    if (job.status === 'failed') {
      await acknowledgeScanJob(session, jobId);
      throw new Error(job.error_message || 'スキャン処理に失敗しました。');
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error('スキャン処理がタイムアウトしました。もう一度お試しください。');
}
