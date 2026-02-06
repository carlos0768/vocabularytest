'use client';

import { Icon } from '@/components/ui/Icon';
import type { Project, Word } from '@/types';
import type { WrongAnswer } from '@/lib/utils';

export function ProjectSelectionSheet({
  isOpen,
  onClose,
  projects,
  currentProjectIndex,
  onSelectProject,
  onSelectFavorites,
  onSelectWrongAnswers,
  onSelectAllProjects,
  onCreateNewProject,
  onToggleProjectFavorite,
  onEditProject,
  showFavoritesOnly,
  showWrongAnswers,
  showAllProjects,
  favoriteWords,
  wrongAnswers,
  projectFavoriteCounts,
  totalWords,
}: {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  currentProjectIndex: number;
  onSelectProject: (index: number) => void;
  onSelectFavorites: () => void;
  onSelectWrongAnswers: () => void;
  onSelectAllProjects: () => void;
  onCreateNewProject: () => void;
  onToggleProjectFavorite: (projectId: string) => void;
  onEditProject: (projectId: string, currentName: string) => void;
  showFavoritesOnly: boolean;
  showWrongAnswers: boolean;
  showAllProjects: boolean;
  favoriteWords: Word[];
  wrongAnswers: WrongAnswer[];
  projectFavoriteCounts: Record<string, number>;
  totalWords: number;
}) {
  if (!isOpen) return null;

  const sortedProjects = [...projects].sort((a, b) => {
    if (a.isFavorite && !b.isFavorite) return -1;
    if (!a.isFavorite && b.isFavorite) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const getOriginalIndex = (project: Project) => projects.findIndex(p => p.id === project.id);

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      <div
        className="absolute inset-0 bg-[var(--color-background)] flex flex-col animate-fade-in-up"
      >
        <div className="sticky top-0 bg-[var(--color-background)]/95 px-4 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center justify-between">
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              <Icon name="close" size={24} className="text-[var(--color-primary)]" />
            </button>
            <h2 className="text-lg font-bold text-[var(--color-foreground)]">学習コース選択</h2>
            <div className="w-10" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 pb-8">
          {wrongAnswers.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Icon name="error" size={20} className="text-[var(--color-error)]" />
                <h3 className="font-semibold text-[var(--color-foreground)]">間違え一覧</h3>
              </div>
              <button
                onClick={() => {
                  onSelectWrongAnswers();
                  onClose();
                }}
                className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                  showWrongAnswers
                    ? 'border-[var(--color-error)] bg-[var(--color-error)]/10'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-error)]/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-[var(--color-foreground)]">間違えた単語を復習</p>
                    <p className="text-sm text-[var(--color-muted)] mt-0.5">{wrongAnswers.length}語の間違えた単語</p>
                  </div>
                  {showWrongAnswers && (
                    <div className="w-6 h-6 bg-[var(--color-error)] rounded-full flex items-center justify-center">
                      <Icon name="check" size={16} className="text-white" />
                    </div>
                  )}
                </div>
              </button>
            </div>
          )}

          {favoriteWords.length > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Icon name="flag" size={20} filled className="text-[var(--color-primary)]" />
                <h3 className="font-semibold text-[var(--color-foreground)]">苦手な単語（すべて）</h3>
              </div>
              <button
                onClick={() => {
                  onSelectFavorites();
                  onClose();
                }}
                className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                  showFavoritesOnly
                    ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                    : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-[var(--color-foreground)]">全プロジェクトの苦手単語</p>
                    <p className="text-sm text-[var(--color-muted)] mt-0.5">{favoriteWords.length}語の苦手な単語</p>
                  </div>
                  {showFavoritesOnly && (
                    <div className="w-6 h-6 bg-[var(--color-primary)] rounded-full flex items-center justify-center">
                      <Icon name="check" size={16} className="text-white" />
                    </div>
                  )}
                </div>
              </button>
            </div>
          )}

          {projects.length > 1 && totalWords > 0 && (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <Icon name="layers" size={20} className="text-[var(--color-primary)]" />
                <h3 className="font-semibold text-[var(--color-foreground)]">全ての単語</h3>
              </div>
              <button
                onClick={() => {
                  onSelectAllProjects();
                  onClose();
                }}
                className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                  showAllProjects
                    ? 'border-[var(--color-primary)] bg-gradient-to-br from-[var(--color-primary)]/20 to-[var(--color-primary-light)]'
                    : 'border-[var(--color-border)] bg-gradient-to-br from-[var(--color-surface)] to-[var(--color-primary-light)]/50 hover:border-[var(--color-primary)]/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-[var(--color-foreground)]">全プロジェクトの単語</p>
                    <p className="text-sm text-[var(--color-muted)] mt-0.5">{projects.length}冊 · {totalWords}語</p>
                  </div>
                  {showAllProjects && (
                    <div className="w-6 h-6 bg-[var(--color-primary)] rounded-full flex items-center justify-center">
                      <Icon name="check" size={16} className="text-white" />
                    </div>
                  )}
                </div>
              </button>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Icon name="menu_book" size={20} className="text-[var(--color-primary)]" />
                <h3 className="font-semibold text-[var(--color-foreground)]">単語帳一覧</h3>
              </div>
            </div>

            <button
              onClick={() => {
                onClose();
                onCreateNewProject();
              }}
              className="w-full flex items-center gap-3 p-4 mb-3 rounded-2xl border-2 border-dashed border-[var(--color-primary)]/50 bg-[var(--color-primary-light)] hover:bg-[var(--color-primary)]/10 hover:border-[var(--color-primary)] transition-all"
            >
              <div className="w-10 h-10 bg-[var(--color-primary)]/20 rounded-full flex items-center justify-center">
                <Icon name="add" size={20} className="text-[var(--color-primary)]" />
              </div>
              <div className="text-left">
                <p className="font-semibold text-[var(--color-primary)]">新しい単語帳を作成</p>
                <p className="text-sm text-[var(--color-primary)]/70">写真から単語を抽出</p>
              </div>
            </button>

            <div className="space-y-2">
              {sortedProjects.map((project) => {
                const originalIndex = getOriginalIndex(project);
                const isSelected = originalIndex === currentProjectIndex && !showFavoritesOnly && !showWrongAnswers;
                const favoriteCount = projectFavoriteCounts[project.id] || 0;
                return (
                  <div
                    key={project.id}
                    className={`w-full p-4 rounded-2xl border-2 transition-all ${
                      isSelected
                        ? 'border-[var(--color-primary)] bg-[var(--color-primary-light)]'
                        : 'border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-primary)]/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => {
                          onSelectProject(originalIndex);
                          onClose();
                        }}
                        className="flex-1 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-[var(--color-foreground)]">{project.title}</p>
                          {project.isFavorite && (
                            <Icon name="star" size={16} filled className="text-yellow-400" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-sm text-[var(--color-muted)]">
                            {new Date(project.createdAt).toLocaleDateString('ja-JP')}に作成
                          </p>
                          {favoriteCount > 0 && (
                            <span className="flex items-center gap-1 text-sm text-[var(--color-primary)]">
                              <Icon name="flag" size={12} filled className="text-[var(--color-primary)]" />
                              {favoriteCount}
                            </span>
                          )}
                        </div>
                      </button>
                      <div className="flex items-center gap-2 ml-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleProjectFavorite(project.id);
                          }}
                          className="p-2 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 rounded-full transition-colors"
                          title={project.isFavorite ? 'ブックマーク解除' : 'ブックマーク'}
                        >
                          <Icon
                            name="star"
                            size={20}
                            filled={project.isFavorite}
                            className={project.isFavorite ? 'text-yellow-400' : 'text-[var(--color-muted)] hover:text-yellow-400'}
                          />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditProject(project.id, project.title);
                          }}
                          className="p-2 hover:bg-[var(--color-primary-light)] rounded-full transition-colors"
                          title="名前を編集"
                        >
                          <Icon name="edit" size={16} className="text-[var(--color-muted)] hover:text-[var(--color-primary)]" />
                        </button>
                        {isSelected && (
                          <div className="w-6 h-6 bg-[var(--color-primary)] rounded-full flex items-center justify-center">
                            <Icon name="check" size={16} className="text-white" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
