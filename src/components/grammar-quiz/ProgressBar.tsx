'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface ProgressBarProps {
  current: number;
  total: number;
  className?: string;
}

export function ProgressBar({ current, total, className }: ProgressBarProps) {
  const progress = total > 0 ? (current / total) * 100 : 0;

  return (
    <div className={cn('h-1 bg-gray-200 overflow-hidden', className)}>
      <motion.div
        className="h-full bg-emerald-500"
        initial={{ width: 0 }}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      />
    </div>
  );
}
