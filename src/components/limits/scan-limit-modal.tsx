'use client';

import Link from 'next/link';
import { Camera, Sparkles } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { FREE_DAILY_SCAN_LIMIT } from '@/lib/utils';

interface ScanLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  todayWordsLearned?: number;
}

export function ScanLimitModal({
  isOpen,
  onClose,
  todayWordsLearned = 0,
}: ScanLimitModalProps) {
  // Calculate reset time (next midnight)
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  return (
    <Modal isOpen={isOpen} onClose={onClose} showCloseButton={false}>
      <div className="p-6 text-center">
        {/* Icon */}
        <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-5">
          <Camera className="w-8 h-8 text-blue-500" />
        </div>

        {/* Title */}
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          今日のスキャンを使い切りました
        </h2>

        {/* Achievement message */}
        {todayWordsLearned > 0 && (
          <p className="text-sm text-gray-600 mb-5">
            今日は{FREE_DAILY_SCAN_LIMIT}回のスキャンで
            <br />
            <span className="font-medium text-blue-600">{todayWordsLearned}語</span>の単語を学習しました!
          </p>
        )}

        {/* Pro upgrade card */}
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 mb-5">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-medium text-gray-900">Proなら無制限でスキャン</span>
          </div>
          <p className="text-xs text-gray-500 mb-3">月額 ¥500</p>
          <Link href="/subscription" onClick={onClose}>
            <Button className="w-full">
              Proにアップグレード
            </Button>
          </Link>
        </div>

        {/* Tomorrow message */}
        <p className="text-sm text-gray-500 mb-1">
          明日またスキャンできます
        </p>
        <p className="text-xs text-gray-400 mb-4">
          リセット: 0:00
        </p>

        {/* Close button - prominent and clear */}
        <button
          onClick={onClose}
          className="text-sm text-gray-500 hover:text-gray-700 transition-colors py-2 px-4"
        >
          閉じる
        </button>
      </div>
    </Modal>
  );
}
