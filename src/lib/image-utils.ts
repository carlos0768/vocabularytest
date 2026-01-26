// Image utility functions
// Handles HEIC conversion, compression, and other image processing

// Maximum image size in bytes (1MB to reduce OpenAI API processing time and avoid Vercel timeout)
const MAX_IMAGE_SIZE = 1 * 1024 * 1024;

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

// Maximum dimension for resizing (reduced to speed up OpenAI API processing)
const MAX_DIMENSION = 1024;

/**
 * Convert HEIC/HEIF image to JPEG
 * Uses heic2any library for client-side conversion
 */
export async function convertHeicToJpeg(file: File): Promise<File> {
  console.log('convertHeicToJpeg called:', { name: file.name, type: file.type, size: file.size });

  // Check if file is HEIC/HEIF
  const isHeic =
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    file.name.toLowerCase().endsWith('.heic') ||
    file.name.toLowerCase().endsWith('.heif');

  if (!isHeic) {
    console.log('File is not HEIC, returning as-is');
    return file;
  }

  console.log('File is HEIC, converting to JPEG...');

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
  console.log('compressImage called:', { name: file.name, type: file.type, size: file.size });

  // Always resize to MAX_DIMENSION to speed up API processing, even if file size is small
  // This ensures consistent processing time regardless of original image dimensions

  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    img.onload = () => {
      try {
        let { width, height } = img;
        console.log('Original dimensions:', { width, height });

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
        console.log('New dimensions:', { width, height });

        canvas.width = width;
        canvas.height = height;

        if (!ctx) {
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
                reject(new Error('Failed to compress image'));
                return;
              }

              console.log('Compressed size:', blob.size, 'quality:', quality);

              // If still too large and quality can be reduced, try again
              if (blob.size > MAX_IMAGE_SIZE && quality > 0.3) {
                quality -= 0.1;
                tryCompress();
                return;
              }

              const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
                type: 'image/jpeg',
              });
              console.log('Compression complete:', { size: compressedFile.size, quality });
              resolve(compressedFile);
            },
            'image/jpeg',
            quality
          );
        };

        tryCompress();
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      reject(new Error('Failed to load image for compression'));
    };

    // Create object URL for the image
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Process image file for upload
 * - Converts HEIC to JPEG
 * - Compresses large images
 * - Returns processed file ready for base64 encoding
 */
export async function processImageFile(file: File): Promise<File> {
  console.log('processImageFile called:', { name: file.name, type: file.type, size: file.size });

  // First convert HEIC if needed
  let processedFile = await convertHeicToJpeg(file);

  // Then compress if too large
  processedFile = await compressImage(processedFile);

  console.log('Final processed file:', { name: processedFile.name, type: processedFile.type, size: processedFile.size });
  return processedFile;
}
