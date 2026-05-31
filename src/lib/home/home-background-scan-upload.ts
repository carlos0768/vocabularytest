import type { ExtractMode } from '@/lib/scan/mode-provider';
import {
  type HomeBackgroundScanEikenLevel,
  buildHomeBackgroundScanJobCreatePayload,
} from '@/lib/home/home-background-scan-job';
import {
  type HomeBackgroundScanUploadImage,
  prepareHomeBackgroundScanUploadImage,
} from '@/lib/home/home-background-scan-upload-image';

export interface HomeBackgroundScanStorageBucket {
  upload(
    path: string,
    file: File,
    options: { contentType: string; upsert: false },
  ): Promise<{ error?: { message?: string } | null }>;
  remove(paths: string[]): Promise<unknown>;
}

export interface HomeBackgroundScanStorageClient {
  from(bucket: 'scan-images'): HomeBackgroundScanStorageBucket;
}

export interface HomeBackgroundScanCreateResponse {
  ok: boolean;
  json(): Promise<unknown>;
}

type HomeBackgroundScanFetch = (
  input: string,
  init: {
    method: 'POST';
    headers: { 'Content-Type': 'application/json'; Authorization: string };
    body: string;
  },
) => Promise<HomeBackgroundScanCreateResponse>;

type HomeBackgroundScanUploadPreparation = (params: {
  file: File;
  userId: string;
  index: number;
}) => Promise<HomeBackgroundScanUploadImage>;

export async function createHomeBackgroundScanJob(params: {
  files: readonly File[];
  userId: string;
  accessToken: string;
  storage: HomeBackgroundScanStorageClient;
  scanMode: ExtractMode;
  scanModes?: readonly ExtractMode[];
  eikenLevel?: HomeBackgroundScanEikenLevel;
  projectTitle?: string | null;
  targetProjectId?: string | null;
  onProgress?: (label: string) => void;
  fetcher?: HomeBackgroundScanFetch;
  prepareUploadImage?: HomeBackgroundScanUploadPreparation;
}): Promise<{ imagePaths: string[]; projectTitle: string; jobId?: string }> {
  const bucket = params.storage.from('scan-images');
  const uploadedPaths: string[] = [];
  const prepareUploadImage = params.prepareUploadImage ?? prepareHomeBackgroundScanUploadImage;
  const fetcher = params.fetcher ?? fetch;

  try {
    for (let index = 0; index < params.files.length; index++) {
      params.onProgress?.(`画像 ${index + 1}/${params.files.length} をアップロード中...`);
      const preparedUpload = await prepareUploadImage({
        file: params.files[index]!,
        userId: params.userId,
        index,
      });

      const { error: uploadError } = await bucket.upload(
        preparedUpload.imagePath,
        preparedUpload.uploadFile,
        {
          contentType: preparedUpload.contentType,
          upsert: false,
        },
      );

      if (uploadError) {
        throw new Error(`画像のアップロードに失敗しました: ${uploadError.message}`);
      }
      uploadedPaths.push(preparedUpload.imagePath);
    }

    params.onProgress?.('スキャンを送信中...');
    const payload = buildHomeBackgroundScanJobCreatePayload({
      imagePaths: uploadedPaths,
      scanMode: params.scanMode,
      scanModes: params.scanModes,
      eikenLevel: params.eikenLevel,
      projectTitle: params.projectTitle,
      targetProjectId: params.targetProjectId,
    });
    const response = await fetcher('/api/scan-jobs/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.accessToken}`,
      },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = typeof body === 'object' && body !== null && 'error' in body
        ? (body as { error?: unknown }).error
        : undefined;
      throw new Error(typeof error === 'string' ? error : 'スキャンの送信に失敗しました');
    }

    const jobId = typeof body === 'object' && body !== null && 'jobId' in body
      ? (body as { jobId?: unknown }).jobId
      : undefined;

    return {
      imagePaths: uploadedPaths,
      projectTitle: payload.projectTitle,
      ...(typeof jobId === 'string' ? { jobId } : {}),
    };
  } catch (error) {
    if (uploadedPaths.length > 0) {
      await bucket.remove(uploadedPaths);
    }
    throw error;
  }
}
