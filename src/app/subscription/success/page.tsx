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
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
        <p className="text-gray-600">決済を確認中...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm text-center">
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
        <CheckCircle className="w-10 h-10 text-green-600" />
      </div>

      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        ようこそProプランへ！
      </h1>

      <div className="flex items-center justify-center gap-2 text-yellow-600 mb-4">
        <Sparkles className="w-5 h-5" />
        <span className="font-medium">すべての機能が解放されました</span>
      </div>

      <p className="text-gray-600 mb-8">
        スキャン無制限、クラウド同期など
        <br />
        すべての機能をお楽しみください
      </p>

      <div className="space-y-3">
        <Link href="/">
          <Button className="w-full" size="lg">
            ダッシュボードへ
          </Button>
        </Link>
      </div>
    </div>
  );
}

function SuccessFallback() {
  return (
    <div className="flex flex-col items-center">
      <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
      <p className="text-gray-600">読み込み中...</p>
    </div>
  );
}

export default function SubscriptionSuccessPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <Suspense fallback={<SuccessFallback />}>
        <SuccessContent />
      </Suspense>
    </div>
  );
}
