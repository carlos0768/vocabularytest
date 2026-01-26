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
 * データURLから画像情報を抽出
 *
 * @param dataUrl data:image/... 形式のURL
 * @returns パースされた画像情報
 * @throws 不正な形式の場合はエラー
 *
 * @example
 * const image = parseDataUrl('data:image/jpeg;base64,/9j/4AAQ...');
 * // { base64: '/9j/4AAQ...', mimeType: 'image/jpeg' }
 */
export function parseDataUrl(dataUrl: string): ParsedImage {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);

  if (!match) {
    throw new Error('Invalid data URL format. Expected: data:image/...;base64,...');
  }

  return {
    mimeType: match[1],
    base64: match[2],
  };
}

/**
 * データURLが有効な画像形式かどうかを検証
 *
 * @param dataUrl 検証するデータURL
 * @returns 有効な場合はtrue
 */
export function isValidImageDataUrl(dataUrl: string): boolean {
  return /^data:image\/(jpeg|png|gif|webp);base64,.+$/.test(dataUrl);
}

/**
 * HEIC/HEIF形式かどうかをチェック
 *
 * @param dataUrl 検証するデータURL
 * @returns HEIC/HEIF形式の場合はtrue
 */
export function isHeicFormat(dataUrl: string): boolean {
  return dataUrl.startsWith('data:image/heic') || dataUrl.startsWith('data:image/heif');
}

/**
 * 画像のMIMEタイプを取得
 *
 * @param dataUrl データURL
 * @returns MIMEタイプ（取得できない場合は'unknown'）
 */
export function getMimeType(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;,]+)/);
  return match ? match[1] : 'unknown';
}

/**
 * 画像データの概算サイズを取得（バイト単位）
 *
 * @param base64 Base64エンコードされた文字列
 * @returns 概算サイズ（バイト）
 */
export function estimateImageSize(base64: string): number {
  // Base64は約4/3倍のサイズになるため、逆算する
  return Math.ceil((base64.length * 3) / 4);
}

/**
 * サポートされている画像形式の一覧
 */
export const SUPPORTED_FORMATS = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const;

/**
 * サポートされていない形式のエラーメッセージを生成
 */
export function getUnsupportedFormatError(mimeType: string): string {
  if (mimeType.includes('heic') || mimeType.includes('heif')) {
    return 'HEIC/HEIF形式は対応していません。カメラアプリの設定で「互換性優先」を選択するか、スクリーンショットをお試しください。';
  }
  return `${mimeType}形式は対応していません。JPEG/PNG形式の画像を使用してください。`;
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
