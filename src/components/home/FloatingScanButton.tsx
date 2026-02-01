'use client';

import { Camera } from 'lucide-react';

interface FloatingScanButtonProps {
  onClick: () => void;
  disabled?: boolean;
  processing?: boolean;
}

export function FloatingScanButton({
  onClick,
  disabled = false,
  processing = false,
}: FloatingScanButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || processing}
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 w-16 h-16 flex items-center justify-center bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-peach)] text-white rounded-full shadow-glow hover:shadow-glow-lg hover:scale-110 active:scale-95 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
      aria-label="スキャン"
    >
      {processing ? (
        <div className="w-7 h-7 border-3 border-white border-t-transparent rounded-full animate-spin" />
      ) : (
        <Camera className="w-7 h-7" />
      )}
    </button>
  );
}
