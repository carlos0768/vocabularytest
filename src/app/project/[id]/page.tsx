'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Play, BookOpen, CheckCircle, RefreshCw, Loader2, Edit2, Trash2, X, Save, Brain, Flag, Share2, Link as LinkIcon, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getRepository } from '@/lib/db';
import { remoteRepository } from '@/lib/db/remote-repository';
import { useAuth } from '@/hooks/use-auth';
import { getReviewCount } from '@/lib/spaced-repetition';
import type { Project, Word, SubscriptionStatus } from '@/types';

export default function ProjectPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const { user, subscription, loading: authLoading } = useAuth();

  const [project, setProject] = useState<Project | null>(null);
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingWordId, setEditingWordId] = useState<string | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  // Get repository based on subscription status
  const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
  const repository = useMemo(() => getRepository(subscriptionStatus), [subscriptionStatus]);

  // Load project and words
  useEffect(() => {
    // Wait for auth to be ready
    if (authLoading) return;

    const loadData = async () => {
      try {
        const [projectData, wordsData] = await Promise.all([
          repository.getProject(projectId),
          repository.getWords(projectId),
        ]);

        if (!projectData) {
          router.push('/');
          return;
        }

        setProject(projectData);
        setWords(wordsData);
      } catch (error) {
        console.error('Failed to load project:', error);
        router.push('/');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [projectId, repository, router, authLoading]);

  const isPro = subscription?.status === 'active';
  const reviewDueCount = getReviewCount(words);

  const stats = {
    total: words.length,
    new: words.filter((w) => w.status === 'new').length,
    review: words.filter((w) => w.status === 'review').length,
    mastered: words.filter((w) => w.status === 'mastered').length,
    favorites: words.filter((w) => w.isFavorite).length,
  };

  const filteredWords = showFavoritesOnly
    ? words.filter((w) => w.isFavorite)
    : words;

  const handleDeleteWord = async (wordId: string) => {
    if (confirm('この単語を削除しますか？')) {
      await repository.deleteWord(wordId);
      setWords((prev) => prev.filter((w) => w.id !== wordId));
    }
  };

  const handleUpdateWord = async (wordId: string, english: string, japanese: string) => {
    await repository.updateWord(wordId, { english, japanese });
    setWords((prev) =>
      prev.map((w) =>
        w.id === wordId ? { ...w, english, japanese } : w
      )
    );
    setEditingWordId(null);
  };

  const handleToggleFavorite = async (wordId: string) => {
    const word = words.find((w) => w.id === wordId);
    if (!word) return;
    const newFavorite = !word.isFavorite;
    await repository.updateWord(wordId, { isFavorite: newFavorite });
    setWords((prev) =>
      prev.map((w) =>
        w.id === wordId ? { ...w, isFavorite: newFavorite } : w
      )
    );
  };

  const handleShare = async () => {
    if (!project || !user) return;

    setSharing(true);
    try {
      let shareId = project.shareId;

      // Generate share ID if not exists
      if (!shareId) {
        shareId = await remoteRepository.generateShareId(project.id);
        setProject((prev) => prev ? { ...prev, shareId } : null);
      }

      // Copy share URL to clipboard
      const shareUrl = `${window.location.origin}/share/${shareId}`;
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch (error) {
      console.error('Failed to share:', error);
      alert('共有リンクの生成に失敗しました');
    } finally {
      setSharing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
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
            <h1 className="flex-1 text-lg font-semibold truncate">{project.title}</h1>
            {user && (
              <button
                onClick={handleShare}
                disabled={sharing}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                title={project.shareId ? 'リンクをコピー' : '共有リンクを作成'}
              >
                {sharing ? (
                  <Loader2 className="w-5 h-5 text-gray-500 animate-spin" />
                ) : shareCopied ? (
                  <Check className="w-5 h-5 text-emerald-600" />
                ) : project.shareId ? (
                  <LinkIcon className="w-5 h-5 text-blue-600" />
                ) : (
                  <Share2 className="w-5 h-5 text-gray-500" />
                )}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-lg mx-auto px-4 py-6">
        {/* Stats */}
        <div className="flex justify-around py-4 mb-4">
          <div className="text-center">
            <p className={`text-2xl font-semibold ${stats.new > 0 ? 'text-blue-600' : 'text-gray-300'}`}>{stats.new}</p>
            <p className="text-xs text-gray-500">新規</p>
          </div>
          <div className="text-center">
            <p className={`text-2xl font-semibold ${stats.review > 0 ? 'text-amber-500' : 'text-gray-300'}`}>{stats.review}</p>
            <p className="text-xs text-gray-500">復習中</p>
          </div>
          <div className="text-center">
            <p className={`text-2xl font-semibold ${stats.mastered > 0 ? 'text-emerald-600' : 'text-gray-300'}`}>{stats.mastered}</p>
            <p className="text-xs text-gray-500">習得</p>
          </div>
        </div>

        {/* Action buttons */}
        {words.length > 0 && (
          <div className="flex justify-center gap-3 mb-6">
            <Link href={`/quiz/${projectId}`}>
              <Button size="lg">
                <Play className="w-5 h-5 mr-2" />
                クイズ
              </Button>
            </Link>
            {isPro && (
              <Link href={`/review/${projectId}`}>
                <Button size="lg" variant="secondary">
                  <Brain className="w-5 h-5 mr-2" />
                  復習
                  {reviewDueCount > 0 && (
                    <span className="ml-2 bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full text-xs">
                      {reviewDueCount}
                    </span>
                  )}
                </Button>
              </Link>
            )}
          </div>
        )}

        {/* Word list */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-medium text-gray-900">
            {showFavoritesOnly ? `苦手 (${stats.favorites}語)` : `単語一覧 (${stats.total}語)`}
          </h2>
          {stats.favorites > 0 && (
            <button
              onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                showFavoritesOnly
                  ? 'bg-orange-100 text-orange-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <Flag className={`w-4 h-4 ${showFavoritesOnly ? 'fill-orange-500' : ''}`} />
              苦手 {stats.favorites}
            </button>
          )}
        </div>

        <div className="space-y-2">
          {filteredWords.map((word) => (
            <WordItem
              key={`${word.id}:${word.english}:${word.japanese}`}
              word={word}
              isEditing={editingWordId === word.id}
              onEdit={() => setEditingWordId(word.id)}
              onCancel={() => setEditingWordId(null)}
              onSave={(english, japanese) => handleUpdateWord(word.id, english, japanese)}
              onDelete={() => handleDeleteWord(word.id)}
              onToggleFavorite={() => handleToggleFavorite(word.id)}
            />
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

function WordItem({
  word,
  isEditing,
  onEdit,
  onCancel,
  onSave,
  onDelete,
  onToggleFavorite,
}: {
  word: Word;
  isEditing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (english: string, japanese: string) => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
}) {
  const [english, setEnglish] = useState(word.english);
  const [japanese, setJapanese] = useState(word.japanese);

  const statusColors = {
    new: 'bg-blue-50 text-blue-600',
    review: 'bg-amber-50 text-amber-600',
    mastered: 'bg-emerald-50 text-emerald-600',
  };

  const statusLabels = {
    new: '新規',
    review: '復習中',
    mastered: '習得済み',
  };

  if (isEditing) {
    return (
      <div className="bg-white rounded-xl border-2 border-blue-500 p-4">
        <div className="space-y-3">
          <input
            type="text"
            value={english}
            onChange={(e) => setEnglish(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 outline-none text-lg"
            autoFocus
          />
          <input
            type="text"
            value={japanese}
            onChange={(e) => setJapanese(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 outline-none"
          />
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onCancel} className="flex-1">
              <X className="w-4 h-4 mr-1" />
              キャンセル
            </Button>
            <Button size="sm" onClick={() => onSave(english, japanese)} className="flex-1">
              <Save className="w-4 h-4 mr-1" />
              保存
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 group hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-gray-900">{word.english}</p>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${statusColors[word.status]}`}
            >
              {statusLabels[word.status]}
            </span>
            {word.isFavorite && (
              <Flag className="w-4 h-4 fill-orange-500 text-orange-500" />
            )}
          </div>
          <p className="text-gray-600 mt-0.5">{word.japanese}</p>
          {/* Example sentence (Pro feature) */}
          {word.exampleSentence && (
            <div className="mt-2 pt-2 border-t border-gray-100">
              <p className="text-sm text-gray-700 italic">{word.exampleSentence}</p>
              {word.exampleSentenceJa && (
                <p className="text-xs text-gray-500 mt-0.5">{word.exampleSentenceJa}</p>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-1 ml-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onToggleFavorite}
            className="p-2 hover:bg-orange-50 rounded-full transition-colors"
            aria-label={word.isFavorite ? '苦手を解除' : '苦手にマーク'}
          >
            <Flag
              className={`w-4 h-4 ${
                word.isFavorite ? 'fill-orange-500 text-orange-500' : 'text-gray-400'
              }`}
            />
          </button>
          <button
            onClick={onEdit}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <Edit2 className="w-4 h-4 text-gray-500" />
          </button>
          <button
            onClick={onDelete}
            className="p-2 hover:bg-red-50 rounded-full transition-colors"
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </button>
        </div>
      </div>
    </div>
  );
}
