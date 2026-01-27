'use client';

import { Loader2 } from 'lucide-react';

export function LoadingScreen() {
  return (
    <div className="h-screen flex items-center justify-center bg-gray-50 overflow-hidden">
      <div className="text-center">
        <div className="relative mb-6">
          <Loader2 className="w-16 h-16 text-purple-600 animate-spin mx-auto" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          問題を構築中...
        </h2>
        <p className="text-gray-500">
          単語から例文を生成しています
        </p>
      </div>
    </div>
  );
}
