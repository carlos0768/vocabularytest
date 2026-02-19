'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon, AppShell, DeleteConfirmModal } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { StudyModeCard, WordList } from '@/components/home';
import { ProjectBookTile } from '@/components/project';
import { useAuth } from '@/hooks/use-auth';
import { useCollections } from '@/hooks/use-collections';
import { remoteRepository } from '@/lib/db/remote-repository';
import type { Collection, Project, Word } from '@/types';

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
  const [allWords, setAllWords] = useState<(Word & { projectTitle?: string })[]>([]);
  const [loading, setLoading] = useState(true);

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

  const recommendedMode = useMemo(() => {
    if (allWords.length === 0) return null;
    const returnPath = encodeURIComponent(`/collections/${collectionId}`);

    if (stats.newWords > 0) {
      return {
        title: '未学習の単語を覚える',
        description: 'まずは4択クイズで意味を確認しましょう',
        icon: 'quiz',
        href: `/quiz/collection?collectionId=${collectionId}&from=${returnPath}`,
        buttonText: 'クイズを始める',
        iconBg: 'bg-sky-100',
        iconColor: 'text-sky-600',
        bgClasses: 'bg-[var(--color-primary)] text-white shadow-glow hover:opacity-90',
        btnClasses: 'bg-white/20 text-white hover:bg-white/30',
      };
    }
    if (stats.review > 0) {
      return {
        title: '復習して記憶に定着させる',
        description: 'スワイプ式のカードで効率よく復習しましょう',
        icon: 'style',
        href: `/flashcard/collection?collectionId=${collectionId}&from=${returnPath}`,
        buttonText: 'カード学習を始める',
        iconBg: 'bg-indigo-100',
        iconColor: 'text-indigo-600',
        bgClasses: 'bg-[#3B82F6] text-white shadow-glow hover:opacity-90',
        btnClasses: 'bg-white/20 text-white hover:bg-white/30',
      };
    }
    return {
      title: '実践力を試す',
      description: '例文クイズで実際の使われ方を確認しましょう',
      icon: 'auto_awesome',
      href: `/sentence-quiz/collection?collectionId=${collectionId}&from=${returnPath}`,
      buttonText: '例文クイズを始める',
      iconBg: 'bg-amber-100',
      iconColor: 'text-amber-600',
      bgClasses: 'bg-[#60A5FA] text-white shadow-glow hover:opacity-90',
      btnClasses: 'bg-white/20 text-white hover:bg-white/30',
    };
  }, [allWords.length, collectionId, stats.newWords, stats.review]);

  const handleDelete = async () => {
    setDeleteLoading(true);
    try {
      const ok = await deleteCollection(collectionId);
      if (ok) {
        showToast({ message: '本棚を削除しました', type: 'success' });
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
      <div className="pb-28 lg:pb-8">
        <header className="sticky top-0 z-40 bg-[var(--color-background)]/95 border-b border-[var(--color-border-light)]">
          <div className="max-w-lg lg:max-w-xl mx-auto px-6 py-4 flex items-center justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden flex items-center justify-center shrink-0">
                  <Icon name="shelves" size={18} className="text-[var(--color-muted)]" />
                </div>
                <h1 className="text-lg font-bold text-[var(--color-foreground)] truncate">{collection.name}</h1>
                <button
                  onClick={() => setEditing(true)}
                  className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-full hover:bg-[var(--color-surface)] transition-colors text-[var(--color-muted)]"
                >
                  <Icon name="edit" size={16} />
                </button>
                {isPro && (
                  <span className="chip chip-pro px-2 py-1 text-xs">
                    <Icon name="auto_awesome" size={12} />
                    Pro
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--color-muted)]">{stats.total}語 / 習得 {stats.mastered}語</p>
            </div>
            <button
              onClick={() => setShowDeleteModal(true)}
              className="w-9 h-9 rounded-full border border-[var(--color-border)] flex items-center justify-center bg-[var(--color-surface)] text-[var(--color-muted)] hover:text-[var(--color-error)] hover:border-[var(--color-error)] transition-colors"
            >
              <Icon name="delete" size={18} />
            </button>
          </div>
        </header>

        <main className="max-w-lg lg:max-w-2xl mx-auto px-6 py-6 space-y-6">
          <section>
            {recommendedMode ? (
              <div className="card overflow-hidden border-2 border-[var(--color-border)] border-b-4">
                <div className={`p-6 lg:p-8 relative overflow-hidden ${recommendedMode.bgClasses}`}>
                  <div className="relative z-10">
                    <div className="flex items-center gap-4 mb-6">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${recommendedMode.iconBg}`}>
                        <Icon name={recommendedMode.icon} size={28} className={recommendedMode.iconColor} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h2 className="text-xl lg:text-2xl font-bold mb-1 tracking-tight">{recommendedMode.title}</h2>
                        <p className="text-sm font-medium opacity-90">{recommendedMode.description}</p>
                      </div>
                    </div>
                    <Link
                      href={recommendedMode.href}
                      className={`block w-full py-4 rounded-xl text-center font-bold text-base transition-transform active:scale-[0.98] ${recommendedMode.btnClasses}`}
                    >
                      {recommendedMode.buttonText}
                    </Link>
                  </div>
                  <Icon
                    name={recommendedMode.icon}
                    size={160}
                    className="absolute -right-6 -bottom-6 opacity-[0.08] transform rotate-12 pointer-events-none"
                  />
                </div>

                <div className="p-4 bg-[var(--color-surface)] border-t border-[var(--color-border)]">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-bold text-[var(--color-muted)]">現在の進捗</h3>
                    <span className="text-xs font-bold text-[var(--color-foreground)]">
                      {stats.total > 0 ? Math.round((stats.mastered / stats.total) * 100) : 0}% 習得
                    </span>
                  </div>
                  <div className="w-full h-2 bg-[var(--color-border-light)] rounded-full overflow-hidden flex mb-2">
                    <div
                      className="bg-[var(--color-success)] transition-all duration-500"
                      style={{ width: `${stats.total > 0 ? (stats.mastered / stats.total) * 100 : 0}%` }}
                    />
                    <div
                      className="bg-[var(--color-primary)] transition-all duration-500"
                      style={{ width: `${stats.total > 0 ? (stats.review / stats.total) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-semibold text-[var(--color-muted)] px-1">
                    <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)]" />習得 {stats.mastered}</span>
                    <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[var(--color-primary)]" />復習中 {stats.review}</span>
                    <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-[var(--color-border-light)]" />未学習 {stats.newWords}</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 card border-2 border-dashed border-[var(--color-border)] bg-[var(--color-surface-alt,var(--color-surface))]">
                <div className="w-16 h-16 mx-auto bg-[var(--color-surface)] rounded-full flex items-center justify-center border-2 border-[var(--color-border)] mb-4">
                  <Icon name="auto_awesome" size={32} className="text-[var(--color-primary)]" />
                </div>
                <h3 className="text-lg font-bold text-[var(--color-foreground)] mb-2">単語帳を追加して始めましょう</h3>
                <p className="text-sm text-[var(--color-muted)] max-w-[260px] mx-auto">
                  この本棚に単語帳を追加すると、まとめて学習と復習ができます
                </p>
                <button
                  onClick={openAddModal}
                  className="mt-6 px-5 py-3 rounded-xl bg-[var(--color-primary)] text-white font-bold shadow-glow hover:opacity-90"
                >
                  単語帳を追加する
                </button>
              </div>
            )}
          </section>

          {allWords.length > 0 && (
            <section className="space-y-3">
              <h3 className="text-sm font-bold text-[var(--color-foreground)] px-1">その他の学習モード</h3>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StudyModeCard
                  title="クイズ"
                  description="4択で確認"
                  icon="quiz"
                  href={`/quiz/collection?collectionId=${collectionId}&from=${returnTo}`}
                  variant="primary"
                  disabled={allWords.length === 0}
                  layout="vertical"
                  styleMode="home"
                />
                <StudyModeCard
                  title="クイズ２"
                  description="思い出して評価"
                  icon="psychology"
                  href={`/quiz2/collection?collectionId=${collectionId}&from=${returnTo}`}
                  variant="green"
                  disabled={allWords.length === 0}
                  layout="vertical"
                  styleMode="home"
                />
                <StudyModeCard
                  title="カード"
                  description="スワイプ復習"
                  icon="style"
                  href={`/flashcard/collection?collectionId=${collectionId}&from=${returnTo}`}
                  variant="blue"
                  disabled={allWords.length === 0}
                  layout="vertical"
                  styleMode="home"
                />
                <StudyModeCard
                  title="例文"
                  description="例文で定着"
                  icon="auto_awesome"
                  href={`/sentence-quiz/collection?collectionId=${collectionId}&from=${returnTo}`}
                  variant="orange"
                  disabled={allWords.length === 0}
                  layout="vertical"
                  styleMode="home"
                />
              </div>
            </section>
          )}

          <section className="space-y-3 pt-3 border-t border-[var(--color-border-light)]">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-base font-bold text-[var(--color-foreground)]">
                単語一覧 <span className="text-sm font-medium text-[var(--color-muted)] ml-2">{allWords.length}語</span>
              </h2>
            </div>
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
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {memberProjects.map((project) => (
                  <ProjectBookTile
                    key={project.id}
                    project={project}
                    wordCount={project.totalWords}
                    masteredCount={project.masteredWords}
                    progress={project.progress}
                    extraMenuItems={[
                      {
                        label: '本棚から除外',
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

          {(() => {
            const pct = stats.total > 0 ? Math.round((stats.mastered / stats.total) * 100) : 0;
            const circumference = 2 * Math.PI * 54;
            const strokeDashoffset = circumference - (circumference * pct) / 100;

            return (
              <section className="space-y-4">
                <div className="card p-6 flex flex-col items-center">
                  <div className="relative w-36 h-36 mb-4">
                    <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
                      <circle cx="60" cy="60" r="54" fill="none" stroke="var(--color-border)" strokeWidth="10" />
                      <circle
                        cx="60"
                        cy="60"
                        r="54"
                        fill="none"
                        stroke="var(--color-success)"
                        strokeWidth="10"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        className="transition-all duration-700"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-extrabold text-[var(--color-foreground)]">{pct}%</span>
                      <span className="text-xs text-[var(--color-muted)]">習得率</span>
                    </div>
                  </div>
                  <p className="text-sm text-[var(--color-muted)]">
                    {stats.total}語中 <span className="font-bold text-[var(--color-success)]">{stats.mastered}語</span> 習得
                  </p>
                </div>

                <div className="card p-5 space-y-3">
                  <h3 className="text-sm font-bold text-[var(--color-foreground)]">ステータス内訳</h3>
                  {[
                    { label: '習得済み', count: stats.mastered, color: 'var(--color-success)', icon: 'check_circle', iconClass: 'text-[var(--color-success)]' },
                    { label: '復習中', count: stats.review, color: 'var(--color-primary)', icon: 'autorenew', iconClass: 'text-[var(--color-primary)]' },
                    { label: '未学習', count: stats.newWords, color: 'var(--color-muted)', icon: 'radio_button_unchecked', iconClass: 'text-[var(--color-muted)]' },
                  ].map((item) => {
                    const barPct = stats.total > 0 ? (item.count / stats.total) * 100 : 0;
                    return (
                      <div key={item.label} className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Icon name={item.icon} size={16} className={item.iconClass} />
                            <span className="text-sm text-[var(--color-foreground)]">{item.label}</span>
                          </div>
                          <span className="text-sm font-bold text-[var(--color-foreground)]">{item.count}語</span>
                        </div>
                        <div className="w-full h-2 bg-[var(--color-surface-alt,var(--color-border-light))] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${barPct}%`, backgroundColor: item.color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="card p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-light)] flex items-center justify-center">
                      <Icon name="menu_book" size={20} className="text-[var(--color-primary)]" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-[var(--color-foreground)]">{stats.total}</p>
                      <p className="text-xs text-[var(--color-muted)]">総単語</p>
                    </div>
                  </div>
                  <div className="card p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--color-success-light)] flex items-center justify-center">
                      <Icon name="check_circle" size={20} className="text-[var(--color-success)]" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-[var(--color-foreground)]">{stats.mastered}</p>
                      <p className="text-xs text-[var(--color-muted)]">習得済み</p>
                    </div>
                  </div>
                  <div className="card p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--color-primary-light)] flex items-center justify-center">
                      <Icon name="autorenew" size={20} className="text-[var(--color-primary)]" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-[var(--color-foreground)]">{stats.review}</p>
                      <p className="text-xs text-[var(--color-muted)]">復習中</p>
                    </div>
                  </div>
                  <div className="card p-4 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[var(--color-surface)] flex items-center justify-center border border-[var(--color-border)]">
                      <Icon name="shelves" size={20} className="text-[var(--color-muted)]" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-[var(--color-foreground)]">{memberProjects.length}</p>
                      <p className="text-xs text-[var(--color-muted)]">単語帳数</p>
                    </div>
                  </div>
                </div>
              </section>
            );
          })()}
        </main>

        {/* Delete modal */}
        <DeleteConfirmModal
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={handleDelete}
          title="本棚を削除"
          message="この本棚を削除しますか？単語帳自体は削除されません。"
          isLoading={deleteLoading}
        />

        {/* Edit modal */}
        {editing && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50" onClick={() => setEditing(false)}>
            <div
              className="w-full max-w-lg bg-[var(--color-surface)] rounded-t-2xl sm:rounded-2xl p-6 space-y-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-[var(--color-foreground)]">本棚を編集</h3>
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
