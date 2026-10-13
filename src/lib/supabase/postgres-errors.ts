/** PostgreSQL unique_violation (SQLSTATE 23505). */
export const POSTGRES_UNIQUE_VIOLATION = '23505';

/** エラーコードが 23505 (一意制約違反) か。 */
export function isUniqueViolation(error: { code?: string | null } | null | undefined): boolean {
  return error?.code === POSTGRES_UNIQUE_VIOLATION;
}

/**
 * 23505 に加えて、コードが落ちていてもメッセージが "duplicate key" なら一意制約違反とみなす。
 * コードの無いエラー (ラップされたものなど) も拾いたい呼び出し元向け。
 */
export function isUniqueViolationOrDuplicateKey(error: unknown): boolean {
  const maybeError = error as { code?: string | null; message?: string | null } | null | undefined;
  return maybeError?.code === POSTGRES_UNIQUE_VIOLATION
    || (maybeError?.message ?? '').toLowerCase().includes('duplicate key');
}
