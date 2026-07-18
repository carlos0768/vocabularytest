// スキャン失敗時にユーザーへ見せるエラーメッセージへの変換。
//
// スキャン処理の内部エラー（英語の技術的メッセージや例外の message）を
// そのまま scan_jobs.error_message やレスポンスに書くと、ホーム画面に
// 「Processing failed」のような理由の分からない文言が表示されてしまう。
// ここで「何が起きたか・どうすればよいか」が伝わる日本語文言に変換する。
// AI層やスキャン処理が既に日本語のユーザー向け文言を返している場合は
// そのまま通す（日本語の文字を含むメッセージはユーザー向けとみなす）。

export const SCAN_UNEXPECTED_ERROR_MESSAGE =
  'スキャン処理中に予期しないエラーが発生しました。時間をおいてもう一度お試しください。';

// ひらがな・カタカナ・漢字のいずれかを含むか（ユーザー向け日本語文言の判定）
const JAPANESE_TEXT_PATTERN = /[぀-ヿ㐀-䶿一-鿿]/;

// 既知の内部エラーパターン → 理由の伝わる日本語文言（上から順に評価）
const KNOWN_REASON_PATTERNS: ReadonlyArray<{ pattern: RegExp; message: string }> = [
  {
    pattern: /timed?[\s-]?out|timeout|deadline exceeded/i,
    message: '画像の解析に時間がかかりすぎて中断しました。画像の枚数を減らすか、時間をおいてもう一度お試しください。',
  },
  {
    pattern: /rate[\s_-]?limit|too many requests|quota|overloaded|\b429\b/i,
    message: 'AIサーバーが混み合っています。しばらく待ってからもう一度お試しください。',
  },
  {
    pattern: /network|fetch failed|econnreset|econnrefused|enotfound|etimedout|eai_again|socket|und_err/i,
    message: 'サーバーの通信エラーで解析を完了できませんでした。時間をおいてもう一度お試しください。',
  },
  {
    pattern: /api[\s_-]?key|unauthorized|forbidden|permission|credential|\b401\b|\b403\b/i,
    message: 'サーバーの設定に問題があり解析できませんでした。時間をおいても解決しない場合はお問い合わせください。',
  },
  {
    pattern: /no images to process/i,
    message: 'スキャンする画像を受け取れませんでした。もう一度撮影してお試しください。',
  },
  {
    pattern: /download|storage|object not found/i,
    message: 'アップロードされた画像の読み込みに失敗しました。もう一度撮影してお試しください。',
  },
  {
    // scan-jobs/process が投げる保存系の内部エラー
    // （Failed to insert words / create project / update project ... など）
    pattern: /failed to (insert|create|update)/i,
    message: '単語の抽出はできましたが、単語帳の保存に失敗しました。時間をおいてもう一度お試しください。',
  },
];

function extractErrorText(error: unknown): string {
  if (typeof error === 'string') return error.trim();
  if (error instanceof Error) return error.message.trim();
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === 'string') return message.trim();
  }
  return '';
}

/**
 * スキャン失敗の原因（例外・エラー文字列）を、理由が伝わるユーザー向け
 * 日本語メッセージに変換する。既に日本語のメッセージはそのまま返す。
 */
export function toUserFacingScanErrorMessage(
  error: unknown,
  fallback: string = SCAN_UNEXPECTED_ERROR_MESSAGE,
): string {
  const raw = extractErrorText(error);
  if (!raw) return fallback;

  // AI層・スキャン処理が組み立てたユーザー向け日本語文言はそのまま表示する
  if (JAPANESE_TEXT_PATTERN.test(raw)) return raw;

  for (const { pattern, message } of KNOWN_REASON_PATTERNS) {
    if (pattern.test(raw)) return message;
  }

  // 未知の内部メッセージ（英語）はユーザーに見せず、汎用の理由文言に置き換える
  return fallback;
}
