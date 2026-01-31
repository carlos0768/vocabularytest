'use client';

import { Suspense } from 'react';
import { useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Camera } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useWordCount } from '@/hooks/use-word-count';
import { ProgressSteps, type ProgressStep, useToast } from '@/components/ui';
import { ScanLimitModal, WordLimitModal } from '@/components/limits';
import { FREE_DAILY_SCAN_LIMIT } from '@/lib/utils';
import { processImageToBase64 } from '@/lib/image-utils';


function ScanPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId');
  const { isPro, isAuthenticated } = useAuth();
  const { isAtLimit } = useWordCount();
  const { showToast } = useToast();

  const [processing, setProcessing] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<ProgressStep[]>([]);
  const [scanInfo, setScanInfo] = useState<{ currentCount: number; limit: number | null; isPro: boolean } | null>(null);

  // Modals
  const [showScanLimitModal, setShowScanLimitModal] = useState(false);
  const [showWordLimitModal, setShowWordLimitModal] = useState(false);

  const handleMultipleImages = useCallback(async (files: File[]) => {
    if (!isAuthenticated) {
      showToast({
        message: 'ログインが必要です',
        type: 'error',
        action: {
          label: 'ログイン',
          onClick: () => router.push('/login'),
        },
        duration: 4000,
      });
      return;
    }

    if (!isPro && isAtLimit) {
      setShowWordLimitModal(true);
      return;
    }

    const totalFiles = files.length;
    setProcessing(true);

    // Initialize steps for multiple files
    const initialSteps: ProgressStep[] = files.map((_, index) => ({
      id: `file-${index}`,
      label: `画像 ${index + 1}/${totalFiles} を処理中...`,
      status: index === 0 ? 'active' : 'pending',
    }));
    setProcessingSteps(initialSteps);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allWords: any[] = [];
      let lastScanInfo = null;

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Update current step to active
        setProcessingSteps(prev => prev.map((s, idx) => ({
          ...s,
          status: idx < i ? 'complete' : idx === i ? 'active' : 'pending',
          label: idx === i ? `画像 ${i + 1}/${totalFiles} を処理中...` : s.label,
        })));

        const base64 = await processImageToBase64(file);

        const response = await fetch('/api/extract', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: base64,
            mode: 'all',
          }),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          if (result.limitReached) {
            setProcessing(false);
            setProcessingSteps([]);
            setScanInfo(result.scanInfo);
            setShowScanLimitModal(true);
            return;
          }
          // Continue with other files even if one fails
          console.error(`Failed to process file ${i + 1}:`, result.error);
          setProcessingSteps(prev => prev.map((s, idx) => ({
            ...s,
            status: idx === i ? 'error' : s.status,
            label: idx === i ? `画像 ${i + 1}: エラー` : s.label,
          })));
          continue;
        }

        if (result.scanInfo) {
          lastScanInfo = result.scanInfo;
        }

        // Merge words from this file
        allWords.push(...result.words);

        // Mark current step as complete
        setProcessingSteps(prev => prev.map((s, idx) => ({
          ...s,
          status: idx === i ? 'complete' : s.status,
          label: idx === i ? `画像 ${i + 1}/${totalFiles} 完了` : s.label,
        })));
      }

      if (lastScanInfo) {
        setScanInfo(lastScanInfo);
      }

      if (allWords.length === 0) {
        throw new Error('画像から単語を読み取れませんでした');
      }

      // Save merged results to sessionStorage
      sessionStorage.setItem('scanvocab_extracted_words', JSON.stringify(allWords));
      if (projectId) {
        sessionStorage.setItem('scanvocab_existing_project_id', projectId);
      }

      setProcessingSteps(prev => [
        ...prev.map(s => ({ ...s, status: 'complete' as const })),
        { id: 'navigate', label: '結果を表示中...', status: 'active' },
      ]);

      await new Promise(resolve => setTimeout(resolve, 100));
      router.replace('/scan/confirm');
    } catch (error) {
      console.error('Scan error:', error);
      setProcessing(false);
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
  }, [isPro, isAuthenticated, isAtLimit, projectId, router, showToast]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleMultipleImages(Array.from(files));
    }
    // Reset input value to allow selecting the same file again
    e.target.value = '';
  };

  const handleCloseModal = () => {
    setProcessing(false);
    setProcessingSteps([]);
  };

  const canScan = isAuthenticated;

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

        {/* Upload option - single button that shows iOS native picker */}
        <div className="space-y-3">
          <label className="flex items-center gap-4 p-4 bg-blue-50 rounded-xl cursor-pointer hover:bg-blue-100 transition-colors">
            <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center shrink-0">
              <Camera className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium text-gray-900">写真を撮影・選択</p>
              <p className="text-sm text-gray-500">カメラまたはフォルダから</p>
            </div>
            <input
              type="file"
              accept="image/*,.pdf,application/pdf"
              multiple
              onChange={handleFileChange}
              disabled={processing || !canScan}
              className="hidden"
            />
          </label>
        </div>

        {/* Scan count info */}
        {!isPro && scanInfo && scanInfo.limit && (
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              今日のスキャン: {scanInfo.currentCount}/{scanInfo.limit}
            </p>
          </div>
        )}
        {!isPro && !scanInfo && (
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              無料プラン: 1日{FREE_DAILY_SCAN_LIMIT}回までスキャン可能
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
            {!processingSteps.some((s) => s.status === 'error') && (
              <p className="mt-4 text-xs text-gray-500 text-center">
                しばらくお待ちください...
              </p>
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
