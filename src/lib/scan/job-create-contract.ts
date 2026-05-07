export type ScanJobClientPlatform = 'android' | 'ios' | 'web';
export type ScanJobSaveMode = 'server_cloud' | 'client_local';

export function resolveScanJobSaveMode(params: {
  clientPlatform: ScanJobClientPlatform;
  isProUser: boolean;
}): ScanJobSaveMode {
  const isNativeClient =
    params.clientPlatform === 'ios' || params.clientPlatform === 'android';

  return isNativeClient && !params.isProUser ? 'client_local' : 'server_cloud';
}

export function normalizeLegacyScanJobClientPlatform(
  value: string | null | undefined,
): ScanJobClientPlatform {
  const normalized = value?.trim().toLowerCase();

  if (normalized === 'ios' || normalized === 'android') {
    return normalized;
  }

  return 'web';
}
