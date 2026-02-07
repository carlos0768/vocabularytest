'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon, AppShell, DeleteConfirmModal } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import { useCollections } from '@/hooks/use-collections';
import { useState } from 'react';

export default function CollectionsPage() {
  const router = useRouter();
  const { isPro, loading: authLoading } = useAuth();
  const { collections, loading, deleteCollection, refresh } = useCollections();
  const { showToast } = useToast();

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Redirect free users
  useEffect(() => {
    if (!authLoading && !isPro) {
      router.replace('/subscription');
    }
  }, [authLoading, isPro, router]);

  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    setDeleteLoading(true);
    try {
      const ok = await deleteCollection(deleteId);
      if (ok) {
        showToast({ message: 'プロジェクトを削除しました', type: 'success' });
      } else {
        showToast({ message: '削除に失敗しました', type: 'error' });
      }
    } finally {
      setDeleteLoading(false);
      setDeleteId(null);
    }
  };

  if (authLoading || !isPro) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-screen">
          <Icon name="progress_activity" size={24} className="animate-spin text-[var(--color-muted)]" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="min-h-screen pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-6">
        <header className="sticky top-0 z-40 bg-[var(--color-background)]/95 border-b border-[var(--color-border-light)]">
          <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
            <div className="flex-1">
              <h1 className="text-xl font-bold text-[var(--color-foreground)]">プロジェクト</h1>
              <p className="text-sm text-[var(--color-muted)]">単語帳をまとめて管理</p>
            </div>
            <Link
              href="/collections/new"
              className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-[var(--color-success-light)] text-[var(--color-success)] text-sm font-semibold"
            >
              <Icon name="add" size={16} />
              新規作成
            </Link>
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-6 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-[var(--color-muted)]">
              <Icon name="progress_activity" size={20} className="animate-spin" />
              <span className="ml-2">読み込み中...</span>
            </div>
          ) : collections.length === 0 ? (
            <div className="card p-6 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-[var(--color-success-light)] flex items-center justify-center">
                <Icon name="workspaces" size={24} className="text-[var(--color-success)]" />
              </div>
              <h2 className="mt-4 text-lg font-bold">プロジェクトがありません</h2>
              <p className="text-sm text-[var(--color-muted)] mt-2">
                複数の単語帳をまとめて学期末試験や模試の対策に活用しましょう
              </p>
              <Link
                href="/collections/new"
                className="mt-4 inline-flex items-center justify-center px-4 py-2 rounded-full bg-[var(--color-success)] text-white font-semibold"
              >
                プロジェクトを作成
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {collections.map((collection) => (
                <Link
                  key={collection.id}
                  href={`/collections/${collection.id}`}
                  className="card p-4 flex items-center gap-4 hover:shadow-card hover:border-[var(--color-success)]/30 transition-all"
                >
                  <div className="w-10 h-10 rounded-full bg-[var(--color-success-light)] flex items-center justify-center shrink-0">
                    <Icon name="workspaces" size={22} className="text-[var(--color-success)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--color-foreground)] truncate">{collection.name}</p>
                    {collection.description && (
                      <p className="text-xs text-[var(--color-muted)] truncate mt-0.5">{collection.description}</p>
                    )}
                  </div>
                  <Icon name="chevron_right" size={18} className="text-[var(--color-muted)] shrink-0" />
                </Link>
              ))}
            </div>
          )}
        </main>

        <DeleteConfirmModal
          isOpen={!!deleteId}
          onClose={() => setDeleteId(null)}
          onConfirm={handleConfirmDelete}
          title="プロジェクトを削除"
          message="このプロジェクトを削除しますか？単語帳自体は削除されません。"
          isLoading={deleteLoading}
        />
      </div>
    </AppShell>
  );
}
