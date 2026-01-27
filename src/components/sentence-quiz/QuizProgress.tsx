'use client';

import { X } from 'lucide-react';

interface QuizProgressProps {
  currentIndex: number;
  total: number;
  onClose: () => void;
}

export function QuizProgress({ currentIndex, total, onClose }: QuizProgressProps) {
  return (
    <header className="flex-shrink-0 px-3 py-2 flex items-center justify-between">
      <button
        onClick={onClose}
        className="p-1 hover:bg-gray-100 rounded-full transition-colors"
      >
        <X className="w-5 h-5" />
      </button>

      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">
          {currentIndex + 1}/{total}
        </span>
        <div className="w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-purple-600 transition-all duration-300"
            style={{
              width: `${((currentIndex + 1) / total) * 100}%`,
            }}
          />
        </div>
      </div>
    </header>
  );
}
