'use client';

import Link from 'next/link';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AuthCodeErrorPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-8 h-8 text-red-600" />
        </div>
        <h1 className="text-xl font-bold text-gray-900 mb-2">
          認証エラー
        </h1>
        <p className="text-gray-600 mb-6">
          認証に失敗しました。
          <br />
          認証コードの有効期限が切れているか、すでに使用されている可能性があります。
        </p>
        <div className="space-y-3">
          <Link href="/login">
            <Button className="w-full">
              ログインをやり直す
            </Button>
          </Link>
          <Link href="/">
            <Button variant="secondary" className="w-full">
              ホームに戻る
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
