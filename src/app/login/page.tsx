'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';

function LoginForm() {
  const searchParams = useSearchParams();
  const redirect = searchParams.get('redirect') || '/';
  const { signIn } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const result = await signIn(email, password);

    if (result.success) {
      // Use hard navigation to ensure session state is fully refreshed
      window.location.href = redirect;
    } else {
      setError(result.error || 'ログインに失敗しました');
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm">
      {/* Logo */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-[var(--color-foreground)]">MERKEN</h1>
        <p className="text-[var(--color-muted)] mt-2">アカウントにログイン</p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="bg-[var(--color-surface)] rounded-[var(--radius-xl)] shadow-soft border border-[var(--color-border)] p-6">
        {error && (
          <div className="bg-[var(--color-error-light)] text-[var(--color-error)] px-4 py-3 rounded-[var(--radius-lg)] mb-4 text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[var(--color-foreground)] mb-1">
              メールアドレス
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-4 py-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-light)] outline-none transition-all bg-[var(--color-surface)]"
              placeholder="email@example.com"
            />
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-[var(--color-foreground)] mb-1">
              パスワード
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="w-full px-4 py-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-light)] outline-none transition-all pr-12 bg-[var(--color-surface)]"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
              >
                {showPassword ? <Icon name="visibility_off" size={20} /> : <Icon name="visibility" size={20} />}
              </button>
            </div>
          </div>
        </div>

        {/* Forgot password link */}
        <div className="mt-2 text-right">
          <Link href="/reset-password" className="text-sm text-[var(--color-primary)] hover:underline">
            パスワードをお忘れの方
          </Link>
        </div>

        {/* Submit */}
        <Button
          type="submit"
          disabled={loading}
          className="w-full mt-6"
          size="lg"
        >
          {loading ? (
            <>
              <Icon name="progress_activity" size={20} className="mr-2 animate-spin" />
              ログイン中...
            </>
          ) : (
            'ログイン'
          )}
        </Button>
      </form>

      {/* Sign up link */}
      <p className="text-center text-[var(--color-muted)] mt-6">
        アカウントをお持ちでない方は{' '}
        <Link href={`/signup?redirect=${encodeURIComponent(redirect)}`} className="text-[var(--color-primary)] hover:underline font-medium">
          新規登録
        </Link>
      </p>

      {/* Back to home */}
      <p className="text-center mt-4">
        <Link href="/" className="text-[var(--color-muted)] hover:text-[var(--color-foreground)] text-sm">
          ← ホームに戻る
        </Link>
      </p>
    </div>
  );
}

function LoginFormFallback() {
  return (
    <div className="w-full max-w-sm">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-[var(--color-foreground)]">MERKEN</h1>
        <p className="text-[var(--color-muted)] mt-2">アカウントにログイン</p>
      </div>
      <div className="bg-[var(--color-surface)] rounded-[var(--radius-xl)] shadow-soft border border-[var(--color-border)] p-6">
        <div className="flex items-center justify-center py-8">
          <Icon name="progress_activity" size={32} className="text-[var(--color-primary)] animate-spin" />
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--color-background)] p-4">
      <Suspense fallback={<LoginFormFallback />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
