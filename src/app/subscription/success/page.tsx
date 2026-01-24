'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';

function SuccessContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useAuth();
  const [verifying, setVerifying] = useState(true);

  useEffect(() => {
    // Refresh auth state to get updated subscription
    const verifyAndRefresh = async () => {
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait for webhook
      await refresh();
      setVerifying(false);
    };

    verifyAndRefresh();
  }, [refresh]);

  if (verifying) {
    return (
      <div className="flex flex-col items-center">
        <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mb-4" />
        <p className="text-gray-500 text-sm">決済を確認中...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm text-center">
      <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6">
        <CheckCircle className="w-8 h-8 text-emerald-600" />
      </div>

      <h1 className="text-xl font-semibold text-gray-900 mb-2">
        ようこそProプランへ！
      </h1>

      <div className="flex items-center justify-center gap-2 text-amber-500 mb-4">
        <Sparkles className="w-4 h-4" />
        <span className="text-sm font-medium">すべての機能が解放されました</span>
      </div>

      <p className="text-gray-500 text-sm mb-8">
        スキャン無制限、クラウド同期など
        <br />
        すべての機能をお楽しみください
      </p>

      <Link href="/">
        <Button className="w-full" size="lg">
          ダッシュボードへ
        </Button>
      </Link>
    </div>
  );
}

function SuccessFallback() {
  return (
    <div className="flex flex-col items-center">
      <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin mb-4" />
      <p className="text-gray-500 text-sm">読み込み中...</p>
    </div>
  );
}

export default function SubscriptionSuccessPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-white p-6">
      <Suspense fallback={<SuccessFallback />}>
        <SuccessContent />
      </Suspense>
    </div>
  );
}
