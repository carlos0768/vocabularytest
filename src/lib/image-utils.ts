// Image utility functions
// Handles HEIC conversion, compression, PDF pass-through, and other image processing

// Maximum image size in bytes (1MB to reduce OpenAI API processing time and avoid Vercel timeout)
const MAX_IMAGE_SIZE = 1 * 1024 * 1024;
const PROJECT_ICON_SIZE = 256;

// Maximum PDF size (Gemini supports up to 100MB, but we limit to 20MB for performance)
const MAX_PDF_SIZE = 20 * 1024 * 1024;
const MAX_PDF_PAGES = 20;
const PDF_RENDER_MAX_DIMENSION = 1600;
const PDF_RENDER_QUALITY = 0.82;

/**
 * Check if file is PDF format
 */
export function isPdfFile(file: File): boolean {
  return /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
}

type PdfJsModule = typeof import('pdfjs-dist');

let pdfWorkerConfigured = false;

async function getPdfJsModule(): Promise<PdfJsModule> {
  const pdfjs = await import('pdfjs-dist');

  if (!pdfWorkerConfigured && typeof window !== 'undefined') {
    const version = typeof pdfjs.version === 'string' ? pdfjs.version : '4.10.38';
    pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${version}/pdf.worker.min.mjs`;
    pdfWorkerConfigured = true;
  }

  return pdfjs;
}

function stripPdfExtension(name: string): string {
  return name.replace(/\.pdf$/i, '');
}

async function fileToDataUrl(file: Blob, readErrorMessage: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(readErrorMessage));
    reader.readAsDataURL(file);
  });
}

/**
 * Convert PDF pages into image files (JPEG), one file per page.
 */
export async function convertPdfToImageFiles(file: File): Promise<File[]> {
  if (!isPdfFile(file)) {
    return [file];
  }

  if (file.size > MAX_PDF_SIZE) {
    throw new Error(`PDFファイルが大きすぎます（最大${MAX_PDF_SIZE / 1024 / 1024}MB）`);
  }

  if (typeof window === 'undefined') {
    throw new Error('PDF変換はブラウザ環境でのみ利用できます');
  }

  const pdfjs = await getPdfJsModule();
  const data = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument({ data });
  const pdf = await loadingTask.promise;

  if (pdf.numPages > MAX_PDF_PAGES) {
    throw new Error(`PDFは最大${MAX_PDF_PAGES}ページまで対応しています。ファイルを分割してお試しください。`);
  }

  const outputFiles: File[] = [];
  const baseName = stripPdfExtension(file.name) || 'document';

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const longestSide = Math.max(baseViewport.width, baseViewport.height) || 1;
    const scale = Math.min(2, Math.max(0.75, PDF_RENDER_MAX_DIMENSION / longestSide));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('PDFページ描画に失敗しました');
    }

    await page.render({ canvasContext: ctx, viewport }).promise;

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (rendered) => {
          if (rendered) resolve(rendered);
          else reject(new Error('PDFページの画像化に失敗しました'));
        },
        'image/jpeg',
        PDF_RENDER_QUALITY
      );
    });

    const pageSuffix = String(pageNumber).padStart(3, '0');
    outputFiles.push(
      new File([blob], `${baseName}-page-${pageSuffix}.jpg`, { type: 'image/jpeg' })
    );
  }

  try {
    await loadingTask.destroy();
  } catch {
    // Ignore cleanup errors
  }

  return outputFiles;
}

/**
 * Expand input files so PDF files are converted into per-page image files.
 */
export async function expandFilesForScan(files: File[]): Promise<File[]> {
  const expanded: File[] = [];

  for (const file of files) {
    if (isPdfFile(file)) {
      const pdfPages = await convertPdfToImageFiles(file);
      expanded.push(...pdfPages);
    } else {
      expanded.push(file);
    }
  }

  return expanded;
}

/**
 * Check if file is HEIC/HEIF format
 */
function isHeicFile(file: File): boolean {
  return /\.(heic|heif)$/i.test(file.name) ||
         /^image\/(heic|heif)$/.test(file.type);
}

/**
 * Read the first few bytes of a file to determine its actual format
 * Returns hex string of the file header
 */
async function readFileHeader(file: File): Promise<string> {
  const slice = file.slice(0, 4);
  const buffer = await slice.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Maximum dimension for resizing
// Reduced to speed up OpenAI API processing
const MAX_DIMENSION = 1024;

/**
 * Convert HEIC/HEIF image to JPEG
 * Uses heic2any library for client-side conversion
 */
export async function convertHeicToJpeg(file: File): Promise<File> {
  // Quick check using helper function
  if (!isHeicFile(file)) {
    return file;
  }

  console.log('HEIC file detected, converting...');

  try {
    // Dynamically import heic2any (client-side only)
    const heic2any = (await import('heic2any')).default;

    const convertedBlob = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.9,
    });

    // heic2any can return Blob or Blob[]
    const blob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;

    // Create new File with converted data
    const newFileName = file.name.replace(/\.(heic|heif)$/i, '.jpg');
    const result = new File([blob], newFileName, { type: 'image/jpeg' });
    console.log('HEIC conversion successful:', { name: result.name, type: result.type, size: result.size });
    return result;
  } catch (error) {
    console.error('HEIC conversion failed:', error);

    // Check if the file might actually be a JPEG despite having .heic extension
    // This can happen on some iOS devices
    const fileHeader = await readFileHeader(file);
    if (fileHeader.startsWith('ffd8ff')) {
      // File is actually JPEG (starts with JPEG magic bytes)
      console.log('File appears to be JPEG despite .heic extension, returning as-is');
      return new File([file], file.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });
    }

    // If it's truly a HEIC file and conversion failed, throw an error
    throw new Error('HEIC画像の変換に失敗しました。カメラアプリの設定で「互換性優先」を選択するか、スクリーンショットをお試しください。');
  }
}

/**
 * Compress and resize image to reduce file size
 * Uses canvas to resize and compress
 */
export async function compressImage(file: File): Promise<File> {
  // Always resize to MAX_DIMENSION to speed up API processing, even if file size is small
  // This ensures consistent processing time regardless of original image dimensions

  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const objectUrl = URL.createObjectURL(file);

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
    };

    img.onload = () => {
      try {
        let { width, height } = img;

        // Calculate new dimensions while maintaining aspect ratio
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width > height) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width = MAX_DIMENSION;
          } else {
            width = Math.round((width * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }
        }

        canvas.width = width;
        canvas.height = height;

        if (!ctx) {
          cleanup();
          reject(new Error('Failed to get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Start with quality 0.8 and reduce if needed
        let quality = 0.8;
        const tryCompress = () => {
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                cleanup();
                reject(new Error('Failed to compress image'));
                return;
              }

              // If still too large and quality can be reduced, try again
              if (blob.size > MAX_IMAGE_SIZE && quality > 0.3) {
                quality -= 0.1;
                tryCompress();
                return;
              }

              cleanup();
              const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
                type: 'image/jpeg',
              });
              console.log('Compressed:', { from: file.size, to: compressedFile.size });
              resolve(compressedFile);
            },
            'image/jpeg',
            quality
          );
        };

        tryCompress();
      } catch (error) {
        cleanup();
        reject(error);
      }
    };

    img.onerror = () => {
      cleanup();
      reject(new Error('Failed to load image for compression'));
    };

    img.src = objectUrl;
  });
}

/**
 * Process image file for upload
 * - Converts HEIC to JPEG
 * - Compresses large images
 * - Returns processed file ready for base64 encoding
 */
export async function processImageFile(file: File): Promise<File> {
  if (isPdfFile(file)) {
    const pages = await convertPdfToImageFiles(file);
    return pages[0];
  }

  // First convert HEIC if needed
  let processedFile = await convertHeicToJpeg(file);

  // Then compress if too large
  processedFile = await compressImage(processedFile);

  return processedFile;
}

/**
 * Process image file and return base64 directly
 * - Eliminates double FileReader read
 * - Converts HEIC to JPEG
 * - Compresses large images
 * - Passes through PDF files without modification
 * - Returns base64 string ready for API
 */
export async function processImageToBase64(file: File): Promise<string> {
  // PDF files: convert to image (first page fallback) for OpenAI image flow
  if (isPdfFile(file)) {
    const pages = await convertPdfToImageFiles(file);
    return fileToDataUrl(pages[0], 'PDFページの読み込みに失敗しました');
  }

  // First convert HEIC if needed
  let processedFile = await convertHeicToJpeg(file);

  // Then compress if too large
  processedFile = await compressImage(processedFile);

  // Convert to base64 directly
  return fileToDataUrl(processedFile, 'Failed to read image file');
}

/**
 * Process image file for project icon
 * - Converts HEIC/HEIF to JPEG
 * - Compresses large images
 * - Crops center to a square and resizes to PROJECT_ICON_SIZE
 * - Returns a compact data URL for storing in project metadata
 */
export async function processProjectIconFile(file: File): Promise<string> {
  if (isPdfFile(file)) {
    throw new Error('アイコンには画像ファイルを選択してください');
  }

  const processedFile = await processImageFile(file);

  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const objectUrl = URL.createObjectURL(processedFile);

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
    };

    img.onload = () => {
      try {
        const size = Math.min(img.width, img.height);
        const offsetX = Math.floor((img.width - size) / 2);
        const offsetY = Math.floor((img.height - size) / 2);

        canvas.width = PROJECT_ICON_SIZE;
        canvas.height = PROJECT_ICON_SIZE;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          cleanup();
          reject(new Error('アイコン画像の処理に失敗しました'));
          return;
        }

        ctx.drawImage(
          img,
          offsetX,
          offsetY,
          size,
          size,
          0,
          0,
          PROJECT_ICON_SIZE,
          PROJECT_ICON_SIZE
        );

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              cleanup();
              reject(new Error('アイコン画像の生成に失敗しました'));
              return;
            }

            const reader = new FileReader();
            reader.onload = () => {
              cleanup();
              resolve(reader.result as string);
            };
            reader.onerror = () => {
              cleanup();
              reject(new Error('アイコン画像の読み込みに失敗しました'));
            };
            reader.readAsDataURL(blob);
          },
          'image/jpeg',
          0.82
        );
      } catch (error) {
        cleanup();
        reject(error instanceof Error ? error : new Error('アイコン画像の処理に失敗しました'));
      }
    };

    img.onerror = () => {
      cleanup();
      reject(new Error('アイコン画像の読み込みに失敗しました'));
    };

    img.src = objectUrl;
  });
}
