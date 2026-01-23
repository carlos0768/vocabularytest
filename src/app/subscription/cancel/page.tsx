'use client';

import Link from 'next/link';
import { XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function SubscriptionCancelPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm text-center">
        <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <XCircle className="w-10 h-10 text-gray-400" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          決済がキャンセルされました
        </h1>

        <p className="text-gray-600 mb-8">
          決済は完了していません。
          <br />
          いつでも再度お試しいただけます。
        </p>

        <div className="space-y-3">
          <Link href="/subscription">
            <Button className="w-full" size="lg">
              プラン選択に戻る
            </Button>
          </Link>
          <Link href="/">
            <Button variant="secondary" className="w-full">
              ダッシュボードへ
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
