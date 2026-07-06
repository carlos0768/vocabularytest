'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { SolidHeader, SolidPage, SolidPanel, SolidSectionTitle } from '@/components/redesign/SolidPage';
import { useAuth } from '@/hooks/use-auth';
import { useCollections } from '@/hooks/use-collections';
import { remoteRepository } from '@/lib/db/remote-repository';
import { localRepository } from '@/lib/db/local-repository';
import { excludeReelSavedProjects } from '@/lib/reels/saved-words';
import type { Project } from '@/types';

export default function NewCollectionPage() {
  const router = useRouter();
  const { user, isPro, loading: authLoading } = useAuth();
  const { createCollection, addProjectsToCollection } = useCollections();
  const { showToast } = useToast();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load user's projects (Pro: remote, Free: local)
  useEffect(() => {
    if (!user || authLoading) return;
    (async () => {
      try {
        const data = isPro
          ? await remoteRepository.getProjects(user.id)
          : await localRepository.getProjects(user.id);
        setProjects(excludeReelSavedProjects(data));
      } catch (e) {
        console.error('Failed to load projects:', e);
      } finally {
        setLoadingProjects(false);
      }
    })();
  }, [user, authLoading, isPro]);

  const toggleProject = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const canSave = name.trim().length > 0;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const collection = await createCollection(name.trim(), description.trim() || undefined);
      if (!collection) {
        showToast({ message: '作成に失敗しました', type: 'error' });
        return;
      }

      // Add selected projects
      if (selectedIds.size > 0) {
        await addProjectsToCollection(collection.id, Array.from(selectedIds));
      }

      showToast({ message: '本棚を作成しました', type: 'success' });
      router.replace(`/collections/${collection.id}`);
    } catch (e) {
      console.error('Failed to create collection:', e);
      showToast({ message: '作成に失敗しました', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Icon name="progress_activity" size={24} className="animate-spin text-[var(--color-muted)]" />
      </div>
    );
  }

  return (
    <SolidPage maxWidth="max-w-lg">
      <SolidHeader
        eyebrow="NEW COLLECTION"
        title="新しい本棚"
        description="単語帳をまとめる名前と説明を設定します。"
        actions={
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            className="solid-link-primary disabled:opacity-40"
          >
            {saving ? (
              <Icon name="progress_activity" size={16} className="animate-spin" />
            ) : (
              '作成'
            )}
          </button>
        }
      />

      <div className="space-y-6">
        {/* Name */}
        <SolidPanel className="space-y-4 p-5">
        <div className="space-y-2">
          <label className="text-sm font-semibold text-[var(--color-foreground)]">本棚の名前</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：学期末試験"
            className="solid-input w-full px-4 py-3"
            autoFocus
          />
        </div>

        {/* Description */}
        <div className="space-y-2">
          <label className="text-sm font-semibold text-[var(--color-foreground)]">
            説明<span className="text-[var(--color-muted)] font-normal ml-1">（任意）</span>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="例：12月の期末試験で出題される範囲"
            rows={3}
            className="solid-input w-full resize-none px-4 py-3"
          />
        </div>
        </SolidPanel>

        {/* Project selection */}
        <div className="space-y-3">
          <SolidSectionTitle icon="menu_book" title="含める単語帳" count={`${selectedIds.size}件選択`} />

          {loadingProjects ? (
            <div className="flex items-center justify-center py-8 text-[var(--color-muted)]">
              <Icon name="progress_activity" size={20} className="animate-spin" />
              <span className="ml-2">単語帳を読み込み中...</span>
            </div>
          ) : projects.length === 0 ? (
            <div className="card p-4 text-center text-sm text-[var(--color-muted)]">
              単語帳がありません。まずスキャンから単語帳を作成してください。
            </div>
          ) : (
            <div className="space-y-2">
              {projects.map((project) => {
                const selected = selectedIds.has(project.id);
                return (
                  <button
                    key={project.id}
                    onClick={() => toggleProject(project.id)}
                    className={`card flex w-full items-center gap-3 p-3 text-left transition-all ${
                      selected
                        ? 'bg-[var(--color-success-light)]'
                        : ''
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                        selected
                          ? 'bg-[var(--color-success)] border-[var(--color-success)]'
                          : 'border-[var(--color-border)]'
                      }`}
                    >
                      {selected && <Icon name="check" size={14} className="text-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--color-foreground)] truncate">{project.title}</p>
                      <p className="text-xs text-[var(--color-muted)]">
                        {new Date(project.createdAt).toLocaleDateString('ja-JP')}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </SolidPage>
  );
}
