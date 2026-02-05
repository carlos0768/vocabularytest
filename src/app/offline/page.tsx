'use client';

import { WifiOff, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function OfflinePage() {
  const handleRetry = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[var(--color-background)]">
      <div className="text-center max-w-sm">
        <div className="w-20 h-20 bg-[var(--color-muted)]/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <WifiOff className="w-10 h-10 text-[var(--color-muted)]" />
        </div>

        <h1 className="text-2xl font-bold text-[var(--color-foreground)] mb-2">
          オフラインです
        </h1>

        <p className="text-[var(--color-muted)] mb-8">
          インターネット接続を確認してください。
          接続が回復したら、このページを更新してください。
        </p>

        <Button onClick={handleRetry} size="lg" className="w-full">
          <RefreshCw className="w-5 h-5 mr-2" />
          再読み込み
        </Button>
      </div>
    </div>
  );
}
