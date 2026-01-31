// Image utility functions
// Handles HEIC conversion, compression, PDF pass-through, and other image processing

// Maximum image size in bytes (2MB to stay well under Vercel's 4.5MB limit after base64 encoding)
const MAX_IMAGE_SIZE = 2 * 1024 * 1024;

// Maximum PDF size (Gemini supports up to 100MB, but we limit to 20MB for performance)
const MAX_PDF_SIZE = 20 * 1024 * 1024;

/**
 * Check if file is PDF format
 */
function isPdfFile(file: File): boolean {
  return /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
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
const MAX_DIMENSION = 2048;

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
  // Skip if already small enough - early return for performance
  if (file.size <= MAX_IMAGE_SIZE) {
    return file;
  }

  console.log('Compressing large image:', { size: file.size });

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
  // PDF files: pass through without modification (Gemini API supports PDF natively)
  if (isPdfFile(file)) {
    if (file.size > MAX_PDF_SIZE) {
      throw new Error(`PDFファイルが大きすぎます（最大${MAX_PDF_SIZE / 1024 / 1024}MB）`);
    }
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('PDFファイルの読み込みに失敗しました'));
      reader.readAsDataURL(file);
    });
  }

  // First convert HEIC if needed
  let processedFile = await convertHeicToJpeg(file);

  // Then compress if too large
  processedFile = await compressImage(processedFile);

  // Convert to base64 directly
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(processedFile);
  });
}
