'use client';

import { Suspense } from 'react';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Camera, Image as ImageIcon, Upload } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useWordCount } from '@/hooks/use-word-count';
import { ProgressSteps, type ProgressStep, useToast } from '@/components/ui';
import { ScanLimitModal, WordLimitModal } from '@/components/limits';
import { getDailyScanInfo, incrementScanCount, FREE_DAILY_SCAN_LIMIT } from '@/lib/utils';
import { processImageFile } from '@/lib/image-utils';
import type { AIWordExtraction } from '@/types';

function ScanPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId');
  const { isPro, loading: authLoading } = useAuth();
  const { isAtLimit } = useWordCount();
  const { showToast } = useToast();

  const [processing, setProcessing] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<ProgressStep[]>([]);
  const [scanInfo, setScanInfo] = useState({ count: 0, remaining: FREE_DAILY_SCAN_LIMIT, canScan: true });

  // Modals
  const [showScanLimitModal, setShowScanLimitModal] = useState(false);
  const [showWordLimitModal, setShowWordLimitModal] = useState(false);

  useEffect(() => {
    setScanInfo(getDailyScanInfo());
  }, []);

  const handleImageSelect = useCallback(async (file: File) => {
    // Check scan limit for free users
    if (!isPro) {
      const currentScanInfo = getDailyScanInfo();
      if (!currentScanInfo.canScan) {
        setShowScanLimitModal(true);
        return;
      }
    }

    // Check word limit for free users
    if (!isPro && isAtLimit) {
      setShowWordLimitModal(true);
      return;
    }

    // Store existing project ID for confirm page
    if (projectId) {
      sessionStorage.setItem('scanvocab_existing_project_id', projectId);
    }

    setProcessing(true);
    setProcessingSteps([
      { id: 'upload', label: '画像をアップロード中...', status: 'active' },
      { id: 'analyze', label: '文字を解析中...', status: 'pending' },
      { id: 'generate', label: '問題を作成中...', status: 'pending' },
    ]);

    try {
      // Process image (convert HEIC to JPEG if needed)
      const processedFile = await processImageFile(file);

      // Convert file to base64
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(processedFile);
      });

      setProcessingSteps((prev) =>
        prev.map((s) =>
          s.id === 'upload'
            ? { ...s, status: 'complete' }
            : s.id === 'analyze'
            ? { ...s, status: 'active' }
            : s
        )
      );

      // Call API (Pro users get example sentences)
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64, isPro }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error);
      }

      setProcessingSteps((prev) =>
        prev.map((s) =>
          s.id === 'analyze'
            ? { ...s, status: 'complete' }
            : s.id === 'generate'
            ? { ...s, status: 'active' }
            : s
        )
      );

      // Small delay for UX
      await new Promise((r) => setTimeout(r, 500));

      setProcessingSteps((prev) =>
        prev.map((s) => (s.id === 'generate' ? { ...s, status: 'complete' } : s))
      );

      // Increment scan count (only for free users)
      if (!isPro) {
        incrementScanCount();
        const newScanInfo = getDailyScanInfo();
        setScanInfo(newScanInfo);

        // Show toast when 1 scan remaining (after 4th scan)
        if (newScanInfo.remaining === 1) {
          showToast({
            message: '今日のスキャン残り1回。Proなら無制限',
            type: 'warning',
            action: {
              label: '詳しく',
              onClick: () => router.push('/subscription'),
            },
            duration: 4000,
          });
        }
      }

      // Store extracted words temporarily
      const words: AIWordExtraction[] = result.words;
      sessionStorage.setItem('scanvocab_extracted_words', JSON.stringify(words));

      // Navigate to confirm page
      router.push('/scan/confirm');
    } catch (error) {
      console.error('Scan error:', error);
      setProcessingSteps((prev) =>
        prev.map((s) =>
          s.status === 'active' || s.status === 'pending'
            ? {
                ...s,
                status: 'error',
                label:
                  error instanceof Error
                    ? error.message
                    : '予期しないエラーが発生しました',
              }
            : s
        )
      );
    }
  }, [isPro, isAtLimit, projectId, router, showToast]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleImageSelect(file);
    }
  };

  const handleCloseModal = () => {
    setProcessing(false);
    setProcessingSteps([]);
  };

  const canScan = isPro || scanInfo.canScan;

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 bg-white/95 backdrop-blur-sm z-40 border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="p-1.5 -ml-1.5 hover:bg-gray-100 rounded-md transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <h1 className="text-lg font-semibold text-gray-900">
              {projectId ? '単語を追加' : '新しいスキャン'}
            </h1>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-lg mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Camera className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            ノートやプリントを撮影
          </h2>
          <p className="text-gray-500 text-sm">
            英単語を自動で抽出して
            <br />
            クイズ問題を作成します
          </p>
        </div>

        {/* Upload options */}
        <div className="space-y-3">
          {/* Camera capture */}
          <label className="flex items-center gap-4 p-4 bg-blue-50 rounded-xl cursor-pointer hover:bg-blue-100 transition-colors">
            <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center shrink-0">
              <Camera className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium text-gray-900">カメラで撮影</p>
              <p className="text-sm text-gray-500">その場で撮影して追加</p>
            </div>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              disabled={processing || !canScan}
              className="hidden"
            />
          </label>

          {/* Photo library */}
          <label className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
            <div className="w-12 h-12 bg-gray-600 rounded-full flex items-center justify-center shrink-0">
              <ImageIcon className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium text-gray-900">写真を選択</p>
              <p className="text-sm text-gray-500">カメラロールから選ぶ</p>
            </div>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              disabled={processing || !canScan}
              className="hidden"
            />
          </label>
        </div>

        {/* Scan count info */}
        {!isPro && (
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              今日のスキャン: {scanInfo.count}/{FREE_DAILY_SCAN_LIMIT}
            </p>
          </div>
        )}
      </main>

      {/* Processing modal */}
      {processing && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-lg">
            <h2 className="text-base font-medium mb-4 text-center text-gray-900">
              {processingSteps.some((s) => s.status === 'error') ? 'エラーが発生しました' : '解析中'}
            </h2>
            <ProgressSteps steps={processingSteps} />
            {processingSteps.some((s) => s.status === 'error') && (
              <button
                onClick={handleCloseModal}
                className="mt-4 w-full py-2 bg-gray-100 rounded-lg text-gray-700 text-sm hover:bg-gray-200 transition-colors"
              >
                閉じる
              </button>
            )}
          </div>
        </div>
      )}

      {/* Scan limit modal */}
      <ScanLimitModal
        isOpen={showScanLimitModal}
        onClose={() => setShowScanLimitModal(false)}
        todayWordsLearned={0}
      />

      {/* Word limit modal */}
      <WordLimitModal
        isOpen={showWordLimitModal}
        onClose={() => setShowWordLimitModal(false)}
        currentCount={0}
      />
    </div>
  );
}

export default function ScanPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
      </div>
    }>
      <ScanPageContent />
    </Suspense>
  );
}
