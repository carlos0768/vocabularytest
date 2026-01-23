// Image utility functions
// Handles HEIC conversion and other image processing

/**
 * Convert HEIC/HEIF image to JPEG
 * Uses heic2any library for client-side conversion
 */
export async function convertHeicToJpeg(file: File): Promise<File> {
  // Check if file is HEIC/HEIF
  const isHeic =
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    file.name.toLowerCase().endsWith('.heic') ||
    file.name.toLowerCase().endsWith('.heif');

  if (!isHeic) {
    return file;
  }

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
  return new File([blob], newFileName, { type: 'image/jpeg' });
}

/**
 * Process image file for upload
 * - Converts HEIC to JPEG
 * - Returns processed file ready for base64 encoding
 */
export async function processImageFile(file: File): Promise<File> {
  return convertHeicToJpeg(file);
}
