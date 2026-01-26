/**
 * JSON Utilities
 *
 * AIレスポンスのJSON解析に関するユーティリティ。
 */

/**
 * AIレスポンスからJSONを抽出してパース
 *
 * AIはMarkdownコードブロック（```json ... ```）で返すことがあるため、
 * それを考慮してパースする。
 *
 * @param text AIからのテキストレスポンス
 * @returns パースされたオブジェクト
 * @throws JSON解析に失敗した場合はエラー
 *
 * @example
 * // Markdownブロックあり
 * parseJsonResponse('```json\n{"words": []}\n```');
 * // Markdownブロックなし
 * parseJsonResponse('{"words": []}');
 */
export function parseJsonResponse<T = unknown>(text: string): T {
  // 1. コードブロックを除去
  let cleaned = text.trim();

  // ```json ... ``` パターン
  const jsonBlockMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    cleaned = jsonBlockMatch[1].trim();
  }

  // 2. 先頭の余計な文字を除去（まれにAIが前置きを付けることがある）
  const jsonStart = cleaned.indexOf('{');
  const arrayStart = cleaned.indexOf('[');

  if (jsonStart === -1 && arrayStart === -1) {
    throw new Error('No JSON object or array found in response');
  }

  const startIndex =
    jsonStart === -1 ? arrayStart : arrayStart === -1 ? jsonStart : Math.min(jsonStart, arrayStart);

  cleaned = cleaned.slice(startIndex);

  // 3. 末尾の余計な文字を除去
  const lastBrace = cleaned.lastIndexOf('}');
  const lastBracket = cleaned.lastIndexOf(']');
  const endIndex = Math.max(lastBrace, lastBracket);

  if (endIndex !== -1) {
    cleaned = cleaned.slice(0, endIndex + 1);
  }

  // 4. パース
  try {
    return JSON.parse(cleaned) as T;
  } catch (error) {
    // 5. JSONが途中で切れている場合のリカバリー
    const repaired = repairTruncatedJson(cleaned);
    if (repaired) {
      try {
        return JSON.parse(repaired) as T;
      } catch {
        // リカバリーも失敗
      }
    }

    throw new Error(
      `Failed to parse JSON: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * 途中で切れたJSONを修復する
 *
 * AIの出力がmax_tokensで途切れた場合に、
 * 不完全なJSONを可能な限り修復する。
 *
 * @param json 不完全なJSON文字列
 * @returns 修復されたJSON文字列、または修復不可能な場合はnull
 */
function repairTruncatedJson(json: string): string | null {
  // wordsの配列構造を想定: {"words": [...]}
  // 途中で切れている場合、最後の完全なオブジェクトまでを取得して閉じる

  // 最後の完全な "}," または "}" を探す
  const lastCompleteObjectEnd = findLastCompleteObjectEnd(json);

  if (lastCompleteObjectEnd === -1) {
    return null;
  }

  // 最後の完全なオブジェクトまでを取得
  let repaired = json.slice(0, lastCompleteObjectEnd + 1);

  // 末尾のカンマを削除
  repaired = repaired.replace(/,\s*$/, '');

  // 開いている括弧をカウントして閉じる
  let braceCount = 0;
  let bracketCount = 0;

  for (const char of repaired) {
    if (char === '{') braceCount++;
    if (char === '}') braceCount--;
    if (char === '[') bracketCount++;
    if (char === ']') bracketCount--;
  }

  // 閉じ括弧を追加
  while (bracketCount > 0) {
    repaired += ']';
    bracketCount--;
  }
  while (braceCount > 0) {
    repaired += '}';
    braceCount--;
  }

  return repaired;
}

/**
 * 最後の完全なオブジェクトの終了位置を見つける
 */
function findLastCompleteObjectEnd(json: string): number {
  // "exampleSentenceJa": "..." } のパターンを探す
  // これが words 配列内のオブジェクトの終端パターン
  const pattern = /"exampleSentenceJa"\s*:\s*"[^"]*"\s*}/g;
  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(json)) !== null) {
    lastMatch = match;
  }

  if (lastMatch) {
    return lastMatch.index + lastMatch[0].length - 1;
  }

  // exampleSentenceJaがない場合は distractors の閉じ括弧を探す
  const distractorsPattern = /"distractors"\s*:\s*\[[^\]]*\]\s*}/g;
  while ((match = distractorsPattern.exec(json)) !== null) {
    lastMatch = match;
  }

  if (lastMatch) {
    return lastMatch.index + lastMatch[0].length - 1;
  }

  return -1;
}

/**
 * 安全にJSONをパース（失敗時はnullを返す）
 *
 * @param text パースするテキスト
 * @returns パース結果またはnull
 */
export function safeParseJson<T = unknown>(text: string): T | null {
  try {
    return parseJsonResponse<T>(text);
  } catch {
    return null;
  }
}

/**
 * 安全にJSONをパース（結果オブジェクト形式）
 *
 * @param text パースするテキスト
 * @returns { success: true, data } または { success: false, error }
 */
export function safeParseJSON<T = unknown>(text: string): { success: true; data: T } | { success: false; error: string } {
  try {
    const data = parseJsonResponse<T>(text);
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown parse error',
    };
  }
}

/**
 * オブジェクトが空かどうかをチェック
 */
export function isEmptyObject(obj: unknown): boolean {
  if (obj === null || obj === undefined) return true;
  if (typeof obj !== 'object') return false;
  return Object.keys(obj as object).length === 0;
}

/**
 * 配列が空かどうかをチェック
 */
export function isEmptyArray(arr: unknown): boolean {
  return !Array.isArray(arr) || arr.length === 0;
}
