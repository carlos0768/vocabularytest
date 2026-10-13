/**
 * `Authorization: Bearer <token>` からトークンを取り出す。
 * ヘッダーが無い・`Bearer ` (大文字小文字区別) で始まらないときは null。
 */
export function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization');
  return authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
}
