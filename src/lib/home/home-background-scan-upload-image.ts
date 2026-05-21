import { processImageFile } from '@/lib/image-utils';

export interface HomeBackgroundScanUploadImage {
  uploadFile: File;
  imagePath: string;
  contentType: string;
}

type HomeBackgroundScanUploadImageProcessor = (file: File) => Promise<File>;

export async function prepareHomeBackgroundScanUploadImage(params: {
  file: File;
  userId: string;
  index: number;
  now?: number;
  suffix?: string;
  processImage?: HomeBackgroundScanUploadImageProcessor;
}): Promise<HomeBackgroundScanUploadImage> {
  const processImage = params.processImage ?? ((file: File) => processImageFile(file, 'default'));
  const uploadFile = await processImage(params.file);
  const timestamp = params.now ?? Date.now();
  const suffix = params.suffix ?? createHomeBackgroundScanUploadSuffix();

  return {
    uploadFile,
    imagePath: `${params.userId}/${timestamp}-${params.index}-${suffix}${uploadExtensionFor(uploadFile)}`,
    contentType: uploadFile.type || 'image/jpeg',
  };
}

function uploadExtensionFor(file: File): string {
  if (file.type === 'image/png') return '.png';
  if (file.type === 'image/webp') return '.webp';
  if (file.type === 'image/gif') return '.gif';
  return '.jpg';
}

function createHomeBackgroundScanUploadSuffix(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}
