'use client';

import { Suspense } from 'react';
import { useState, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Camera, Image as ImageIcon, CircleDot, Highlighter, BookOpen, Languages, AlertTriangle, Sparkles } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useWordCount } from '@/hooks/use-word-count';
import { ProgressSteps, type ProgressStep, useToast } from '@/components/ui';
import { ScanLimitModal, WordLimitModal } from '@/components/limits';
import { FREE_DAILY_SCAN_LIMIT } from '@/lib/utils';
import type { ExtractMode, EikenLevel } from '@/app/api/extract/route';
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
  const [selectedMode, setSelectedMode] = useState<ExtractMode>('all');
  const [selectedEiken, setSelectedEiken] = useState<EikenLevel>(null);

  // Modals
  const [showScanLimitModal, setShowScanLimitModal] = useState(false);
  const [showWordLimitModal, setShowWordLimitModal] = useState(false);

  const scanModes = [
    {
      id: 'all' as ExtractMode,
      title: 'すべての単語',
      description: '写真内の英単語をすべて抽出',
      icon: Camera,
      pro: false,
    },
    {
      id: 'circled' as ExtractMode,
      title: '丸で囲んだ単語',
      description: 'マークした単語だけを抽出',
      icon: CircleDot,
      pro: true,
    },
    {
      id: 'highlighted' as ExtractMode,
      title: 'ハイライト単語',
      description: '蛍光ペンで塗った単語を抽出',
      icon: Highlighter,
      pro: true,
    },
    {
      id: 'eiken' as ExtractMode,
      title: '英検レベル',
      description: '指定した級の単語だけを抽出',
      icon: BookOpen,
      pro: true,
    },
    {
      id: 'idiom' as ExtractMode,
      title: '熟語・イディオム',
      description: '句動詞や熟語だけを抽出',
      icon: Languages,
      pro: true,
    },
    {
      id: 'wrong' as ExtractMode,
      title: '間違えた単語',
      description: 'テストの間違いを抽出',
      icon: AlertTriangle,
      pro: true,
    },
  ];

  const handleSelectMode = (mode: (typeof scanModes)[number]) => {
    if (mode.pro && !isPro) {
      showToast({
        message: 'このスキャンモードはProプラン限定です',
        type: 'warning',
        action: { label: 'アップグレード', onClick: () => router.push('/subscription') },
        duration: 4000,
      });
      return;
    }
    setSelectedMode(mode.id);
  };

  useEffect(() => {
    if (selectedMode !== 'eiken') {
      setSelectedEiken(null);
    }
  }, [selectedMode]);

  const handleMultipleImages = useCallback(async (files: File[]) => {
    const requiresPro = ['circled', 'highlighted', 'eiken', 'idiom', 'wrong'].includes(selectedMode);
    if (requiresPro && !isPro) {
      showToast({
        message: 'このスキャンモードはProプラン限定です',
        type: 'warning',
        action: { label: 'アップグレード', onClick: () => router.push('/subscription') },
        duration: 4000,
      });
      return;
    }

    if (selectedMode === 'eiken' && !selectedEiken) {
      showToast({ message: '英検レベルを選択してください', type: 'warning' });
      return;
    }

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
            mode: selectedMode,
            eikenLevel: selectedMode === 'eiken' ? selectedEiken : null,
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
  }, [isPro, isAuthenticated, isAtLimit, projectId, router, showToast, selectedMode, selectedEiken]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      // Filter to only allow images and PDFs
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif', 'application/pdf'];
      const validFiles = Array.from(files).filter(file => 
        allowedTypes.includes(file.type) || file.name.match(/\.(jpg|jpeg|png|gif|webp|heic|heif|pdf)$/i)
      );
      
      if (validFiles.length === 0) {
        showToast({
          message: '画像またはPDFファイルを選択してください',
          type: 'error',
          duration: 3000,
        });
        e.target.value = '';
        return;
      }
      
      handleMultipleImages(validFiles);
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
    <div className="min-h-screen bg-[var(--color-background)] pb-20">
      {/* Header */}
      <header className="sticky top-0 bg-[var(--color-background)]/95 z-40 border-b border-[var(--color-border-light)]">
        <div className="max-w-lg mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="w-10 h-10 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-center"
            >
              <ArrowLeft className="w-5 h-5 text-[var(--color-muted)]" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-[var(--color-foreground)]">
                {projectId ? '単語を追加' : '新しいスキャン'}
              </h1>
              <p className="text-xs text-[var(--color-muted)]">モードを選んで撮影/アップロード</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
        <div className="card p-5 flex items-center gap-4">
          <div className="w-12 h-12 bg-[var(--color-peach-light)] rounded-full flex items-center justify-center">
            <Camera className="w-6 h-6 text-[var(--color-primary)]" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-foreground)]">ノートやプリントを撮影</h2>
            <p className="text-sm text-[var(--color-muted)]">英単語を自動で抽出してクイズを作成します</p>
          </div>
        </div>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--color-muted)]">抽出モード</h3>
            {!isPro && (
              <span className="chip chip-pro">
                <Sparkles className="w-3 h-3" />
                Pro
              </span>
            )}
          </div>
          <div className="space-y-3">
            {scanModes.map((mode) => {
              const Icon = mode.icon;
              const isSelected = selectedMode === mode.id;
              const isLocked = mode.pro && !isPro;
              return (
                <button
                  key={mode.id}
                  onClick={() => handleSelectMode(mode)}
                  className={`w-full flex items-center gap-4 p-4 border rounded-[var(--radius-lg)] text-left transition-all ${
                    isSelected
                      ? 'border-[var(--color-primary)] bg-[var(--color-peach-light)]'
                      : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                  } ${isLocked ? 'opacity-60' : 'hover:shadow-card'}`}
                >
                  <div className="w-10 h-10 rounded-full bg-[var(--color-border-light)] flex items-center justify-center">
                    <Icon className="w-5 h-5 text-[var(--color-foreground)]" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-[var(--color-foreground)]">{mode.title}</p>
                      {mode.pro && !isPro && (
                        <span className="chip chip-pro">
                          <Sparkles className="w-3 h-3" />
                          Pro
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[var(--color-muted)]">{mode.description}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {selectedMode === 'eiken' && (
            <div className="card p-4">
              <label className="text-sm font-semibold text-[var(--color-foreground)]">英検レベル</label>
              <select
                value={selectedEiken ?? ''}
                onChange={(e) => setSelectedEiken(e.target.value as EikenLevel)}
                className="mt-3 w-full px-3 py-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)]"
              >
                <option value="">レベルを選択</option>
                <option value="5">5級</option>
                <option value="4">4級</option>
                <option value="3">3級</option>
                <option value="pre2">準2級</option>
                <option value="2">2級</option>
                <option value="pre1">準1級</option>
                <option value="1">1級</option>
              </select>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <label className="flex items-center gap-4 p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] cursor-pointer hover:shadow-card transition-colors">
            <div className="w-12 h-12 bg-[var(--color-primary)] rounded-full flex items-center justify-center shrink-0">
              <Camera className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium text-[var(--color-foreground)]">カメラで撮影</p>
              <p className="text-sm text-[var(--color-muted)]">その場で撮影して追加</p>
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

          <label className="flex items-center gap-4 p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-[var(--radius-lg)] cursor-pointer hover:shadow-card transition-colors">
            <div className="w-12 h-12 bg-[var(--color-muted)] rounded-full flex items-center justify-center shrink-0">
              <ImageIcon className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 text-left">
              <p className="font-medium text-[var(--color-foreground)]">写真・PDFを選択</p>
              <p className="text-sm text-[var(--color-muted)]">フォルダから選ぶ（複数可）</p>
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
        </section>

        {!isPro && scanInfo && scanInfo.limit && (
          <p className="text-xs text-center text-[var(--color-muted)]">
            今日のスキャン: {scanInfo.currentCount}/{scanInfo.limit}
          </p>
        )}
        {!isPro && !scanInfo && (
          <p className="text-xs text-center text-[var(--color-muted)]">
            無料プラン: 1日{FREE_DAILY_SCAN_LIMIT}回までスキャン可能
          </p>
        )}
      </main>

      {/* Processing modal */}
      {processing && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-sm">
            <h2 className="text-base font-medium mb-4 text-center text-[var(--color-foreground)]">
              {processingSteps.some((s) => s.status === 'error') ? 'エラーが発生しました' : '解析中'}
            </h2>
            <ProgressSteps steps={processingSteps} />
            {processingSteps.some((s) => s.status === 'error') && (
              <button
                onClick={handleCloseModal}
                className="mt-4 w-full py-2 bg-[var(--color-border-light)] rounded-[var(--radius-md)] text-[var(--color-foreground)] text-sm hover:bg-[var(--color-peach-light)] transition-colors"
              >
                閉じる
              </button>
            )}
            {!processingSteps.some((s) => s.status === 'error') && (
              <p className="mt-4 text-xs text-[var(--color-muted)] text-center">
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
        <div className="w-8 h-8 border-2 border-[var(--color-border)] border-t-[var(--color-primary)] rounded-full animate-spin" />
      </div>
    }>
      <ScanPageContent />
    </Suspense>
  );
}
