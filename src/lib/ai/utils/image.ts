/**
 * Image Utilities
 *
 * 画像処理に関する共通ユーティリティ。
 */

export interface ParsedImage {
  base64: string;
  mimeType: string;
}

/**
 * データURLから画像/PDF情報を抽出
 *
 * @param dataUrl data:image/... または data:application/pdf 形式のURL
 * @returns パースされた画像/PDF情報
 * @throws 不正な形式の場合はエラー
 *
 * @example
 * const image = parseDataUrl('data:image/jpeg;base64,/9j/4AAQ...');
 * // { base64: '/9j/4AAQ...', mimeType: 'image/jpeg' }
 * const pdf = parseDataUrl('data:application/pdf;base64,JVBERi...');
 * // { base64: 'JVBERi...', mimeType: 'application/pdf' }
 */
function parseDataUrl(dataUrl: string): ParsedImage {
  // Match image formats or PDF
  const match = dataUrl.match(/^data:(image\/[a-zA-Z+]+|application\/pdf);base64,(.+)$/);

  if (!match) {
    throw new Error('Invalid data URL format. Expected: data:image/...;base64,... or data:application/pdf;base64,...');
  }

  return {
    mimeType: match[1],
    base64: match[2],
  };
}

/**
 * プロバイダー用に画像データを準備
 *
 * @param imageBase64 Base64形式の画像データ（data URL形式可）
 * @returns プロバイダー用の画像オブジェクト
 */
export function prepareImageForProvider(imageBase64: string): ParsedImage {
  // data URL形式の場合はパースする
  if (imageBase64.startsWith('data:')) {
    try {
      return parseDataUrl(imageBase64);
    } catch {
      // パースに失敗した場合はJPEGとして扱う
      const base64 = imageBase64.includes(',')
        ? imageBase64.split(',')[1]
        : imageBase64;
      return {
        base64,
        mimeType: 'image/jpeg',
      };
    }
  }

  // 生のbase64の場合はJPEGとして扱う
  return {
    base64: imageBase64,
    mimeType: 'image/jpeg',
  };
}
