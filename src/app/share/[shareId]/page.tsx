'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/components/ui/toast';
import { remoteRepository } from '@/lib/db/remote-repository';
import { getRepository } from '@/lib/db';
import { createBrowserClient } from '@/lib/supabase';
import { getProjectColor } from '@/components/project/ProjectCard';
import { invalidateHomeCache } from '@/lib/home-cache';
import type { Project, Word } from '@/types';

export default function SharedProjectPage() {
  const router = useRouter();
  const params = useParams();
  const shareId = params.shareId as string;
  const { user, subscription, isPro, loading: authLoading } = useAuth();
  const { showToast } = useToast();

  const [project, setProject] = useState<Project | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [ownerUsername, setOwnerUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [wordsLoaded, setWordsLoaded] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importedProjectId, setImportedProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const subscriptionStatus = subscription?.status || 'free';
  const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';

  useEffect(() => {
    // Start fetching immediately without waiting for auth.
    // Data and auth resolution happen in parallel.
    // The Pro gate check in render handles non-Pro users.
    const loadData = async () => {
      try {
        const projectData = await remoteRepository.getProjectByShareId(shareId);

        if (!projectData) {
          setError('この単語帳は存在しないか、共有が解除されています');
          return;
        }

        // Fetch words and owner profile in parallel (was sequential before)
        const supabase = createBrowserClient();
        const [wordsData, profileResult] = await Promise.all([
          remoteRepository.getWordsForShareView(projectData.id),
          Promise.resolve(
            supabase
              .from('profiles')
              .select('username')
              .eq('user_id', projectData.userId)
              .maybeSingle()
          ).catch(() => ({ data: null })),
        ]);

        setProject(projectData);
        setWords(wordsData);
        setWordsLoaded(true);
        if (profileResult.data?.username) {
          setOwnerUsername(profileResult.data.username as string);
        }
      } catch (err) {
        console.error('Failed to load shared project:', err);
        setError('単語帳の読み込みに失敗しました');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [shareId]);

  const handleImport = async () => {
    if (!user || !project) return;

    setImporting(true);
    try {
      const repo = getRepository(subscriptionStatus, wasPro);

      const newProject = await repo.createProject({
        title: project.title,
        userId: user.id,
        importedFromShareId: shareId,
      });

      if (words.length > 0) {
        await repo.createWords(
          words.map((w) => ({
            projectId: newProject.id,
            english: w.english,
            japanese: w.japanese,
            distractors: w.distractors ?? [],
            exampleSentence: w.exampleSentence ?? undefined,
            exampleSentenceJa: w.exampleSentenceJa ?? undefined,
            pronunciation: w.pronunciation ?? undefined,
            partOfSpeechTags: w.partOfSpeechTags ?? undefined,
          })),
        );
      }

      setImportedProjectId(newProject.id);
      invalidateHomeCache();
      showToast({ message: '単語帳を追加しました！', type: 'success' });
    } catch (err) {
      console.error('Failed to import project:', err);
      showToast({ message: 'インポートに失敗しました', type: 'error' });
    } finally {
      setImporting(false);
    }
  };

  const posLabel = (tags?: string[]) => {
    if (!tags || tags.length === 0) return null;
    const map: Record<string, string> = { noun: '名', verb: '動', adjective: '形', adverb: '副', phrase: '句', idiom: '熟', phrasal_verb: '句' };
    return map[tags[0]] || tags[0].slice(0, 1);
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[var(--color-muted)]">
        <Icon name="progress_activity" size={20} className="animate-spin" />
        <span className="ml-2">読み込み中...</span>
      </div>
    );
  }

  if (!authLoading && !isPro) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="w-20 h-20 bg-[var(--color-primary)] rounded-full flex items-center justify-center mb-6">
          <Icon name="workspace_premium" size={40} className="text-white" />
        </div>
        <h1 className="text-xl font-bold text-[var(--color-foreground)] mb-2">Pro機能です</h1>
        <p className="text-[var(--color-muted)] text-center mb-6">
          共有された単語帳を見るには<br />Proプランへのアップグレードが必要です
        </p>
        <div className="flex flex-col gap-3">
          <Link href="/subscription" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[var(--color-foreground)] text-white font-semibold">
            <Icon name="workspace_premium" size={16} />
            Proにアップグレード
          </Link>
          <Link href="/" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl border border-[var(--color-border)] text-[var(--color-muted)] font-semibold">
            <Icon name="arrow_back" size={16} />
            ホームに戻る
          </Link>
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
        <h1 className="text-xl font-bold text-[var(--color-foreground)]">単語帳が見つかりません</h1>
        <p className="text-sm text-[var(--color-muted)] mt-2">{error || '一覧から選び直してください。'}</p>
        <Link href="/shared" className="mt-4 px-4 py-2 rounded-full bg-[var(--color-foreground)] text-white font-semibold">
          共有一覧へ戻る
        </Link>
      </div>
    );
  }

  const HEADER_DARKEN: Record<string, string> = {
    '#ef4444': '#b91c1c',
    '#16a34a': '#166534',
    '#1e3a8a': '#1e40af',
    '#f97316': '#c2410c',
    '#9333ea': '#7e22ce',
    '#0d9488': '#0f766e',
  };
  const headerFrom = getProjectColor(project.title);
  const headerTo = HEADER_DARKEN[headerFrom] ?? headerFrom;

  return (
    <>
      <div className="min-h-screen bg-[var(--color-background)] pb-28 lg:pb-8">
        {/* Dynamic color header */}
        <div
          className="project-detail-header-safe-top z-[50] sticky top-0"
          style={{ backgroundColor: headerFrom, background: `linear-gradient(135deg, ${headerFrom}, ${headerTo})` }}
        >
          <div className="max-w-lg lg:max-w-xl mx-auto px-5 pt-4 pb-5">
            <div className="flex items-center justify-between mb-3">
              <button onClick={() => router.back()} className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center" aria-label="戻る">
                <Icon name="chevron_left" size={24} className="text-white" />
              </button>
              <div className="flex-1 text-center mx-3">
                <p className="text-white font-bold text-sm truncate">{project.title}</p>
                <p className="text-white/70 text-xs">
                  {ownerUsername ? `${ownerUsername}さんの単語帳` : '共有された単語帳'} · {words.length}語
                </p>
              </div>
              <div className="w-10" />
            </div>
          </div>
        </div>

        <main className="max-w-lg lg:max-w-2xl mx-auto px-5 pt-4 lg:px-6 lg:-mt-2 space-y-5">
          {/* Word list table */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-[var(--color-foreground)]">単語一覧 <span className="text-sm font-normal text-[var(--color-muted)]">{words.length}</span></h2>
            </div>

            {!wordsLoaded ? (
              <div className="flex items-center gap-3 text-[var(--color-muted)] py-8 justify-center">
                <Icon name="progress_activity" size={18} className="animate-spin" />
                <span className="text-sm">読み込み中...</span>
              </div>
            ) : words.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-[var(--color-muted)]">単語がありません</p>
              </div>
            ) : (
              <div className="overflow-hidden">
                <table className="w-full border-collapse table-fixed">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] text-xs text-[var(--color-muted)]">
                      <th className="px-2 py-2 text-left font-medium">単語</th>
                      <th className="w-10 px-1 py-2 text-center font-medium">品詞</th>
                      <th className="px-2 py-2 text-left font-medium whitespace-nowrap">訳</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border-light)]">
                    {words.map((word) => (
                      <tr key={word.id}>
                        <td className="px-2 py-2.5 max-w-0">
                          <span className="inline-flex items-center gap-1 min-w-0">
                            <span className="text-sm font-medium text-[var(--color-foreground)] truncate">{word.english}</span>
                          </span>
                        </td>
                        <td className="w-10 px-1 py-2.5 text-center text-xs font-bold text-[var(--color-muted)]">
                          {posLabel(word.partOfSpeechTags) || '—'}
                        </td>
                        <td className="px-2 py-2.5 text-xs text-[var(--color-muted)] truncate max-w-0">
                          {word.japanese}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </main>

        {/* Bottom action bar */}
        {words.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-[var(--color-surface)] border-t border-[var(--color-border)] px-5 py-3 z-40 lg:ml-[280px]" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
            <div className="max-w-lg mx-auto">
              {importedProjectId ? (
                <button
                  onClick={() => router.push(`/project/${importedProjectId}`)}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[var(--color-success)] text-white font-semibold text-sm"
                >
                  <Icon name="check_circle" size={18} />
                  追加済み — 単語帳を開く
                </button>
              ) : (
                <button
                  onClick={handleImport}
                  disabled={importing}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[var(--color-foreground)] text-white font-semibold text-sm disabled:opacity-50"
                >
                  {importing ? (
                    <>
                      <Icon name="progress_activity" size={18} className="animate-spin" />
                      追加中...
                    </>
                  ) : (
                    <>
                      <Icon name="download" size={18} />
                      単語帳として追加
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
