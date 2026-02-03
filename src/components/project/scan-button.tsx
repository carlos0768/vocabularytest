'use client';

import { Plus, Camera } from 'lucide-react';
import { useRef } from 'react';

interface ScanButtonProps {
  onImageSelect: (file: File) => void;
  disabled?: boolean;
}

// Floating Action Button for scanning/uploading images
export function ScanButton({ onImageSelect, disabled }: ScanButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImageSelect(file);
      // Reset input for re-selection of same file
      e.target.value = '';
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.heic,.heif"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={disabled}
        className="fixed bottom-24 right-6 w-14 h-14 bg-[var(--color-primary)] text-white rounded-full shadow-glow
          flex items-center justify-center
          hover:bg-[var(--color-primary-dark)] hover:scale-105
          active:scale-95
          transition-all duration-200
          disabled:opacity-50 disabled:cursor-not-allowed
          z-50"
        aria-label="画像をスキャン"
      >
        <div className="relative">
          <Camera className="w-6 h-6" />
          <Plus className="w-3 h-3 absolute -top-1 -right-1 bg-[var(--color-primary-dark)] rounded-full" />
        </div>
      </button>
    </>
  );
}
