// Image utility functions
// Handles HEIC conversion and other image processing

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
    // If conversion fails, try to return original file
    // Safari on iOS sometimes reports HEIC but actually provides JPEG
    console.log('Returning original file after conversion failure');
    return file;
  }
}

/**
 * Process image file for upload
 * - Converts HEIC to JPEG
 * - Returns processed file ready for base64 encoding
 */
export async function processImageFile(file: File): Promise<File> {
  console.log('processImageFile called:', { name: file.name, type: file.type, size: file.size });
  return convertHeicToJpeg(file);
}
