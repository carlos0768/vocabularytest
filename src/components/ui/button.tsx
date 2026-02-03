'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg' | 'icon';
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          'inline-flex items-center justify-center font-semibold transition-all duration-200',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none',
          // Variants
          variant === 'primary' && [
            'bg-gradient-to-br from-[#FF6B6B] to-[#FFB347] text-white',
            'rounded-full shadow-glow',
            'hover:shadow-glow-lg hover:-translate-y-0.5',
            'active:translate-y-0 active:scale-[0.98]',
            'focus-visible:ring-[#FF6B6B]',
          ],
          variant === 'secondary' && [
            'bg-[var(--color-surface)] text-[var(--color-foreground)]',
            'rounded-full border border-[var(--color-border)]',
            'hover:border-[var(--color-primary)] hover:bg-[var(--color-peach-light)]',
            'active:scale-[0.98]',
            'focus-visible:ring-[var(--color-primary)]',
          ],
          variant === 'ghost' && [
            'bg-transparent text-[var(--color-muted)]',
            'rounded-full',
            'hover:bg-black/5 dark:hover:bg-white/10 hover:text-[var(--color-foreground)]',
            'focus-visible:ring-[var(--color-muted)]',
          ],
          variant === 'danger' && [
            'bg-[var(--color-error)] text-white',
            'rounded-full shadow-soft',
            'hover:bg-[#FF6B6B] hover:-translate-y-0.5',
            'active:translate-y-0 active:scale-[0.98]',
            'focus-visible:ring-[var(--color-error)]',
          ],
          // Sizes
          size === 'sm' && 'px-4 py-2 text-sm',
          size === 'md' && 'px-5 py-2.5 text-base',
          size === 'lg' && 'h-14 px-8 text-lg',
          size === 'icon' && 'w-10 h-10 p-0',
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';

export { Button };
