'use client';

import { useState } from 'react';
import { SolidButton } from '@/components/redesign/SolidPage';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/use-auth';
import {
  getEnabledOAuthProviders,
  getOAuthProviderLabel,
  type AuthOAuthProvider,
} from '@/lib/auth/oauth';
import type { SignupProfileFields } from '@/lib/auth/signup-profile';

const PROVIDERS: { id: AuthOAuthProvider; mark: string }[] = [
  { id: 'google', mark: 'G' },
  { id: 'apple', mark: 'A' },
];

const ENABLED_PROVIDER_IDS = getEnabledOAuthProviders(
  process.env.NEXT_PUBLIC_AUTH_OAUTH_PROVIDERS,
);
const ENABLED_PROVIDERS = PROVIDERS.filter((provider) =>
  ENABLED_PROVIDER_IDS.includes(provider.id),
);

export function OAuthProviderButtons({
  redirectPath,
  onboardingFields,
  disabled = false,
  onError,
}: {
  redirectPath: string;
  onboardingFields?: SignupProfileFields | null;
  disabled?: boolean;
  onError: (message: string) => void;
}) {
  const { signInWithOAuth } = useAuth();
  const [loadingProvider, setLoadingProvider] = useState<AuthOAuthProvider | null>(null);

  if (ENABLED_PROVIDERS.length === 0) {
    return null;
  }

  const handleProviderClick = async (provider: AuthOAuthProvider) => {
    if (disabled || loadingProvider) return;

    setLoadingProvider(provider);
    onError('');
    const result = await signInWithOAuth(provider, redirectPath, onboardingFields);
    if (!result.success) {
      onError(result.error || `${getOAuthProviderLabel(provider)}ログインに失敗しました`);
      setLoadingProvider(null);
    }
  };

  return (
    <div className="flex flex-col gap-2 px-6 pb-3">
      {ENABLED_PROVIDERS.map((provider) => {
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
              <span className="flex h-5 w-5 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] font-display text-[11px] font-black leading-none">
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
