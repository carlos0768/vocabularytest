'use client';

import { useState } from 'react';
import { SolidButton } from '@/components/redesign/SolidPage';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/use-auth';
import { getOAuthProviderLabel, type AuthOAuthProvider } from '@/lib/auth/oauth';

const PROVIDERS: { id: AuthOAuthProvider; mark: string }[] = [
  { id: 'google', mark: 'G' },
  { id: 'apple', mark: 'A' },
];

export function OAuthProviderButtons({
  redirectPath,
  disabled = false,
  onError,
}: {
  redirectPath: string;
  disabled?: boolean;
  onError: (message: string) => void;
}) {
  const { signInWithOAuth } = useAuth();
  const [loadingProvider, setLoadingProvider] = useState<AuthOAuthProvider | null>(null);

  const handleProviderClick = async (provider: AuthOAuthProvider) => {
    if (disabled || loadingProvider) return;

    setLoadingProvider(provider);
    onError('');
    const result = await signInWithOAuth(provider, redirectPath);
    if (!result.success) {
      onError(result.error || `${getOAuthProviderLabel(provider)}ログインに失敗しました`);
      setLoadingProvider(null);
    }
  };

  return (
    <div className="flex flex-col gap-2 px-6 pb-3">
      {PROVIDERS.map((provider) => {
        const label = getOAuthProviderLabel(provider.id);
        const isLoading = loadingProvider === provider.id;
        return (
          <SolidButton
            key={provider.id}
            type="button"
            onClick={() => void handleProviderClick(provider.id)}
            disabled={disabled || Boolean(loadingProvider)}
            className="w-full bg-white"
            size="md"
            aria-label={`${label}で続ける`}
          >
            <span className="inline-flex items-center gap-2.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full border-[1.25px] border-[var(--solid-ink)] font-display text-[11px] font-black leading-none">
                {isLoading ? (
                  <Icon name="progress_activity" size={13} className="animate-spin" />
                ) : (
                  provider.mark
                )}
              </span>
              <span>{isLoading ? `${label}へ移動中...` : `${label}で続ける`}</span>
            </span>
          </SolidButton>
        );
      })}
    </div>
  );
}
