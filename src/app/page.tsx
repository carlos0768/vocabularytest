'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BookOpen, Settings, Sparkles, Orbit, Hexagon, Gem, Zap, Check, Heart } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useWordCount } from '@/hooks/use-word-count';
import { ProjectCard, ScanButton } from '@/components/project';
import { ProgressSteps, type ProgressStep, useToast } from '@/components/ui';
import { ScanLimitModal, WordLimitModal, WordLimitBanner } from '@/components/limits';
import { getRepository } from '@/lib/db';
import { getDailyScanInfo, incrementScanCount, getGuestUserId, getStreakDays, getDailyStats, FREE_DAILY_SCAN_LIMIT, FREE_WORD_LIMIT } from '@/lib/utils';
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
  const { isAlmostFull, isAtLimit, refresh: refreshWordCount } = useWordCount();
  const { showToast } = useToast();

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectWordCounts, setProjectWordCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<ProgressStep[]>([]);
  const [scanInfo, setScanInfo] = useState({ count: 0, remaining: FREE_DAILY_SCAN_LIMIT, canScan: true });
  const [streakDays, setStreakDays] = useState(0);
  const [dailyStats, setDailyStats] = useState({ todayCount: 0, correctCount: 0, masteredCount: 0 });
  const [totalMastered, setTotalMastered] = useState(0);
  const [totalWords, setTotalWords] = useState(0);
  const [totalFavorites, setTotalFavorites] = useState(0);
  const [showStats, setShowStats] = useState(true);

  // Modals
  const [showScanLimitModal, setShowScanLimitModal] = useState(false);
  const [showWordLimitModal, setShowWordLimitModal] = useState(false);

  // Get repository based on subscription status
  const subscriptionStatus = subscription?.status || 'free';
  const repository = useMemo(() => getRepository(subscriptionStatus), [subscriptionStatus]);

  // Load projects
  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      const userId = isPro && user ? user.id : getGuestUserId();
      const data = await repository.getProjects(userId);
      setProjects(data);

      // Load word counts for each project and count mastered/favorite words
      const counts: Record<string, number> = {};
      let mastered = 0;
      let total = 0;
      let favorites = 0;
      for (const project of data) {
        const words = await repository.getWords(project.id);
        counts[project.id] = words.length;
        total += words.length;
        mastered += words.filter(w => w.status === 'mastered').length;
        favorites += words.filter(w => w.isFavorite).length;
      }
      setProjectWordCounts(counts);
      setTotalMastered(mastered);
      setTotalWords(total);
      setTotalFavorites(favorites);
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

    // Load show stats setting
    const savedShowStats = localStorage.getItem('scanvocab_show_stats');
    if (savedShowStats !== null) {
      setShowStats(savedShowStats === 'true');
    }
  }, []);

  // Load projects only after auth state is determined
  useEffect(() => {
    if (!authLoading) {
      loadProjects();
    }
  }, [authLoading, loadProjects]);

  // Check if user can scan (Pro = unlimited, Free = limited)
  const canScan = isPro || scanInfo.canScan;

  // Get scan count display info
  const getScanCountColor = () => {
    if (isPro) return 'text-emerald-600';
    if (scanInfo.remaining <= 0) return 'text-gray-400';
    if (scanInfo.remaining <= 2) return 'text-amber-500';
    return 'text-gray-500';
  };

  // Get word count progress info
  const wordCountPercentage = isPro ? 0 : Math.min(100, Math.round((totalWords / FREE_WORD_LIMIT) * 100));
  const getWordCountColor = () => {
    if (isPro) return 'bg-emerald-500';
    if (wordCountPercentage >= 95) return 'bg-red-500';
    if (wordCountPercentage >= 80) return 'bg-amber-500';
    return 'bg-blue-500';
  };

  const handleImageSelect = async (file: File) => {
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
      refreshWordCount();
    }
  };

  // Calculate accuracy
  const accuracy = dailyStats.todayCount > 0
    ? Math.round((dailyStats.correctCount / dailyStats.todayCount) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-white pb-24">
      {/* Word limit banner (95+ words) */}
      {!isPro && isAlmostFull && (
        <WordLimitBanner currentCount={totalWords} />
      )}

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
              {/* Scan count */}
              <span className={`text-xs font-medium ${getScanCountColor()}`}>
                {isPro ? (
                  <span className="flex items-center gap-1">
                    無制限
                    <Check className="w-3 h-3" />
                  </span>
                ) : (
                  `${scanInfo.count}/${FREE_DAILY_SCAN_LIMIT}`
                )}
              </span>

              {/* Favorites link */}
              <Link
                href="/favorites"
                className="p-1.5 hover:bg-gray-100 rounded-md transition-colors relative"
              >
                <Heart className={`w-5 h-5 ${totalFavorites > 0 ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} />
                {totalFavorites > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-medium rounded-full flex items-center justify-center">
                    {totalFavorites > 9 ? '9+' : totalFavorites}
                  </span>
                )}
              </Link>

              {/* Settings - always visible */}
              <Link
                href="/settings"
                className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
              >
                <Settings className="w-5 h-5 text-gray-500" />
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Word count progress bar (free users only) */}
      {!isPro && (
        <div className="max-w-2xl mx-auto px-4 pt-2">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>保存中の単語</span>
            <span className={wordCountPercentage >= 95 ? 'text-red-500 font-medium' : ''}>
              {totalWords}/{FREE_WORD_LIMIT}
            </span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${getWordCountColor()} transition-all duration-300`}
              style={{ width: `${wordCountPercentage}%` }}
            />
          </div>
          {wordCountPercentage >= 95 && (
            <p className="text-xs text-red-500 mt-1">まもなく上限</p>
          )}
        </div>
      )}

      {/* Stats bar */}
      {showStats && (
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
      )}

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
        disabled={processing || (!isPro && !canScan)}
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

      {/* Scan limit modal */}
      <ScanLimitModal
        isOpen={showScanLimitModal}
        onClose={() => setShowScanLimitModal(false)}
        todayWordsLearned={dailyStats.todayCount}
      />

      {/* Word limit modal */}
      <WordLimitModal
        isOpen={showWordLimitModal}
        onClose={() => setShowWordLimitModal(false)}
        currentCount={totalWords}
      />
    </div>
  );
}
