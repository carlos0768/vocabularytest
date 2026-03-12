'use client';

import { Suspense } from 'react';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { useUserPreferences } from '@/hooks/use-user-preferences';
import { useWordCount } from '@/hooks/use-word-count';
import { ProgressSteps, type ProgressStep, useToast, Icon, AppShell } from '@/components/ui';
import { ScanLimitModal, WordLimitModal } from '@/components/limits';
import { FREE_DAILY_SCAN_LIMIT } from '@/lib/utils';
import type { ExtractMode, EikenLevel } from '@/app/api/extract/route';
import {
  expandFilesForScan,
  isPdfFile,
  processImageFile,
  processImageToBase64,
  processProjectIconFile,
  type ImageProcessingProfile,
} from '@/lib/image-utils';
import { createBrowserClient } from '@/lib/supabase';
import { ensureWebPushSubscription } from '@/lib/notifications/push-client';
import { mergeSourceLabels } from '../../../shared/source-labels';
import { mergeLexiconEntries } from '../../../shared/lexicon';
import type { LexiconEntry } from '@/types';


function ScanPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId');
  const { isPro, isAuthenticated } = useAuth();
  const {
    aiEnabled,
    loading: userPreferencesLoading,
    saving: userPreferencesSaving,
    setAiEnabled: saveAiEnabledPreference,
  } = useUserPreferences();
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
  const [projectIcon, setProjectIcon] = useState<string | null>(null);
  const [projectIconError, setProjectIconError] = useState<string | null>(null);
  const [projectIconProcessing, setProjectIconProcessing] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingAiConsentFiles, setPendingAiConsentFiles] = useState<File[]>([]);
  const [showAiConsentModal, setShowAiConsentModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const projectIconInputRef = useRef<HTMLInputElement>(null);

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

  const getImageProfile = useCallback((): ImageProcessingProfile => (
    selectedMode === 'highlighted' ? 'highlighted' : 'default'
  ), [selectedMode]);

  // Compress image for fast upload (profile-driven)
  const compressForUpload = useCallback(async (file: File): Promise<{ blob: Blob; contentType: string; ext: string }> => {
    const isPdf = isPdfFile(file);
    if (isPdf) {
      return { blob: file, contentType: 'application/pdf', ext: '.pdf' };
    }

    const profile = getImageProfile();
    const processed = await processImageFile(file, profile);
    return {
      blob: processed,
      contentType: processed.type || 'image/jpeg',
      ext: '.jpg',
    };
  }, [getImageProfile]);

  // Background upload for Pro users - Direct to Supabase Storage
  // Uploads ALL images first, then creates a single scan job with all image paths
  const handleBackgroundUpload = useCallback(async (files: File[], name: string, iconImage?: string, aiPreference?: boolean, targetProjectId?: string) => {
    setUploading(true);

    try {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      const { data: { user } } = await supabase.auth.getUser();

      if (!session?.access_token || !user) {
        throw new Error('認証が必要です');
      }

      void ensureWebPushSubscription({
        accessToken: session.access_token,
        requestPermission: true,
      });

      // 1. Upload all images first
      const uploadedPaths: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const { blob: compressedBlob, contentType, ext } = await compressForUpload(file);

        const randomSuffix = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : Math.random().toString(36).slice(2);
        const imagePath = `${user.id}/${Date.now()}-${i}-${randomSuffix}${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('scan-images')
          .upload(imagePath, compressedBlob, {
            contentType,
            upsert: false,
          });

        if (uploadError) {
          console.error('Storage upload error:', uploadError);
          // Clean up already uploaded images
          if (uploadedPaths.length > 0) {
            await supabase.storage.from('scan-images').remove(uploadedPaths);
          }
          throw new Error(`画像のアップロードに失敗しました: ${uploadError.message}`);
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
          projectIcon: iconImage ?? null,
          scanMode: selectedMode,
          eikenLevel: selectedMode === 'eiken' ? selectedEiken : null,
          aiEnabled: typeof aiPreference === 'boolean' ? aiPreference : null,
          ...(targetProjectId ? { targetProjectId } : {}),
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
      setProjectIcon(null);
      setProjectIconError(null);
      setProjectIconProcessing(false);
    }
  }, [selectedMode, selectedEiken, router, showToast, compressForUpload]);

  const handleMultipleImages = useCallback(async (files: File[], aiPreferenceOverride?: boolean) => {
    const effectiveAiPreference =
      typeof aiPreferenceOverride === 'boolean' ? aiPreferenceOverride : aiEnabled;

    if (userPreferencesLoading && typeof aiPreferenceOverride !== 'boolean') {
      showToast({
        message: '設定を読み込み中です。少し待ってから再試行してください。',
        type: 'warning',
        duration: 3000,
      });
      return;
    }

    if (effectiveAiPreference === null) {
      setPendingAiConsentFiles(files);
      setShowAiConsentModal(true);
      return;
    }

    sessionStorage.setItem('scanvocab_ai_enabled', effectiveAiPreference ? '1' : '0');

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

    const hasOriginalPdf = files.some((file) => isPdfFile(file));
    let scanFiles = files;
    if (hasOriginalPdf) {
      try {
        scanFiles = await expandFilesForScan(files);
      } catch (error) {
        showToast({
          message: error instanceof Error ? error.message : 'PDFの処理に失敗しました',
          type: 'error',
          duration: 4000,
        });
        return;
      }
    }

    // Pro users: always use background processing.
    if (isPro) {
      if (scanFiles.length > 20) {
        showToast({
          message: '画像は20枚以下にしてください',
          type: 'error',
          duration: 4000,
        });
        return;
      }

      if (projectId) {
        // Adding to existing project: skip project name modal, start background upload directly
        handleBackgroundUpload(scanFiles, '', undefined, effectiveAiPreference, projectId);
        return;
      }

      const now = new Date();
      const defaultName = `スキャン ${now.getMonth() + 1}/${now.getDate()} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
      setProjectName(defaultName);
      setProjectIcon(null);
      setProjectIconError(null);
      setProjectIconProcessing(false);
      setPendingFiles(scanFiles);
      setShowProjectNameModal(true);
      return;
    }

    // Free users or adding to existing project: use traditional flow
    if (!isPro && isAtLimit) {
      setShowWordLimitModal(true);
      return;
    }

    const totalFiles = scanFiles.length;
    setProcessing(true);

    // Initialize steps for multiple files
    const initialSteps: ProgressStep[] = scanFiles.map((_, index) => ({
      id: `file-${index}`,
      label: `画像 ${index + 1}/${totalFiles} を処理中...`,
      status: index === 0 ? 'active' : 'pending',
    }));
    setProcessingSteps(initialSteps);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const allWords: any[] = [];
      let allSourceLabels: string[] = [];
      let allLexiconEntries: LexiconEntry[] = [];
      let lastScanInfo = null;

      for (let i = 0; i < scanFiles.length; i++) {
        const file = scanFiles[i];

        // Update current step to active
        setProcessingSteps(prev => prev.map((s, idx) => ({
          ...s,
          status: idx < i ? 'complete' : idx === i ? 'active' : 'pending',
          label: idx === i ? `画像 ${i + 1}/${totalFiles} を処理中...` : s.label,
        })));

        const base64 = await processImageToBase64(file, getImageProfile());

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
        allSourceLabels = mergeSourceLabels(allSourceLabels, result.sourceLabels);
        allLexiconEntries = mergeLexiconEntries(allLexiconEntries, result.lexiconEntries);

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
      sessionStorage.setItem('scanvocab_source_labels', JSON.stringify(allSourceLabels));
      sessionStorage.setItem('scanvocab_lexicon_entries', JSON.stringify(allLexiconEntries));
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
  }, [
    aiEnabled,
    userPreferencesLoading,
    isPro,
    isAuthenticated,
    isAtLimit,
    projectId,
    router,
    showToast,
    selectedMode,
    selectedEiken,
    getImageProfile,
  ]);

  const handleAiConsent = useCallback(async (enabled: boolean) => {
    if (pendingAiConsentFiles.length === 0) {
      setShowAiConsentModal(false);
      return;
    }

    const ok = await saveAiEnabledPreference(enabled);
    if (!ok) {
      showToast({
        message: '設定の保存に失敗しました。通信状態を確認してください。',
        type: 'error',
      });
      return;
    }

    const filesToScan = [...pendingAiConsentFiles];
    setShowAiConsentModal(false);
    setPendingAiConsentFiles([]);
    await handleMultipleImages(filesToScan, enabled);
  }, [pendingAiConsentFiles, saveAiEnabledPreference, showToast, handleMultipleImages]);

  const handleProjectIconChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setProjectIconProcessing(true);
    setProjectIconError(null);
    try {
      const processed = await processProjectIconFile(file);
      setProjectIcon(processed);
    } catch (error) {
      const message = error instanceof Error ? error.message : '画像の読み込みに失敗しました';
      setProjectIconError(message);
    } finally {
      setProjectIconProcessing(false);
    }
  };

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
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-[var(--color-primary)] text-white rounded-full text-sm font-semibold border-b-[3px] border-[#0a5bbd] active:border-b-[1px] active:mt-[2px] transition-all"
              >
                <Icon name="photo_camera" size={18} />
                撮影する
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  uploadInputRef.current?.click();
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 border-2 border-[var(--color-border)] border-b-4 bg-[var(--color-surface)] text-[var(--color-foreground)] rounded-full text-sm font-semibold active:border-b-2 active:mt-[2px] transition-all"
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
              <div className="mb-4">
                <label className="block text-sm font-medium text-[var(--color-muted)] mb-2">
                  アイコン画像
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => projectIconInputRef.current?.click()}
                    disabled={uploading || projectIconProcessing}
                    className="w-16 h-16 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden flex items-center justify-center hover:border-[var(--color-primary)] transition-colors disabled:opacity-60"
                  >
                    {projectIcon ? (
                      <span
                        className="w-full h-full bg-cover bg-center"
                        style={{ backgroundImage: `url(${projectIcon})` }}
                      />
                    ) : (
                      <Icon name="image" size={24} className="text-[var(--color-muted)]" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0 space-y-1">
                    <button
                      type="button"
                      onClick={() => projectIconInputRef.current?.click()}
                      disabled={uploading || projectIconProcessing}
                      className="text-sm font-semibold text-[var(--color-primary)] hover:underline disabled:opacity-60"
                    >
                      {projectIcon ? '画像を変更' : '画像を選択'}
                    </button>
                    {projectIcon && (
                      <button
                        type="button"
                        onClick={() => {
                          setProjectIcon(null);
                          setProjectIconError(null);
                        }}
                        disabled={uploading || projectIconProcessing}
                        className="block text-xs text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                      >
                        画像を削除
                      </button>
                    )}
                    <p className="text-xs text-[var(--color-muted)]">
                      正方形で表示されます
                    </p>
                  </div>
                </div>
                {projectIconError && (
                  <p className="mt-2 text-xs text-[var(--color-error)]">{projectIconError}</p>
                )}
                <input
                  ref={projectIconInputRef}
                  type="file"
                  accept="image/*,.heic,.heif"
                  onChange={handleProjectIconChange}
                  className="hidden"
                />
              </div>
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
                    setProjectIcon(null);
                    setProjectIconError(null);
                    setProjectIconProcessing(false);
                  }}
                  disabled={uploading || projectIconProcessing}
                  className="flex-1 py-3 rounded-xl border border-[var(--color-border)] text-[var(--color-foreground)] font-medium hover:bg-[var(--color-border-light)] transition-colors disabled:opacity-50"
                >
                  キャンセル
                </button>
                <button
                  onClick={() => {
                    if (projectName.trim() && pendingFiles.length > 0) {
                      handleBackgroundUpload(pendingFiles, projectName.trim(), projectIcon ?? undefined, aiEnabled ?? true);
                    }
                  }}
                  disabled={!projectName.trim() || uploading || projectIconProcessing}
                  className="flex-1 py-3 rounded-xl bg-[var(--color-primary)] text-white font-medium hover:bg-[var(--color-primary)]/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {uploading || projectIconProcessing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {uploading ? '送信中...' : '画像処理中...'}
                    </>
                  ) : (
                    'スキャン開始'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {showAiConsentModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="card p-6 w-full max-w-sm animate-fade-in-up">
              <h2 className="text-lg font-bold text-[var(--color-foreground)] mb-2">
                AI機能を使いますか？
              </h2>
              <p className="text-sm text-[var(--color-muted)] mb-4">
                4択クイズの自動生成に使います。あとで設定からいつでも変更できます。
              </p>
              <div className="grid grid-cols-1 gap-2">
                <button
                  onClick={() => handleAiConsent(true)}
                  disabled={userPreferencesSaving}
                  className="w-full py-3 rounded-xl bg-[var(--color-primary)] text-white font-semibold disabled:opacity-60"
                >
                  {userPreferencesSaving ? '保存中...' : '使う'}
                </button>
                <button
                  onClick={() => handleAiConsent(false)}
                  disabled={userPreferencesSaving}
                  className="w-full py-3 rounded-xl border border-[var(--color-border)] text-[var(--color-foreground)] font-semibold hover:bg-[var(--color-border-light)] disabled:opacity-60"
                >
                  使わない
                </button>
                <button
                  onClick={() => {
                    if (userPreferencesSaving) return;
                    setShowAiConsentModal(false);
                    setPendingAiConsentFiles([]);
                  }}
                  disabled={userPreferencesSaving}
                  className="w-full py-2 rounded-xl text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                >
                  キャンセル
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
