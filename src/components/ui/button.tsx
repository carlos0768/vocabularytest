'use client';

import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          'inline-flex items-center justify-center rounded-xl font-medium transition-all duration-200',
          'focus:outline-none focus:ring-2 focus:ring-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          // Variants
          variant === 'primary' &&
            'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500 active:scale-[0.98]',
          variant === 'secondary' &&
            'bg-gray-100 text-gray-900 hover:bg-gray-200 focus:ring-gray-500 active:scale-[0.98]',
          variant === 'ghost' &&
            'bg-transparent text-gray-600 hover:bg-gray-100 focus:ring-gray-400',
          variant === 'danger' &&
            'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 active:scale-[0.98]',
          // Sizes
          size === 'sm' && 'px-3 py-1.5 text-sm',
          size === 'md' && 'px-4 py-2 text-base',
          size === 'lg' && 'px-6 py-3 text-lg',
          className
        )}
        {...props}
      />
    );
  }
);

Button.displayName = 'Button';

export { Button };
