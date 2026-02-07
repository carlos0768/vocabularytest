'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon, AppShell, DeleteConfirmModal } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { StudyModeCard, WordList } from '@/components/home';
import { ProjectCard } from '@/components/project';
import { useAuth } from '@/hooks/use-auth';
import { useCollections } from '@/hooks/use-collections';
import { remoteRepository } from '@/lib/db/remote-repository';
import type { Collection, Project, Word } from '@/types';

interface ProjectWithStats extends Project {
  totalWords: number;
  masteredWords: number;
  progress: number;
}

const tabs = [
  { id: 'study', label: '学習' },
  { id: 'words', label: '単語' },
  { id: 'notebooks', label: '単語帳' },
  { id: 'stats', label: '統計' },
] as const;

type TabId = (typeof tabs)[number]['id'];

export default function CollectionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const collectionId = params.id as string;

  const { user, isPro, loading: authLoading } = useAuth();
  const { deleteCollection, updateCollection, getCollectionProjects, removeProjectFromCollection, addProjectsToCollection } = useCollections();
  const { showToast } = useToast();

  const [collection, setCollection] = useState<Collection | null>(null);
  const [memberProjects, setMemberProjects] = useState<ProjectWithStats[]>([]);
  const [allWords, setAllWords] = useState<(Word & { projectTitle?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('study');

  // Delete modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');

  // Word edit (read-only for collection, no add)
  const [editingWordId, setEditingWordId] = useState<string | null>(null);

  // Add projects modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [allUserProjects, setAllUserProjects] = useState<Project[]>([]);
  const [addSelectedIds, setAddSelectedIds] = useState<Set<string>>(new Set());
  const [addLoading, setAddLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!user || !isPro) return;

    try {
      setLoading(true);

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
        setAllWords([]);
        return;
      }

      const projectIds = colProjects.map((cp) => cp.projectId);
      const [projects, wordsByProject] = await Promise.all([
        Promise.all(projectIds.map((id) => remoteRepository.getProject(id))),
        remoteRepository.getAllWordsByProjectIds(projectIds),
      ]);

      const validProjects = projects.filter((p): p is Project => p !== undefined);
      const projectMap = new Map(validProjects.map((p) => [p.id, p]));

      const withStats: ProjectWithStats[] = validProjects.map((project) => {
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

      // Merge all words with project title
      const merged = projectIds.flatMap((id) =>
        (wordsByProject[id] ?? []).map((w) => ({
          ...w,
          projectTitle: projectMap.get(id)?.title,
        }))
      );
      setAllWords(merged);
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

  const stats = useMemo(() => {
    const total = allWords.length;
    const mastered = allWords.filter((w) => w.status === 'mastered').length;
    const review = allWords.filter((w) => w.status === 'review').length;
    const newWords = allWords.filter((w) => w.status === 'new').length;
    return { total, mastered, review, newWords };
  }, [allWords]);

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
      setAllWords((prev) => prev.filter((w) => {
        const project = memberProjects.find((p) => p.id === projectId);
        return project ? w.projectTitle !== project.title : true;
      }));
      showToast({ message: '単語帳を除外しました', type: 'success' });
    }
  };

  const handleUpdateWord = async (wordId: string, english: string, japanese: string) => {
    await remoteRepository.updateWord(wordId, { english, japanese });
    setAllWords((prev) => prev.map((w) => (w.id === wordId ? { ...w, english, japanese } : w)));
    setEditingWordId(null);
  };

  const handleDeleteWord = async (wordId: string) => {
    await remoteRepository.deleteWord(wordId);
    setAllWords((prev) => prev.filter((w) => w.id !== wordId));
    showToast({ message: '単語を削除しました', type: 'success' });
  };

  const handleToggleFavorite = async (wordId: string) => {
    const word = allWords.find((w) => w.id === wordId);
    if (!word) return;
    const newFav = !word.isFavorite;
    await remoteRepository.updateWord(wordId, { isFavorite: newFav });
    setAllWords((prev) => prev.map((w) => (w.id === wordId ? { ...w, isFavorite: newFav } : w)));
  };

  const openAddModal = async () => {
    if (!user) return;
    try {
      const all = await remoteRepository.getProjects(user.id);
      setAllUserProjects(all);
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

  const returnTo = encodeURIComponent(`/collections/${collectionId}`);
  const existingProjectIds = new Set(memberProjects.map((p) => p.id));
  const addableProjects = allUserProjects.filter((p) => !existingProjectIds.has(p.id));

  return (
    <AppShell>
      <div className="pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-8">
        <header className="sticky top-0 z-40 bg-[var(--color-background)]/95 border-b border-[var(--color-border-light)]">
          <div className="max-w-lg lg:max-w-5xl mx-auto px-4 lg:px-8 py-4 flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <button onClick={() => router.push('/collections')} className="p-1 -ml-1">
                  <Icon name="arrow_back" size={22} className="text-[var(--color-foreground)]" />
                </button>
                <h1 className="text-lg font-bold text-[var(--color-foreground)] truncate">{collection.name}</h1>
                <button
                  onClick={() => setEditing(true)}
                  className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full hover:bg-[var(--color-surface)] transition-colors text-[var(--color-muted)]"
                >
                  <Icon name="edit" size={16} />
                </button>
              </div>
              <p className="text-xs text-[var(--color-muted)] ml-8">{stats.total}語 / 習得 {stats.mastered}語</p>
            </div>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="w-9 h-9 rounded-full border border-[var(--color-border)] flex items-center justify-center bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-error)] hover:border-[var(--color-error)] transition-colors"
            >
              <Icon name="delete" size={18} />
            </button>
          </div>
        </header>

        <main className="max-w-lg lg:max-w-5xl mx-auto px-4 lg:px-8 py-6 space-y-6">
          {/* Tabs */}
          <div className="flex gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 px-3 py-2 rounded-full text-sm font-semibold border transition-colors ${
                  activeTab === tab.id
                    ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                    : 'bg-[var(--color-surface)] text-[var(--color-muted)] border-[var(--color-border)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Study tab */}
          {activeTab === 'study' && (
            <section className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                <StudyModeCard
                  title="クイズ"
                  description="4択で意味を確認"
                  icon="quiz"
                  href={`/quiz/collection?collectionId=${collectionId}&from=${returnTo}`}
                  variant="primary"
                  disabled={allWords.length === 0}
                />
                <StudyModeCard
                  title="カード"
                  description="スワイプで復習"
                  icon="style"
                  href={`/flashcard/collection?collectionId=${collectionId}&from=${returnTo}`}
                  variant="blue"
                  disabled={allWords.length === 0}
                />
                <StudyModeCard
                  title="例文クイズ"
                  description="例文で記憶を定着"
                  icon="auto_awesome"
                  href={`/sentence-quiz/collection?collectionId=${collectionId}&from=${returnTo}`}
                  variant="orange"
                  disabled={allWords.length === 0}
                />
                <StudyModeCard
                  title="音声クイズ"
                  description="聞いて書く練習"
                  icon="headphones"
                  href={`/dictation?collectionId=${collectionId}`}
                  variant="purple"
                  disabled={allWords.length < 10}
                />
              </div>
            </section>
          )}

          {/* Words tab */}
          {activeTab === 'words' && (
            <section>
              <WordList
                words={allWords}
                editingWordId={editingWordId}
                onEditStart={(wordId) => setEditingWordId(wordId)}
                onEditCancel={() => setEditingWordId(null)}
                onSave={handleUpdateWord}
                onDelete={handleDeleteWord}
                onToggleFavorite={handleToggleFavorite}
                showProjectName
              />
            </section>
          )}

          {/* Notebooks tab */}
          {activeTab === 'notebooks' && (
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
                    <ProjectCard
                      key={project.id}
                      project={project}
                      wordCount={project.totalWords}
                      masteredCount={project.masteredWords}
                      progress={project.progress}
                      extraMenuItems={[
                        {
                          label: 'プロジェクトから除外',
                          icon: 'link_off',
                          onClick: handleRemoveProject,
                          danger: true,
                        },
                      ]}
                    />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Stats tab */}
          {activeTab === 'stats' && (
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="card p-4">
                <p className="text-xs text-[var(--color-muted)]">総単語</p>
                <p className="text-2xl font-bold text-[var(--color-foreground)] mt-2">{stats.total}</p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-[var(--color-muted)]">習得済み</p>
                <p className="text-2xl font-bold text-[var(--color-foreground)] mt-2">{stats.mastered}</p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-[var(--color-muted)]">復習中</p>
                <p className="text-2xl font-bold text-[var(--color-foreground)] mt-2">{stats.review}</p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-[var(--color-muted)]">未学習</p>
                <p className="text-2xl font-bold text-[var(--color-foreground)] mt-2">{stats.newWords}</p>
              </div>
              <div className="card p-4">
                <p className="text-xs text-[var(--color-muted)]">単語帳数</p>
                <p className="text-2xl font-bold text-[var(--color-foreground)] mt-2">{memberProjects.length}</p>
              </div>
            </section>
          )}
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
