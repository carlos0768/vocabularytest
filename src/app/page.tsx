'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BookOpen, Loader2, Settings, User, Sparkles, Cloud, CloudOff } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { ProjectCard, ScanButton } from '@/components/project';
import { ProgressSteps, type ProgressStep, Button } from '@/components/ui';
import { getRepository } from '@/lib/db';
import { getDailyScanInfo, incrementScanCount, getGuestUserId } from '@/lib/utils';
import { processImageFile } from '@/lib/image-utils';
import type { AIWordExtraction, Project } from '@/types';

// Processing modal component
function ProcessingModal({
  steps,
  onClose,
}: {
  steps: ProgressStep[];
  onClose?: () => void;
}) {
  const hasError = steps.some((s) => s.status === 'error');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
        <h2 className="text-lg font-semibold mb-4 text-center">
          {hasError ? 'エラーが発生しました' : '画像を解析中...'}
        </h2>
        <ProgressSteps steps={steps} />
        {hasError && onClose && (
          <button
            onClick={onClose}
            className="mt-4 w-full py-2 bg-gray-100 rounded-xl text-gray-700 hover:bg-gray-200 transition-colors"
          >
            閉じる
          </button>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const router = useRouter();
  const { user, subscription, isAuthenticated, isPro, loading: authLoading } = useAuth();

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectWordCounts, setProjectWordCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<ProgressStep[]>([]);
  const [scanInfo, setScanInfo] = useState({ count: 0, remaining: 3, canScan: true });

  // Get repository based on subscription status
  const subscriptionStatus = subscription?.status || 'free';
  const repository = getRepository(subscriptionStatus);

  // Load projects
  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      const userId = isAuthenticated ? user!.id : getGuestUserId();
      const data = await repository.getProjects(userId);
      setProjects(data);

      // Load word counts for each project
      const counts: Record<string, number> = {};
      for (const project of data) {
        const words = await repository.getWords(project.id);
        counts[project.id] = words.length;
      }
      setProjectWordCounts(counts);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, user, repository]);

  // Load scan info and projects on mount
  useEffect(() => {
    if (!authLoading) {
      setScanInfo(getDailyScanInfo());
      loadProjects();
    }
  }, [authLoading, loadProjects]);

  // Check if user can scan (Pro = unlimited, Free = 3/day)
  const canScan = isPro || scanInfo.canScan;

  const handleImageSelect = async (file: File) => {
    // Check scan limit for free users
    if (!isPro) {
      const currentScanInfo = getDailyScanInfo();
      if (!currentScanInfo.canScan) {
        router.push('/subscription');
        return;
      }
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

      // Call API
      const response = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 }),
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
        setScanInfo(getDailyScanInfo());
      }

      // Store extracted words temporarily and navigate to confirm page
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
  };

  const handleCloseModal = () => {
    setProcessing(false);
    setProcessingSteps([]);
  };

  const handleDeleteProject = async (id: string) => {
    if (confirm('このプロジェクトを削除しますか？')) {
      await repository.deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <header className="sticky top-0 bg-white/80 backdrop-blur-sm border-b border-gray-200 z-40">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">ScanVocab</h1>
              {isPro && (
                <span className="flex items-center gap-1 text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">
                  <Sparkles className="w-3 h-3" />
                  Pro
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Sync status indicator */}
              {isAuthenticated && (
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  {isPro ? (
                    <>
                      <Cloud className="w-4 h-4 text-green-500" />
                      <span>同期中</span>
                    </>
                  ) : (
                    <>
                      <CloudOff className="w-4 h-4" />
                      <span>ローカル</span>
                    </>
                  )}
                </div>
              )}

              {/* Scan limit (free users only) */}
              {!isPro && (
                <div className="text-sm text-gray-500">
                  残り{scanInfo.remaining}回/日
                </div>
              )}

              {/* User menu */}
              {isAuthenticated ? (
                <Link
                  href="/settings"
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <Settings className="w-5 h-5 text-gray-600" />
                </Link>
              ) : (
                <Link href="/login">
                  <Button variant="secondary" size="sm">
                    <User className="w-4 h-4 mr-1" />
                    ログイン
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Pro upgrade banner for free users */}
      {isAuthenticated && !isPro && (
        <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border-b border-yellow-200">
          <div className="max-w-lg mx-auto px-4 py-3">
            <Link href="/subscription" className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-yellow-600" />
                <span className="text-sm font-medium text-yellow-800">
                  Proプランでスキャン無制限
                </span>
              </div>
              <span className="text-sm text-yellow-600">詳しく →</span>
            </Link>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="max-w-lg mx-auto px-4 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          /* Empty state */
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <BookOpen className="w-8 h-8 text-gray-400" />
            </div>
            <h2 className="text-lg font-medium text-gray-900 mb-2">
              単語帳がありません
            </h2>
            <p className="text-gray-500 mb-6">
              右下のボタンから
              <br />
              ノートやプリントを撮影しましょう
            </p>
            {!isAuthenticated && (
              <p className="text-sm text-gray-400">
                <Link href="/signup" className="text-blue-600 hover:underline">
                  アカウント登録
                </Link>
                で、データをクラウドに保存できます
              </p>
            )}
          </div>
        ) : (
          /* Project list */
          <div className="space-y-3">
            {projects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                wordCount={projectWordCounts[project.id] || 0}
                onDelete={handleDeleteProject}
              />
            ))}
          </div>
        )}
      </main>

      {/* Floating action button */}
      <ScanButton
        onImageSelect={handleImageSelect}
        disabled={processing || !canScan}
      />

      {/* Processing modal */}
      {processing && (
        <ProcessingModal
          steps={processingSteps}
          onClose={
            processingSteps.some((s) => s.status === 'error')
              ? handleCloseModal
              : undefined
          }
        />
      )}
    </div>
  );
}
