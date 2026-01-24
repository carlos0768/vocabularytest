'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BookOpen, Loader2, Settings, User, Sparkles, Orbit, Hexagon, Gem, Zap } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { ProjectCard, ScanButton } from '@/components/project';
import { ProgressSteps, type ProgressStep } from '@/components/ui';
import { getRepository } from '@/lib/db';
import { getDailyScanInfo, incrementScanCount, getGuestUserId, getStreakDays, getDailyStats } from '@/lib/utils';
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
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-lg">
        <h2 className="text-base font-medium mb-4 text-center text-gray-900">
          {hasError ? 'エラーが発生しました' : '解析中'}
        </h2>
        <ProgressSteps steps={steps} />
        {hasError && onClose && (
          <button
            onClick={onClose}
            className="mt-4 w-full py-2 bg-gray-100 rounded-lg text-gray-700 text-sm hover:bg-gray-200 transition-colors"
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
  const [scanInfo, setScanInfo] = useState({ count: 0, remaining: 10, canScan: true });
  const [streakDays, setStreakDays] = useState(0);
  const [dailyStats, setDailyStats] = useState({ todayCount: 0, correctCount: 0, masteredCount: 0 });
  const [totalMastered, setTotalMastered] = useState(0);

  // Get repository based on subscription status
  const subscriptionStatus = subscription?.status || 'free';
  const repository = getRepository(subscriptionStatus);

  // Load projects
  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      // For local storage (free users), always use guest ID
      // For remote storage (pro users), use authenticated user ID
      const userId = isPro && user ? user.id : getGuestUserId();
      const data = await repository.getProjects(userId);
      setProjects(data);

      // Load word counts for each project and count mastered words
      const counts: Record<string, number> = {};
      let mastered = 0;
      for (const project of data) {
        const words = await repository.getWords(project.id);
        counts[project.id] = words.length;
        mastered += words.filter(w => w.status === 'mastered').length;
      }
      setProjectWordCounts(counts);
      setTotalMastered(mastered);
    } catch (error) {
      console.error('Failed to load projects:', error);
    } finally {
      setLoading(false);
    }
  }, [isPro, user, repository]);

  // Load scan info and stats immediately (doesn't need auth)
  useEffect(() => {
    setScanInfo(getDailyScanInfo());
    setStreakDays(getStreakDays());
    setDailyStats(getDailyStats());
  }, []);

  // Load projects only after auth state is determined
  useEffect(() => {
    if (!authLoading) {
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

  // Calculate accuracy
  const accuracy = dailyStats.todayCount > 0
    ? Math.round((dailyStats.correctCount / dailyStats.todayCount) * 100)
    : 0;

  // Home page doesn't require auth - show UI immediately
  // Auth state will update reactively when loaded
  return (
    <div className="min-h-screen bg-white pb-24">
      {/* Header */}
      <header className="sticky top-0 bg-white/95 backdrop-blur-sm z-40">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold text-gray-900">ScanVocab</h1>
              {isPro && (
                <span className="flex items-center gap-1 text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-md font-medium">
                  <Sparkles className="w-3 h-3" />
                  Pro
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {/* Scan limit (free users only) */}
              {!isPro && (
                <span className="text-xs text-gray-400">
                  残り{scanInfo.remaining}回
                </span>
              )}

              {/* User menu */}
              {authLoading ? (
                <div className="p-1.5">
                  <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
                </div>
              ) : isAuthenticated ? (
                <Link
                  href="/settings"
                  className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
                >
                  <Settings className="w-5 h-5 text-gray-500" />
                </Link>
              ) : (
                <Link
                  href="/login"
                  className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  ログイン
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Stats bar */}
      <div className="max-w-2xl mx-auto px-4 py-4">
        <div className="flex justify-around">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Orbit className="w-4 h-4 text-blue-500" />
            </div>
            <p className={`text-2xl font-semibold ${dailyStats.todayCount > 0 ? 'text-blue-600' : 'text-gray-300'}`}>
              {dailyStats.todayCount}
            </p>
            <p className="text-xs text-gray-400">今日</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Hexagon className="w-4 h-4 text-gray-400" />
            </div>
            <p className={`text-2xl font-semibold ${accuracy > 0 ? 'text-gray-700' : 'text-gray-300'}`}>
              {accuracy}
            </p>
            <p className="text-xs text-gray-400">正答率</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Gem className="w-4 h-4 text-emerald-500" />
            </div>
            <p className={`text-2xl font-semibold ${totalMastered > 0 ? 'text-emerald-600' : 'text-gray-300'}`}>
              {totalMastered}
            </p>
            <p className="text-xs text-gray-400">習得</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Zap className="w-4 h-4 text-amber-500" />
            </div>
            <p className={`text-2xl font-semibold ${streakDays > 0 ? 'text-amber-500' : 'text-gray-300'}`}>
              {streakDays}
            </p>
            <p className="text-xs text-gray-400">連続</p>
          </div>
        </div>
      </div>

      {/* Main content */}
      <main className="max-w-2xl mx-auto px-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          </div>
        ) : projects.length === 0 ? (
          /* Empty state */
          <div className="text-center py-12">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <BookOpen className="w-7 h-7 text-gray-400" />
            </div>
            <h2 className="text-base font-medium text-gray-900 mb-2">
              単語帳がありません
            </h2>
            <p className="text-gray-500 text-sm mb-6">
              右下のボタンから
              <br />
              ノートやプリントを撮影しましょう
            </p>
            {!isAuthenticated && (
              <p className="text-xs text-gray-400">
                <Link href="/signup" className="text-blue-600 hover:underline">
                  アカウント登録
                </Link>
                でクラウド保存
              </p>
            )}
          </div>
        ) : (
          /* Project list */
          <div className="space-y-2">
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
