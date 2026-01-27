'use client';

import { Loader2 } from 'lucide-react';

export function LoadingScreen() {
  return (
    <div className="h-screen flex items-center justify-center bg-gray-50 overflow-hidden">
      <Loader2 className="w-12 h-12 text-purple-600 animate-spin" />
    </div>
  );
}
