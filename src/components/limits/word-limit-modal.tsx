'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, Sparkles } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

interface WordLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCount: number;
}

export function WordLimitModal({
  isOpen,
  onClose,
  currentCount,
}: WordLimitModalProps) {
  const router = useRouter();

  const handleOrganizeWords = () => {
    onClose();
    // Navigate to first project or a word management page
    router.push('/');
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} showCloseButton={false}>
      <div className="p-6 text-center">
        {/* Icon */}
        <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-5">
          <BookOpen className="w-8 h-8 text-emerald-500" />
        </div>

        {/* Title */}
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          単語がいっぱいです
        </h2>

        {/* Description */}
        <p className="text-sm text-gray-600 mb-5">
          <span className="font-medium text-emerald-600">{currentCount}語</span>の単語を保存中です。
          <br />
          これ以上保存するには、
          <br />
          既存の単語を削除するか、
          <br />
          Proにアップグレードしてください。
        </p>

        {/* Pro upgrade card */}
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-4 mb-5">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-medium text-gray-900">Proで無制限に学習する</span>
          </div>
          <p className="text-xs text-gray-500 mb-3">月額 ¥500</p>
          <Link href="/subscription" onClick={onClose}>
            <Button className="w-full">
              Proにアップグレード
            </Button>
          </Link>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={handleOrganizeWords}
            className="flex-1 py-2.5 px-4 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm text-gray-700 transition-colors"
          >
            単語を整理する
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 px-4 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </Modal>
  );
}
