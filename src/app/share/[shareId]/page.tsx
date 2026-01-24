'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Download, Loader2, BookOpen, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { remoteRepository } from '@/lib/db/remote-repository';
import { useAuth } from '@/hooks/use-auth';
import type { Project, Word } from '@/types';

export default function SharedProjectPage() {
  const router = useRouter();
  const params = useParams();
  const shareId = params.shareId as string;
  const { user, loading: authLoading } = useAuth();

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
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <BookOpen className="w-16 h-16 text-gray-300 mb-4" />
        <p className="text-gray-600 text-center mb-6">{error}</p>
        <Link href="/">
          <Button variant="secondary">
            <ArrowLeft className="w-4 h-4 mr-2" />
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
    <div className="min-h-screen pb-24">
      {/* Header */}
      <header className="sticky top-0 bg-white/80 backdrop-blur-sm border-b border-gray-200 z-40">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-semibold truncate">{project.title}</h1>
              <p className="text-xs text-gray-500">共有された単語帳 ({words.length}語)</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-lg mx-auto px-4 py-6">
        {/* Import button */}
        <div className="flex justify-center mb-6">
          {imported ? (
            <div className="flex items-center gap-2 text-emerald-600 font-medium">
              <CheckCircle className="w-5 h-5" />
              追加しました！
            </div>
          ) : (
            <Button
              size="lg"
              onClick={handleImport}
              disabled={importing}
            >
              {importing ? (
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              ) : (
                <Download className="w-5 h-5 mr-2" />
              )}
              自分の単語帳に追加
            </Button>
          )}
        </div>

        {/* Word list (read-only) */}
        <div className="mb-4">
          <h2 className="font-medium text-gray-900">単語一覧 ({words.length}語)</h2>
        </div>

        <div className="space-y-2">
          {words.map((word) => (
            <div
              key={word.id}
              className="bg-white rounded-xl border border-gray-200 p-4"
            >
              <p className="font-medium text-gray-900">{word.english}</p>
              <p className="text-gray-600 mt-0.5">{word.japanese}</p>
              {word.exampleSentence && (
                <div className="mt-2 pt-2 border-t border-gray-100">
                  <p className="text-sm text-gray-700 italic">{word.exampleSentence}</p>
                  {word.exampleSentenceJa && (
                    <p className="text-xs text-gray-500 mt-0.5">{word.exampleSentenceJa}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        {words.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            単語がありません
          </div>
        )}
      </main>
    </div>
  );
}
