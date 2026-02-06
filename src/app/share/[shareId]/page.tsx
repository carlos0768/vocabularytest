'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/button';
import { remoteRepository } from '@/lib/db/remote-repository';
import { useAuth } from '@/hooks/use-auth';
import type { Project, Word } from '@/types';

export default function SharedProjectPage() {
  const router = useRouter();
  const params = useParams();
  const shareId = params.shareId as string;
  const { user, isPro, loading: authLoading } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load shared project and words
  useEffect(() => {
    if (authLoading) return;

    const loadData = async () => {
      try {
        const [projectData, wordsData] = await Promise.all([
          remoteRepository.getProjectByShareId(shareId),
          remoteRepository.getWordsByShareId(shareId),
        ]);

        if (!projectData) {
          setError('この単語帳は存在しないか、共有が解除されています');
          return;
        }

        setProject(projectData);
        setWords(wordsData);
      } catch (err) {
        console.error('Failed to load shared project:', err);
        setError('単語帳の読み込みに失敗しました');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [shareId, authLoading]);

  const handleImport = async () => {
    if (!user) return;

    setImporting(true);
    try {
      const newProject = await remoteRepository.importSharedProject(shareId, user.id);
      setImported(true);
      // Navigate to the new project after a short delay
      setTimeout(() => {
        router.push(`/project/${newProject.id}`);
      }, 1500);
    } catch (err) {
      console.error('Failed to import project:', err);
      setError('インポートに失敗しました');
    } finally {
      setImporting(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Icon name="progress_activity" size={32} className="text-[var(--color-primary)] animate-spin" />
      </div>
    );
  }

  // Show upgrade prompt for non-Pro users
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
          <Link href="/subscription">
            <Button className="bg-primary hover:bg-primary/90">
              <Icon name="workspace_premium" size={16} className="mr-2" />
              Proにアップグレード
            </Button>
          </Link>
          <Link href="/">
            <Button variant="secondary">
              <Icon name="arrow_back" size={16} className="mr-2" />
              ホームに戻る
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <Icon name="menu_book" size={64} className="text-[var(--color-muted)] mb-4" />
        <p className="text-[var(--color-muted)] text-center mb-6">{error}</p>
        <Link href="/">
          <Button variant="secondary">
            <Icon name="arrow_back" size={16} className="mr-2" />
            ホームに戻る
          </Button>
        </Link>
      </div>
    );
  }

  if (!project) {
    return null;
  }

  return (
    <div className="min-h-screen pb-24 bg-[var(--color-background)]">
      {/* Header */}
      <header className="sticky top-0 bg-[var(--color-background)]/95 border-b border-[var(--color-border)] z-40">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 -ml-2 hover:bg-[var(--color-primary-light)] rounded-full transition-colors"
            >
              <Icon name="arrow_back" size={20} />
            </Link>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-semibold text-[var(--color-foreground)] truncate">{project.title}</h1>
              <p className="text-xs text-[var(--color-muted)]">共有された単語帳 ({words.length}語)</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-lg mx-auto px-4 py-6">
        {/* Import button */}
        <div className="flex justify-center mb-6">
          {imported ? (
            <div className="flex items-center gap-2 text-[var(--color-success)] font-medium">
              <Icon name="check_circle" size={20} />
              追加しました！
            </div>
          ) : (
            <Button
              size="lg"
              onClick={handleImport}
              disabled={importing}
            >
              {importing ? (
                <Icon name="progress_activity" size={20} className="mr-2 animate-spin" />
              ) : (
                <Icon name="download" size={20} className="mr-2" />
              )}
              自分の単語帳に追加
            </Button>
          )}
        </div>

        {/* Word list (read-only) */}
        <div className="mb-4">
          <h2 className="font-medium text-[var(--color-foreground)]">単語一覧 ({words.length}語)</h2>
        </div>

        <div className="space-y-2">
          {words.map((word) => (
            <div
              key={word.id}
              className="bg-[var(--color-surface)] rounded-[var(--radius-lg)] border border-[var(--color-border)] p-4"
            >
              <p className="font-medium text-[var(--color-foreground)]">{word.english}</p>
              <p className="text-[var(--color-muted)] mt-0.5">{word.japanese}</p>
              {word.exampleSentence && (
                <div className="mt-2 pt-2 border-t border-[var(--color-border-light)]">
                  <p className="text-sm text-[var(--color-foreground)] italic">{word.exampleSentence}</p>
                  {word.exampleSentenceJa && (
                    <p className="text-xs text-[var(--color-muted)] mt-0.5">{word.exampleSentenceJa}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {words.length === 0 && (
          <div className="text-center py-8 text-[var(--color-muted)]">
            単語がありません
          </div>
        )}
      </main>
    </div>
  );
}
