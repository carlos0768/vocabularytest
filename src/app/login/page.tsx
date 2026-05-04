'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/use-auth';

function LoginForm() {
  const router = useRouter();
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
    <div className="relative mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-[var(--color-background)] pt-3 font-[var(--font-body)]">
      <div className="px-[14px] pt-1">
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex h-8 w-8 items-center justify-center bg-transparent text-[var(--solid-ink)]"
          aria-label="戻る"
        >
          <Icon name="chevron_left" size={18} />
        </button>
      </div>

      <div className="px-6 pb-2 pt-6 text-center">
        <div className="inline-block font-display text-[38px] font-black leading-none tracking-[0.1em] text-[var(--solid-ink)]">
          MERKEN
          <span className="ml-[5px] inline-block h-[7px] w-[7px] -translate-y-3 bg-[var(--color-accent)]" />
        </div>
        <div className="mt-1.5 font-mono text-[10px] tracking-[0.06em] text-[var(--color-muted)]">
          単語を覚えるためのノート
        </div>
      </div>

      <div className="px-6 pb-4 pt-6">
        <div className="font-display text-2xl font-extrabold leading-[1.2] tracking-[-0.02em] text-[var(--solid-ink)]">
          ログイン
        </div>
        <div className="mt-1 text-xs text-[var(--color-muted)]">
          アカウントに接続して、続きから始める。
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-2.5 px-6 pb-3">
          {error && (
            <div className="rounded-[10px] border-[1.25px] border-[var(--color-error)] bg-[var(--color-error-light)] px-3 py-2.5 text-xs font-bold text-[var(--color-error)]">
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
            className="group relative w-full disabled:pointer-events-none disabled:opacity-60"
          >
            <div className="absolute inset-0 translate-x-[2.5px] translate-y-[2.5px] rounded-xl bg-[var(--solid-ink)] transition-transform group-active:translate-x-[1px] group-active:translate-y-[1px]" />
            <div className="relative flex items-center justify-center gap-2 rounded-xl border-[1.25px] border-[var(--solid-ink)] bg-[var(--solid-ink)] py-3.5 text-center text-sm font-bold text-white">
              {loading && <Icon name="progress_activity" size={16} className="animate-spin" />}
              {loading ? 'ログイン中...' : 'ログイン'}
            </div>
          </button>
        </div>
      </form>

      <div className="px-6 pb-3">
        <div className="rounded-[10px] border-[1.25px] border-dashed border-[var(--color-border)] bg-white/60 px-3 py-2 text-center text-[11px] leading-5 text-[var(--color-muted)]">
          Apple / Google ログインは未接続です。メールアドレスでログインしてください。
        </div>
      </div>

      <div className="flex items-center gap-2.5 px-6 pb-3.5 pt-1.5">
        <div className="h-px flex-1 bg-[var(--color-border)]" />
        <span className="font-mono text-[10px] text-[var(--color-muted)]">または</span>
        <div className="h-px flex-1 bg-[var(--color-border)]" />
      </div>

      <div className="flex flex-col gap-2 px-6 pb-3">
        <Link
          href={`/signup?redirect=${encodeURIComponent(redirect)}`}
          className="flex items-center justify-center gap-2 rounded-xl border-[1.25px] border-[var(--solid-ink)] bg-white px-3 py-3 text-[13px] font-bold text-[var(--solid-ink)] shadow-[2px_2px_0_var(--solid-ink)]"
        >
          <Icon name="person_add" size={16} />
          新規登録する
        </Link>
      </div>

      <div className="flex-1" />

      <div className="px-6 pb-8 pt-5 text-center">
        <span className="text-xs text-[var(--color-muted)]">ホームへ戻る場合は </span>
        <Link href="/" className="text-xs font-bold text-[var(--solid-ink)] underline">
          こちら
        </Link>
      </div>
    </div>
  );
}

function LoginFallback() {
  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-[480px] flex-col items-center justify-center bg-[var(--color-background)] font-[var(--font-body)]">
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
      <div className="mb-[5px] pl-0.5 font-mono text-[9px] font-bold tracking-[0.06em] text-[var(--color-muted)]">
        {label}
      </div>
      <div className="flex items-center gap-2 rounded-[10px] border-[1.25px] border-[var(--solid-ink)] bg-white px-3 py-[11px] shadow-[2px_2px_0_var(--solid-ink)]">
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
