'use client';

import { Suspense } from 'react';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useWordCount } from '@/hooks/use-word-count';
import { ProgressSteps, type ProgressStep, useToast, Icon, AppShell } from '@/components/ui';
import { ScanLimitModal, WordLimitModal } from '@/components/limits';
import { FREE_DAILY_SCAN_LIMIT } from '@/lib/utils';
import type { ExtractMode, EikenLevel } from '@/app/api/extract/route';
import { processImageToBase64 } from '@/lib/image-utils';
import { createBrowserClient } from '@/lib/supabase';


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
  const [inputMode, setInputMode] = useState<'camera' | 'upload'>('camera');
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // Modals
  const [showScanLimitModal, setShowScanLimitModal] = useState(false);
  const [showWordLimitModal, setShowWordLimitModal] = useState(false);
  
  // Background scan state
  const [showProjectNameModal, setShowProjectNameModal] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);

  const scanModes = [
    {
      id: 'all' as ExtractMode,
      title: 'すべての単語',
      description: '写真内の英単語をすべて抽出',
      icon: 'center_focus_weak',
      pro: false,
    },
    {
      id: 'circled' as ExtractMode,
      title: '丸で囲んだ単語',
      description: 'マークした単語だけを抽出',
      icon: 'radio_button_checked',
      pro: true,
    },
    {
      id: 'highlighted' as ExtractMode,
      title: 'ハイライト単語',
      description: '蛍光ペンで塗った単語を抽出',
      icon: 'highlight',
      pro: true,
    },
    {
      id: 'eiken' as ExtractMode,
      title: '英検レベル',
      description: '指定した級の単語だけを抽出',
      icon: 'menu_book',
      pro: true,
    },
    {
      id: 'idiom' as ExtractMode,
      title: '熟語・イディオム',
      description: '句動詞や熟語だけを抽出',
      icon: 'translate',
      pro: true,
    },
    {
      id: 'wrong' as ExtractMode,
      title: '間違えた単語',
      description: 'テストの間違いを抽出',
      icon: 'warning',
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

  // Compress image for fast upload (always compress, target 500KB)
  const compressForUpload = useCallback(async (file: File): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        
        // Target max dimension 1600px (good enough for OCR, much smaller file)
        const MAX_DIM = 1600;
        let { width, height } = img;
        
        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx?.drawImage(img, 0, 0, width, height);

        // Compress to JPEG with quality 0.7
        canvas.toBlob(
          (blob) => {
            if (blob) {
              console.log(`Compressed: ${file.size} -> ${blob.size} (${Math.round(blob.size / file.size * 100)}%)`);
              resolve(blob);
            } else {
              reject(new Error('Compression failed'));
            }
          },
          'image/jpeg',
          0.7
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to load image'));
      };

      img.src = objectUrl;
    });
  }, []);

  // Background upload for Pro users - Direct to Supabase Storage
  // Uploads ALL images first, then creates a single scan job with all image paths
  const handleBackgroundUpload = useCallback(async (files: File[], name: string) => {
    setUploading(true);

    try {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      const { data: { user } } = await supabase.auth.getUser();

      if (!session?.access_token || !user) {
        throw new Error('認証が必要です');
      }

      // 1. Upload all images first
      const uploadedPaths: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const compressedBlob = await compressForUpload(file);

        const timestamp = Date.now() + i; // Ensure unique timestamps
        const imagePath = `${user.id}/${timestamp}.jpg`;

        const { error: uploadError } = await supabase.storage
          .from('scan-images')
          .upload(imagePath, compressedBlob, {
            contentType: 'image/jpeg',
            upsert: false,
          });

        if (uploadError) {
          console.error('Storage upload error:', uploadError);
          // Clean up already uploaded images
          if (uploadedPaths.length > 0) {
            await supabase.storage.from('scan-images').remove(uploadedPaths);
          }
          throw new Error('画像のアップロードに失敗しました');
        }
        uploadedPaths.push(imagePath);
      }

      // 2. Create a single scan job with all image paths
      const response = await fetch('/api/scan-jobs/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          imagePaths: uploadedPaths,
          projectTitle: name,
          scanMode: selectedMode,
          eikenLevel: selectedMode === 'eiken' ? selectedEiken : null,
        }),
      });

      if (!response.ok) {
        // Clean up uploaded images
        await supabase.storage.from('scan-images').remove(uploadedPaths);
        const error = await response.json();
        throw new Error(error.error || 'ジョブの作成に失敗しました');
      }

      showToast({
        message: `${files.length > 1 ? `${files.length}枚の画像の` : ''}スキャンを開始しました`,
        type: 'success',
        duration: 3000,
      });

      // Go back to home
      router.push('/');
    } catch (error) {
      console.error('Background upload error:', error);
      showToast({
        message: error instanceof Error ? error.message : 'アップロードに失敗しました',
        type: 'error',
        duration: 4000,
      });
    } finally {
      setUploading(false);
      setShowProjectNameModal(false);
      setPendingFiles([]);
      setProjectName('');
    }
  }, [selectedMode, selectedEiken, router, showToast, compressForUpload]);

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

    // Pro users: use background processing
    if (isPro) {
      // If adding to existing project, use traditional flow
      if (projectId) {
        // Fall through to traditional flow
      } else {
        // New project: show project name modal and use background upload
        const now = new Date();
        const defaultName = `スキャン ${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
        setProjectName(defaultName);
        setPendingFiles(files);
        setShowProjectNameModal(true);
        return;
      }
    }

    // Free users or adding to existing project: use traditional flow
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
  }, [isPro, isAuthenticated, isAtLimit, projectId, router, showToast, selectedMode, selectedEiken, handleBackgroundUpload]);

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

  const modeColors: Record<string, { bg: string; icon: string; border: string }> = {
    all: { bg: 'bg-[var(--color-primary)]/10', icon: 'text-[var(--color-primary)]', border: 'border-[var(--color-primary)]' },
    circled: { bg: 'bg-[var(--color-warning)]/10', icon: 'text-[var(--color-warning)]', border: 'border-[var(--color-warning)]' },
    highlighted: { bg: 'bg-purple-500/10', icon: 'text-purple-500', border: 'border-purple-500' },
    eiken: { bg: 'bg-[var(--color-success)]/10', icon: 'text-[var(--color-success)]', border: 'border-[var(--color-success)]' },
    idiom: { bg: 'bg-cyan-500/10', icon: 'text-cyan-500', border: 'border-cyan-500' },
    wrong: { bg: 'bg-[var(--color-error)]/10', icon: 'text-[var(--color-error)]', border: 'border-[var(--color-error)]' },
  };

  return (
    <AppShell>
      <div className="pb-28 lg:pb-8">
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          disabled={processing || !canScan}
          className="hidden"
        />
        <input
          ref={uploadInputRef}
          type="file"
          accept="image/*,.pdf,application/pdf"
          multiple
          onChange={handleFileChange}
          disabled={processing || !canScan}
          className="hidden"
        />

        <main className="max-w-2xl mx-auto px-4 lg:px-8 py-6 space-y-6">
          {/* Hero Upload Area */}
          <section
            className="relative rounded-2xl border-2 border-dashed border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center cursor-pointer hover:border-[var(--color-primary)] hover:bg-[var(--color-primary-light)] transition-all group"
            onClick={() => uploadInputRef.current?.click()}
          >
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center group-hover:bg-[var(--color-primary)]/20 transition-colors">
              <Icon name="photo_camera" size={32} className="text-[var(--color-primary)]" />
            </div>
            <h1 className="text-lg font-bold text-[var(--color-foreground)] mb-1">
              {projectId ? '単語を追加' : '写真から単語を抽出'}
            </h1>
            <p className="text-sm text-[var(--color-muted)] mb-4">
              タップして写真を選択、またはカメラで撮影
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  cameraInputRef.current?.click();
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary)] text-white rounded-full text-sm font-semibold hover:bg-[var(--color-primary-dark)] transition-colors"
              >
                <Icon name="photo_camera" size={18} />
                撮影する
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  uploadInputRef.current?.click();
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-foreground)] rounded-full text-sm font-semibold hover:bg-[var(--color-border-light)] transition-colors"
              >
                <Icon name="image" size={18} />
                画像を選択
              </button>
            </div>
          </section>

          {/* Mode Selection */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--color-foreground)]">抽出モード</h3>
              {!isPro && (
                <span className="chip chip-pro">
                  <Icon name="auto_awesome" size={14} />
                  Pro
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
              {scanModes.map((mode) => {
                const isSelected = selectedMode === mode.id;
                const isLocked = mode.pro && !isPro;
                const colors = modeColors[mode.id] || modeColors.all;
                return (
                  <button
                    key={mode.id}
                    onClick={() => handleSelectMode(mode)}
                    className={`relative flex flex-col items-center gap-2 p-4 rounded-2xl border-2 text-center transition-all ${
                      isSelected
                        ? `${colors.border} ${colors.bg}`
                        : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                    } ${isLocked ? 'opacity-50' : 'hover:shadow-md active:scale-[0.98]'}`}
                  >
                    {isLocked && (
                      <div className="absolute top-2 right-2">
                        <Icon name="lock" size={14} className="text-[var(--color-muted)]" />
                      </div>
                    )}
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${isSelected ? colors.bg : 'bg-[var(--color-border-light)]'}`}>
                      <Icon name={mode.icon} size={24} className={isSelected ? colors.icon : 'text-[var(--color-muted)]'} />
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${isSelected ? 'text-[var(--color-foreground)]' : 'text-[var(--color-foreground)]'}`}>{mode.title}</p>
                      <p className="text-[11px] text-[var(--color-muted)] leading-tight mt-0.5">{mode.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedMode === 'eiken' && (
              <div className="card p-4 animate-fade-in-up">
                <label className="text-sm font-semibold text-[var(--color-foreground)]">英検レベル</label>
                <div className="mt-3 grid grid-cols-4 gap-2">
                  {[
                    { value: '5', label: '5級' },
                    { value: '4', label: '4級' },
                    { value: '3', label: '3級' },
                    { value: 'pre2', label: '準2級' },
                    { value: '2', label: '2級' },
                    { value: 'pre1', label: '準1級' },
                    { value: '1', label: '1級' },
                  ].map((level) => (
                    <button
                      key={level.value}
                      onClick={() => setSelectedEiken(level.value as EikenLevel)}
                      className={`py-2 rounded-xl text-sm font-semibold transition-all ${
                        selectedEiken === level.value
                          ? 'bg-[var(--color-success)] text-white'
                          : 'bg-[var(--color-border-light)] text-[var(--color-foreground)] hover:bg-[var(--color-success)]/10'
                      }`}
                    >
                      {level.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Scan info */}
          {!isPro && (
            <p className="text-xs text-center text-[var(--color-muted)]">
              {scanInfo && scanInfo.limit
                ? `今日のスキャン: ${scanInfo.currentCount}/${scanInfo.limit}`
                : `無料プラン: 1日${FREE_DAILY_SCAN_LIMIT}回までスキャン可能`}
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
                  className="mt-4 w-full py-2 bg-[var(--color-border-light)] rounded-[var(--radius-md)] text-[var(--color-foreground)] text-sm hover:bg-[var(--color-primary-light)] transition-colors"
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

        {/* Project name modal for background scan */}
        {showProjectNameModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="card p-6 w-full max-w-sm animate-fade-in-up">
              <h2 className="text-lg font-bold mb-4 text-[var(--color-foreground)]">
                単語帳の名前
              </h2>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="例: 英検2級 単語"
                className="w-full px-4 py-3 border border-[var(--color-border)] rounded-xl bg-[var(--color-surface)] text-[var(--color-foreground)] focus:border-[var(--color-primary)] focus:outline-none"
                autoFocus
              />
              <p className="mt-2 text-xs text-[var(--color-muted)]">
                バックグラウンドで処理されます。完了後に通知します。
              </p>
              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => {
                    setShowProjectNameModal(false);
                    setPendingFiles([]);
                    setProjectName('');
                  }}
                  disabled={uploading}
                  className="flex-1 py-3 rounded-xl border border-[var(--color-border)] text-[var(--color-foreground)] font-medium hover:bg-[var(--color-border-light)] transition-colors disabled:opacity-50"
                >
                  キャンセル
                </button>
                <button
                  onClick={() => {
                    if (projectName.trim() && pendingFiles.length > 0) {
                      handleBackgroundUpload(pendingFiles, projectName.trim());
                    }
                  }}
                  disabled={!projectName.trim() || uploading}
                  className="flex-1 py-3 rounded-xl bg-[var(--color-primary)] text-white font-medium hover:bg-[var(--color-primary)]/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {uploading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      送信中...
                    </>
                  ) : (
                    'スキャン開始'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
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
