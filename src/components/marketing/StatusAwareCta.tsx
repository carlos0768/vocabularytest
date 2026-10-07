'use client';

import { useRouter } from 'next/navigation';
import { Button, type ButtonProps } from '@/components/ui/button';
import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/use-auth';
import { NEW_USER_SIGNUP_ENABLED } from '@/lib/auth/signup-feature-flag';
import { cn } from '@/lib/utils';

interface StatusAwareCtaProps {
  guestLabel: string;
  authLabel?: string;
  guestHref?: string;
  authHref?: string;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  icon?: string;
  className?: string;
}

export function StatusAwareCta({
  guestLabel,
  authLabel,
  guestHref = '/signup',
  authHref = '/',
  variant = 'primary',
  size = 'md',
  icon = 'arrow_forward',
  className,
}: StatusAwareCtaProps) {
  const router = useRouter();
  const { isAuthenticated, loading } = useAuth();

  // 新規受付停止中は、ゲストを /signup ではなくログインへ案内する
  const effectiveGuestLabel = NEW_USER_SIGNUP_ENABLED ? guestLabel : 'ログイン';
  const effectiveGuestHref = NEW_USER_SIGNUP_ENABLED ? guestHref : '/login';
  const label = isAuthenticated ? (authLabel ?? guestLabel) : effectiveGuestLabel;
  const href = isAuthenticated ? authHref : effectiveGuestHref;

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={loading}
      onClick={() => router.push(href)}
      className={cn(className)}
    >
      <span>{loading ? '読み込み中...' : label}</span>
      {!loading && <Icon name={icon} size={18} className="ml-2" />}
    </Button>
  );
}
