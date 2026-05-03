'use client';

import Link from 'next/link';
import { Icon, DeleteConfirmModal } from '@/components/ui';
import { CollectionBookshelfCard } from '@/components/collection/CollectionBookshelfCard';
import { SolidEmpty, SolidHeader, SolidPage } from '@/components/redesign/SolidPage';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import { useCollections } from '@/hooks/use-collections';
import { useState } from 'react';

export default function CollectionsPage() {
  const { loading: authLoading } = useAuth();
  const { collections, stats, previews, loading, deleteCollection } = useCollections();
  const { showToast } = useToast();

  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    setDeleteLoading(true);
    try {
      const ok = await deleteCollection(deleteId);
      if (ok) {
        showToast({ message: '本棚を削除しました', type: 'success' });
      } else {
        showToast({ message: '削除に失敗しました', type: 'error' });
      }
    } finally {
      setDeleteLoading(false);
      setDeleteId(null);
    }
  };

  if (authLoading) {
    return (
      <>
        <div className="flex items-center justify-center min-h-screen">
          <Icon name="progress_activity" size={24} className="animate-spin text-[var(--color-muted)]" />
        </div>
      </>
    );
  }

  return (
    <>
      <SolidPage maxWidth="max-w-2xl">
        <SolidHeader
          eyebrow="COLLECTIONS"
          title="コレクション"
          description="複数の単語帳を本棚としてまとめ、試験範囲やテーマごとに整理します。"
          actions={
            <Link href="/collections/new" className="solid-link-primary">
              <Icon name="add" size={16} />
              新規作成
            </Link>
          }
        />
          {loading && collections.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-[var(--color-muted)]">
              <Icon name="progress_activity" size={20} className="animate-spin" />
              <span className="ml-2">読み込み中...</span>
            </div>
          ) : collections.length === 0 ? (
            <SolidEmpty
              icon="shelves"
              title="本棚がありません"
              description="複数の単語帳をまとめて学期末試験や模試の対策に活用しましょう。"
              action={
              <Link
                href="/collections/new"
                className="solid-link-primary"
              >
                <Icon name="add" size={18} />
                本棚を作成
              </Link>
              }
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {collections.map((collection) => {
                const s = stats[collection.id];
                return (
                  <CollectionBookshelfCard
                    key={collection.id}
                    id={collection.id}
                    name={collection.name}
                    projectCount={s?.projectCount ?? 0}
                    wordCount={s?.wordCount ?? 0}
                    masteredCount={s?.masteredCount ?? 0}
                    previews={previews[collection.id] ?? []}
                  />
                );
              })}
            </div>
          )}

        <DeleteConfirmModal
          isOpen={!!deleteId}
          onClose={() => setDeleteId(null)}
          onConfirm={handleConfirmDelete}
          title="本棚を削除"
          message="この本棚を削除しますか？単語帳自体は削除されません。"
          isLoading={deleteLoading}
        />
      </SolidPage>
    </>
  );
}
