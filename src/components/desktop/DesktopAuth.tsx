'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/use-auth';
import {
  getEnabledOAuthProviders,
  getOAuthProviderLabel,
  type AuthOAuthProvider,
} from '@/lib/auth/oauth';

const AUTH_BOOKS = [
  { title: '鉄壁', color: '#f2c94c' },
  { title: '速読英単語', color: '#6fcf97' },
  { title: '英検準1級', color: '#bb6bd9' },
];

const OAUTH_PROVIDERS: { id: AuthOAuthProvider; mark: string }[] = [
  { id: 'google', mark: 'G' },
  { id: 'apple', mark: 'A' },
];

const ENABLED_OAUTH_PROVIDERS = OAUTH_PROVIDERS.filter((provider) =>
  getEnabledOAuthProviders(process.env.NEXT_PUBLIC_AUTH_OAUTH_PROVIDERS).includes(provider.id),
);

export function DesktopAuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="hidden min-h-screen bg-white lg:block">
      <div className="ds-auth min-h-screen">
        <DesktopAuthBrand />
        <div className="ds-auth-form">
          <h1>{title}</h1>
          <div className="sub">{description}</div>
          {children}
        </div>
      </div>
    </div>
  );
}

function DesktopAuthBrand() {
  return (
    <div className="ds-auth-brand">
      <div className="wm">
        <span className="t">MERKEN</span>
        <span className="dot" />
      </div>
      <div>
        <h2>
          写真を撮るだけで、
          <br />
          単語帳を作成。
        </h2>
        <p>
          ノートやプリントを撮影するだけで、AIが英単語を抽出・翻訳し、クイズと例文まで自動生成します。手入力はゼロ。
        </p>
      </div>
      <div className="ds-auth-books">
        {AUTH_BOOKS.map((book, index) => (
          <div
            key={book.title}
            className="bk"
            style={{ background: book.color, transform: `rotate(${(index - 1) * 4}deg)` }}
          >
            {book.title}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DesktopAuthField({
  label,
  placeholder,
  type = 'text',
  value,
  onChange,
  autoComplete,
  disabled,
  trailing,
  labelExtra,
}: {
  label: string;
  placeholder: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  disabled?: boolean;
  trailing?: ReactNode;
  labelExtra?: ReactNode;
}) {
  return (
    <div className="ds-field">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 7 }}>
        <label style={{ marginBottom: 0 }}>{label}</label>
        {labelExtra}
      </div>
      <div style={{ position: 'relative' }}>
        <input
          className="ds-input"
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          required
          autoComplete={autoComplete}
          disabled={disabled}
          style={trailing ? { paddingRight: 62 } : undefined}
        />
        {trailing && (
          <div style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)' }}>
            {trailing}
          </div>
        )}
      </div>
    </div>
  );
}

export function DesktopAuthError({ children }: { children: ReactNode }) {
  return (
    <div
      aria-live="polite"
      style={{
        border: '2px solid var(--color-error)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--color-error-light)',
        color: 'var(--color-error)',
        fontSize: 13,
        fontWeight: 700,
        padding: '10px 12px',
        marginBottom: 16,
      }}
    >
      {children}
    </div>
  );
}

export function DesktopAuthPrimaryButton({
  children,
  disabled,
  variant = 'dark',
  type = 'submit',
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  variant?: 'dark' | 'accent';
  type?: 'button' | 'submit';
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`ds-btn ${variant}`}
      style={{ width: '100%', marginTop: 6 }}
    >
      {children}
    </button>
  );
}

export function DesktopAuthOAuth({
  redirectPath,
  disabled,
  onError,
}: {
  redirectPath: string;
  disabled?: boolean;
  onError: (message: string) => void;
}) {
  const { signInWithOAuth } = useAuth();
  const [loadingProvider, setLoadingProvider] = useState<AuthOAuthProvider | null>(null);

  if (ENABLED_OAUTH_PROVIDERS.length === 0) return null;

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
    <>
      <div className="ds-divider">または</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ENABLED_OAUTH_PROVIDERS.map((provider) => {
          const label = getOAuthProviderLabel(provider.id);
          const isLoading = loadingProvider === provider.id;
          return (
            <button
              key={provider.id}
              type="button"
              className="ds-oauth"
              disabled={disabled || Boolean(loadingProvider)}
              onClick={() => void handleProviderClick(provider.id)}
            >
              {isLoading ? (
                <Icon name="progress_activity" className="animate-spin" style={{ fontSize: 18 }} />
              ) : (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 20,
                    height: 20,
                    borderRadius: 999,
                    border: '2px solid var(--solid-ink)',
                    fontFamily: 'var(--font-display)',
                    fontWeight: 800,
                    fontSize: 11,
                  }}
                >
                  {provider.mark}
                </span>
              )}
              {isLoading ? `${label}へ移動中...` : `${label}で続ける`}
            </button>
          );
        })}
      </div>
    </>
  );
}

export function DesktopAuthFooterLink({
  children,
  href,
}: {
  children: ReactNode;
  href: string;
}) {
  return (
    <div className="muted" style={{ fontSize: 13.5, textAlign: 'center', marginTop: 24 }}>
      {children}{' '}
      <Link href={href} style={{ color: 'var(--color-accent)', fontWeight: 700, textDecoration: 'none' }}>
        こちら
      </Link>
    </div>
  );
}
