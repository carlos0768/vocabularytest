'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { OAuthProviderButtons } from '@/components/auth/OAuthProviderButtons';
import {
  DesktopAuthError,
  DesktopAuthField,
  DesktopAuthOAuth,
  DesktopAuthPrimaryButton,
  DesktopAuthShell,
} from '@/components/desktop/DesktopAuth';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/use-auth';
import { usePageBackground } from '@/hooks/use-page-background';

function LoginForm() {
  usePageBackground('#f3f0e9');

  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (loading) return;

    setError(null);
    setLoading(true);

    const result = await signIn(email, password);
    if (result.success) {
      window.location.href = redirect;
      return;
    }

    setError(result.error || 'ログインに失敗しました');
    setLoading(false);
  };

  return (
    <>
      <DesktopAuthShell
        title="おかえりなさい"
        description="アカウントにログインして学習を続けましょう"
      >
        <form onSubmit={handleSubmit}>
          {error && <DesktopAuthError>{error}</DesktopAuthError>}
          <DesktopAuthField
            label="メールアドレス"
            placeholder="you@example.com"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            disabled={loading}
          />
          <DesktopAuthField
            label="パスワード"
            placeholder="••••••••"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            disabled={loading}
            labelExtra={
              <Link href="/reset-password" style={{ fontSize: 12.5, color: 'var(--color-accent)', fontWeight: 700, textDecoration: 'none' }}>
                お忘れですか？
              </Link>
            }
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 800, color: 'var(--color-muted)' }}
                aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
              >
                {showPassword ? '非表示' : '表示'}
              </button>
            }
          />
          <DesktopAuthPrimaryButton disabled={loading || email.trim().length === 0 || password.length === 0}>
            {loading ? 'ログイン中...' : 'ログイン'}
          </DesktopAuthPrimaryButton>
        </form>

        <DesktopAuthOAuth
          redirectPath={redirect}
          disabled={loading}
          onError={(message) => setError(message || null)}
        />

        <div className="muted" style={{ fontSize: 13.5, textAlign: 'center', marginTop: 24 }}>
          アカウントをお持ちでない方は{' '}
          <Link
            href={`/signup?redirect=${encodeURIComponent(redirect)}`}
            style={{ color: 'var(--color-accent)', fontWeight: 700, textDecoration: 'none' }}
          >
            新規登録
          </Link>
        </div>
      </DesktopAuthShell>

      <div className="relative mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-[#f3f0e9] pt-[calc(env(safe-area-inset-top,0px)+12px)] font-[var(--font-body)] [background-image:radial-gradient(rgba(26,26,26,0.045)_1px,transparent_1px)] [background-size:22px_22px] lg:hidden">
      <div className="px-[14px] pt-1">
        <Link
          href="/"
          className="flex h-[38px] w-[38px] items-center justify-center rounded-[19px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
          aria-label="戻る"
        >
          <Icon name="chevron_left" size={16} />
        </Link>
      </div>

      <div className="px-6 pb-2 pt-6 text-center">
        <div className="inline-block font-display text-[38px] font-black leading-none tracking-[0.1em] text-[var(--solid-ink)]">
          MERKEN
          <span className="ml-[5px] inline-block h-[7px] w-[7px] -translate-y-3 bg-[var(--color-accent)]" />
        </div>
      </div>

      <div className="px-6 pb-4 pt-6">
        <div className="font-display text-2xl font-extrabold leading-[1.2] tracking-[-0.02em] text-[var(--solid-ink)]">
          ログイン
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-2.5 px-6 pb-3">
          {error && (
            <div className="rounded-[10px] border-2 border-[var(--color-error)] bg-[var(--color-error-light)] px-3 py-2.5 text-xs font-bold text-[var(--color-error)]">
              {error}
            </div>
          )}

          <FormField
            label="メールアドレス"
            placeholder="kenta@example.com"
            type="email"
            value={email}
            onChange={setEmail}
            autoComplete="email"
            disabled={loading}
          />

          <FormField
            label="パスワード"
            placeholder="••••••••"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            disabled={loading}
            trailing={
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="font-mono text-[10px] font-bold text-[var(--color-muted)]"
                aria-label={showPassword ? 'パスワードを隠す' : 'パスワードを表示'}
              >
                {showPassword ? '非表示' : '表示'}
              </button>
            }
          />
        </div>

        <div className="px-6 pb-4 text-right">
          <Link href="/reset-password" className="text-[11px] font-bold text-[var(--color-accent)]">
            パスワードをお忘れですか？
          </Link>
        </div>

        <div className="px-6 pb-4">
          <button
            type="submit"
            disabled={loading || email.trim().length === 0 || password.length === 0}
            className="group w-full disabled:pointer-events-none disabled:opacity-60"
          >
            <div className="flex items-center justify-center gap-2 rounded-[14px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] py-3.5 text-center text-sm font-bold text-white shadow-[3px_4px_0_#000] transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_#000]">
              {loading && <Icon name="progress_activity" size={16} className="animate-spin" />}
              {loading ? 'ログイン中...' : 'ログイン'}
            </div>
          </button>
        </div>
      </form>

      <OAuthProviderButtons
        redirectPath={redirect}
        disabled={loading}
        onError={(message) => setError(message || null)}
      />

      <div className="flex items-center gap-2.5 px-6 pb-3.5 pt-1.5">
        <div className="h-px flex-1 bg-[rgba(26,26,26,0.15)]" />
        <span className="font-mono text-[10px] text-[#8a857a]">または</span>
        <div className="h-px flex-1 bg-[rgba(26,26,26,0.15)]" />
      </div>

      <div className="flex flex-col gap-2 px-6 pb-3">
        <Link
          href={`/signup?redirect=${encodeURIComponent(redirect)}`}
          className="flex items-center justify-center gap-2 rounded-[14px] border-2 border-[var(--solid-ink)] bg-white px-3 py-3 text-[13px] font-bold text-[var(--solid-ink)] shadow-[3px_4px_0_var(--solid-ink)] transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-[1px_1px_0_var(--solid-ink)]"
        >
          <Icon name="person_add" size={16} />
          新規登録する
        </Link>
      </div>

      <div className="flex-1" />
      </div>
    </>
  );
}

function LoginFallback() {
  usePageBackground('#f3f0e9');

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center bg-[#f3f0e9] font-[var(--font-body)] [background-image:radial-gradient(rgba(26,26,26,0.045)_1px,transparent_1px)] [background-size:22px_22px]">
      <Icon name="progress_activity" size={28} className="animate-spin text-[var(--solid-ink)]" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginForm />
    </Suspense>
  );
}

function FormField({
  label,
  placeholder,
  type,
  trailing,
  value,
  onChange,
  autoComplete,
  disabled,
}: {
  label: string;
  placeholder: string;
  type?: string;
  trailing?: React.ReactNode;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <div className="mb-[5px] pl-0.5 font-mono text-[9px] font-bold tracking-[0.06em] text-[#8a857a]">
        {label}
      </div>
      <div className="flex items-center gap-2 rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-3 py-[11px]">
        <input
          type={type || 'text'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          required
          autoComplete={autoComplete}
          disabled={disabled}
          className="flex-1 border-none bg-transparent text-[13px] text-[var(--solid-ink)] outline-none placeholder:text-[var(--color-muted)] disabled:opacity-60"
        />
        {trailing}
      </div>
    </label>
  );
}
