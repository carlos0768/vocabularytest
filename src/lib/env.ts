export function normalizeSingleLineEnvValue(value: string | null | undefined): string {
  if (typeof value !== 'string') {
    return '';
  }

  return value.replace(/\\n/g, '').replace(/[\r\n]+/g, '').trim();
}

export function readSingleLineEnv(
  name: string,
  env: Record<string, string | undefined> = process.env,
): string {
  return normalizeSingleLineEnvValue(env[name]);
}
