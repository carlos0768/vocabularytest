'use client';

import { X } from 'lucide-react';

interface QuizProgressProps {
  currentIndex: number;
  total: number;
  onClose: () => void;
}

export function QuizProgress({ currentIndex, total, onClose }: QuizProgressProps) {
  return (
    <header className="flex-shrink-0 p-4 flex items-center justify-between">
      <button
        onClick={onClose}
        className="p-2 hover:bg-gray-100 rounded-full transition-colors"
      >
        <X className="w-6 h-6" />
      </button>

      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500">
          {currentIndex + 1} / {total}
        </span>
        <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
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
