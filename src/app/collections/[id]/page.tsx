'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon, AppShell, DeleteConfirmModal } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { ProjectCard } from '@/components/project';
import { useAuth } from '@/hooks/use-auth';
import { useCollections } from '@/hooks/use-collections';
import { remoteRepository } from '@/lib/db/remote-repository';
import type { Collection, Project, Word, CollectionProject } from '@/types';

interface ProjectWithStats extends Project {
  totalWords: number;
  masteredWords: number;
  progress: number;
}

export default function CollectionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const collectionId = params.id as string;

  const { user, isPro, loading: authLoading } = useAuth();
  const { deleteCollection, updateCollection, getCollectionProjects, removeProjectFromCollection, addProjectsToCollection } = useCollections();
  const { showToast } = useToast();

  const [collection, setCollection] = useState<Collection | null>(null);
  const [memberProjects, setMemberProjects] = useState<ProjectWithStats[]>([]);
  const [loading, setLoading] = useState(true);

  // Delete modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');

  // Add projects modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [addSelectedIds, setAddSelectedIds] = useState<Set<string>>(new Set());
  const [addLoading, setAddLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!user || !isPro) return;

    try {
      setLoading(true);

      // Fetch collection and its projects in parallel
      const [col, colProjects] = await Promise.all([
        remoteRepository.getCollection(collectionId),
        getCollectionProjects(collectionId),
      ]);

      if (!col) {
        router.replace('/collections');
        return;
      }

      setCollection(col);
      setEditName(col.name);
      setEditDesc(col.description || '');

      if (colProjects.length === 0) {
        setMemberProjects([]);
        return;
      }

      // Fetch project details and word stats
      const projectIds = colProjects.map((cp) => cp.projectId);
      const [projects, wordsByProject] = await Promise.all([
        Promise.all(projectIds.map((id) => remoteRepository.getProject(id))),
        remoteRepository.getAllWordsByProjectIds(projectIds),
      ]);

      const withStats: ProjectWithStats[] = projects
        .filter((p): p is Project => p !== undefined)
        .map((project) => {
          const words = wordsByProject[project.id] || [];
          const mastered = words.filter((w) => w.status === 'mastered').length;
          const total = words.length;
          return {
            ...project,
            totalWords: total,
            masteredWords: mastered,
            progress: total > 0 ? Math.round((mastered / total) * 100) : 0,
          };
        });

      setMemberProjects(withStats);
    } catch (e) {
      console.error('Failed to load collection:', e);
    } finally {
      setLoading(false);
    }
  }, [user, isPro, collectionId, getCollectionProjects, router]);

  useEffect(() => {
    if (!authLoading && isPro) {
      loadData();
    } else if (!authLoading && !isPro) {
      router.replace('/subscription');
    }
  }, [authLoading, isPro, loadData, router]);

  const totalWords = memberProjects.reduce((sum, p) => sum + p.totalWords, 0);
  const totalMastered = memberProjects.reduce((sum, p) => sum + p.masteredWords, 0);

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      const ok = await deleteCollection(collectionId);
      if (ok) {
        showToast({ message: 'プロジェクトを削除しました', type: 'success' });
        router.replace('/collections');
      } else {
        showToast({ message: '削除に失敗しました', type: 'error' });
      }
    } finally {
      setDeleteLoading(false);
      setShowDeleteModal(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editName.trim()) return;
    const ok = await updateCollection(collectionId, {
      name: editName.trim(),
      description: editDesc.trim() || undefined,
    });
    if (ok) {
      setCollection((prev) =>
        prev ? { ...prev, name: editName.trim(), description: editDesc.trim() || undefined } : prev
      );
      setEditing(false);
      showToast({ message: '更新しました', type: 'success' });
    } else {
      showToast({ message: '更新に失敗しました', type: 'error' });
    }
  };

  const handleRemoveProject = async (projectId: string) => {
    const ok = await removeProjectFromCollection(collectionId, projectId);
    if (ok) {
      setMemberProjects((prev) => prev.filter((p) => p.id !== projectId));
      showToast({ message: '単語帳を除外しました', type: 'success' });
    }
  };

  const openAddModal = async () => {
    if (!user) return;
    try {
      const all = await remoteRepository.getProjects(user.id);
      setAllProjects(all);
      setAddSelectedIds(new Set());
      setShowAddModal(true);
    } catch (e) {
      console.error('Failed to load projects for adding:', e);
    }
  };

  const handleAddProjects = async () => {
    if (addSelectedIds.size === 0) return;
    setAddLoading(true);
    try {
      const ok = await addProjectsToCollection(collectionId, Array.from(addSelectedIds));
      if (ok) {
        showToast({ message: '単語帳を追加しました', type: 'success' });
        setShowAddModal(false);
        loadData();
      }
    } finally {
      setAddLoading(false);
    }
  };

  if (authLoading || loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-screen">
          <Icon name="progress_activity" size={24} className="animate-spin text-[var(--color-muted)]" />
        </div>
      </AppShell>
    );
  }

  if (!collection) return null;

  const existingProjectIds = new Set(memberProjects.map((p) => p.id));
  const addableProjects = allProjects.filter((p) => !existingProjectIds.has(p.id));

  return (
    <AppShell>
      <div className="min-h-screen pb-28 lg:pb-6">
        <header className="sticky top-0 z-40 bg-[var(--color-background)]/95 border-b border-[var(--color-border-light)]">
          <div className="max-w-lg mx-auto px-4 py-4 flex items-center gap-3">
            <button onClick={() => router.push('/collections')} className="p-1 -ml-1">
              <Icon name="arrow_back" size={22} className="text-[var(--color-foreground)]" />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-[var(--color-foreground)] truncate">{collection.name}</h1>
              {collection.description && (
                <p className="text-xs text-[var(--color-muted)] truncate">{collection.description}</p>
              )}
            </div>
            <button onClick={() => setEditing(true)} className="p-2">
              <Icon name="edit" size={20} className="text-[var(--color-muted)]" />
            </button>
            <button onClick={() => setShowDeleteModal(true)} className="p-2">
              <Icon name="delete" size={20} className="text-[var(--color-error)]" />
            </button>
          </div>
        </header>

        <main className="max-w-lg mx-auto px-4 py-6 space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="card p-3 text-center">
              <p className="text-lg font-bold text-[var(--color-foreground)]">{memberProjects.length}</p>
              <p className="text-xs text-[var(--color-muted)]">単語帳</p>
            </div>
            <div className="card p-3 text-center">
              <p className="text-lg font-bold text-[var(--color-foreground)]">{totalWords}</p>
              <p className="text-xs text-[var(--color-muted)]">単語数</p>
            </div>
            <div className="card p-3 text-center">
              <p className="text-lg font-bold text-[var(--color-success)]">{totalMastered}</p>
              <p className="text-xs text-[var(--color-muted)]">習得済み</p>
            </div>
          </div>

          {/* Member projects */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[var(--color-muted)]">所属する単語帳</h2>
              <button
                onClick={openAddModal}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-[var(--color-border)] text-xs font-semibold text-[var(--color-foreground)] hover:border-[var(--color-success)] transition-colors"
              >
                <Icon name="add" size={14} />
                追加
              </button>
            </div>

            {memberProjects.length === 0 ? (
              <div className="card p-5 text-sm text-[var(--color-muted)] text-center">
                まだ単語帳が追加されていません
              </div>
            ) : (
              <div className="space-y-3">
                {memberProjects.map((project) => (
                  <div key={project.id} className="relative">
                    <ProjectCard
                      project={project}
                      wordCount={project.totalWords}
                      masteredCount={project.masteredWords}
                      progress={project.progress}
                    />
                    <button
                      onClick={() => handleRemoveProject(project.id)}
                      className="absolute top-3 right-3 p-1.5 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] hover:border-[var(--color-error)] transition-colors z-10"
                      title="この単語帳をプロジェクトから除外"
                    >
                      <Icon name="close" size={14} className="text-[var(--color-muted)]" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>

        {/* Delete modal */}
        <DeleteConfirmModal
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={handleDelete}
          title="プロジェクトを削除"
          message="このプロジェクトを削除しますか？単語帳自体は削除されません。"
          isLoading={deleteLoading}
        />

        {/* Edit modal */}
        {editing && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={() => setEditing(false)}>
            <div
              className="w-full max-w-lg bg-[var(--color-surface)] rounded-t-2xl sm:rounded-2xl p-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-[var(--color-foreground)]">プロジェクトを編集</h3>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-[var(--color-foreground)]">名前</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-4 py-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-background)] focus:outline-none focus:border-[var(--color-success)] text-[var(--color-foreground)]"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-[var(--color-foreground)]">説明</label>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-background)] focus:outline-none focus:border-[var(--color-success)] text-[var(--color-foreground)] resize-none"
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setEditing(false)}
                  className="flex-1 py-2.5 rounded-full border border-[var(--color-border)] text-sm font-semibold text-[var(--color-foreground)]"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleSaveEdit}
                  disabled={!editName.trim()}
                  className="flex-1 py-2.5 rounded-full bg-[var(--color-success)] text-white text-sm font-semibold disabled:opacity-40"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add projects modal */}
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={() => setShowAddModal(false)}>
            <div
              className="w-full max-w-lg max-h-[80vh] bg-[var(--color-surface)] rounded-t-2xl sm:rounded-2xl p-6 flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-[var(--color-foreground)] mb-4">単語帳を追加</h3>
              <div className="flex-1 overflow-y-auto space-y-2 mb-4">
                {addableProjects.length === 0 ? (
                  <p className="text-sm text-[var(--color-muted)] text-center py-4">追加できる単語帳がありません</p>
                ) : (
                  addableProjects.map((project) => {
                    const selected = addSelectedIds.has(project.id);
                    return (
                      <button
                        key={project.id}
                        onClick={() => {
                          setAddSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(project.id)) next.delete(project.id);
                            else next.add(project.id);
                            return next;
                          });
                        }}
                        className={`w-full card p-3 flex items-center gap-3 text-left transition-all ${
                          selected ? 'border-[var(--color-success)] bg-[var(--color-success)]/5' : ''
                        }`}
                      >
                        <div
                          className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                            selected ? 'bg-[var(--color-success)] border-[var(--color-success)]' : 'border-[var(--color-border)]'
                          }`}
                        >
                          {selected && <Icon name="check" size={14} className="text-white" />}
                        </div>
                        <p className="text-sm font-medium text-[var(--color-foreground)] truncate">{project.title}</p>
                      </button>
                    );
                  })
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-full border border-[var(--color-border)] text-sm font-semibold text-[var(--color-foreground)]"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleAddProjects}
                  disabled={addSelectedIds.size === 0 || addLoading}
                  className="flex-1 py-2.5 rounded-full bg-[var(--color-success)] text-white text-sm font-semibold disabled:opacity-40"
                >
                  {addLoading ? (
                    <Icon name="progress_activity" size={16} className="animate-spin" />
                  ) : (
                    `追加（${addSelectedIds.size}件）`
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
