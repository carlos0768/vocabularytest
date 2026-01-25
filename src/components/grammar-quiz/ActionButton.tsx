'use client';

import { motion } from 'framer-motion';
import { ChevronRight, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ActionButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'success' | 'neutral';
  showNextIcon?: boolean;
  showCheckIcon?: boolean;
  className?: string;
}

const variantStyles = {
  primary: 'bg-blue-600 hover:bg-blue-700 text-white',
  success: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  neutral: 'bg-gray-600 hover:bg-gray-700 text-white',
};

export function ActionButton({
  label,
  onClick,
  disabled = false,
  variant = 'primary',
  showNextIcon = false,
  showCheckIcon = false,
  className,
}: ActionButtonProps) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'w-full h-14 rounded-2xl font-semibold text-base',
        'flex items-center justify-center gap-2',
        'transition-colors duration-150',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variantStyles[variant],
        className
      )}
      whileTap={disabled ? undefined : { scale: 0.98 }}
    >
      {showCheckIcon && <Check className="w-5 h-5" />}
      {label}
      {showNextIcon && <ChevronRight className="w-5 h-5" />}
    </motion.button>
  );
}
