'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/hooks/use-auth';
import { useProjects } from '@/hooks/use-projects';
import { getRepository } from '@/lib/db';
import { invalidateHomeCache } from '@/lib/home-cache';
import { createBrowserClient } from '@/lib/supabase';
import type { SubscriptionStatus } from '@/types';

/**
 * Parse shared text from Google Translate.
 * Only supports Google Translate share format (English + Japanese pair).
 *
 * Supported formats:
 *  - "apple\nりんご"      → newline-separated (Google Translate default)
 *  - "apple - りんご"     → dash-separated
 *  - "apple"              → English only (user enters Japanese manually)
 */
function parseSharedText(text: string): { english: string; japanese: string } {
  const trimmed = text.trim();

  // Newline-separated (Google Translate default)
  if (trimmed.includes('\n')) {
    const lines = trimmed.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length >= 2) {
      return { english: lines[0], japanese: lines[1] };
    }
    return { english: lines[0] || '', japanese: '' };
  }

  // Dash-separated: "apple - りんご"
  const dashMatch = trimmed.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if (dashMatch) {
    return { english: dashMatch[1].trim(), japanese: dashMatch[2].trim() };
  }

  // Single word/phrase — user enters Japanese manually
  return { english: trimmed, japanese: '' };
}

async function getAuthHeaders(): Promise<HeadersInit> {
  const supabase = createBrowserClient();
  const { data: { session } } = await supabase.auth.getSession();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (session?.access_token) {
    headers.Authorization = `Bearer ${session.access_token}`;
  }
  return headers;
}

function ShareTargetContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { subscription, loading: authLoading } = useAuth();
  const { projects, loading: projectsLoading, createProject } = useProjects();

  const sharedText = searchParams.get('text') || '';

  const parsed = useMemo(() => parseSharedText(sharedText), [sharedText]);

  const [english, setEnglish] = useState(parsed.english);
  const [japanese, setJapanese] = useState(parsed.japanese);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [newProjectName, setNewProjectName] = useState('');
  const [showNewProject, setShowNewProject] = useState(false);
  const [saving, setSaving] = useState(false);

  // Auto-select first project once loaded
  useEffect(() => {
    if (!projectsLoading && projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projectsLoading, projects, selectedProjectId]);

  const isLoading = authLoading || projectsLoading;

  // No shared text
  if (!sharedText) {
    return (
      <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center px-4">
        <div className="text-center">
          <Icon name="share" size={48} className="text-[var(--color-muted)] mx-auto mb-4" />
          <p className="text-[var(--color-foreground)] font-medium mb-2">
            共有テキストがありません
          </p>
          <p className="text-sm text-[var(--color-muted)] mb-6">
            Google翻訳などから共有メニューを使ってください
          </p>
          <Button onClick={() => router.push('/')}>
            ホームに戻る
          </Button>
        </div>
      </div>
    );
  }

  const handleSave = async () => {
    if (!english.trim()) {
      showToast({ message: '英単語を入力してください', type: 'error' });
      return;
    }
    if (!japanese.trim()) {
      showToast({ message: '日本語訳を入力してください', type: 'error' });
      return;
    }

    if (isLoading) return;

    setSaving(true);
    try {
      const subscriptionStatus: SubscriptionStatus = subscription?.status || 'free';
      const wasPro = subscription?.plan === 'pro' && subscriptionStatus !== 'active';
      const repository = getRepository(subscriptionStatus, wasPro);

      // Determine project
      let targetProjectId: string;

      if (showNewProject && newProjectName.trim()) {
        const project = await createProject(newProjectName.trim());
        if (!project) throw new Error('単語帳作成に失敗');
        targetProjectId = project.id;
      } else if (selectedProjectId) {
        targetProjectId = selectedProjectId;
      } else {
        // No projects exist — auto-create "共有単語"
        const project = await createProject('共有単語');
        if (!project) throw new Error('単語帳作成に失敗');
        targetProjectId = project.id;
      }

      // Generate distractors + example sentence (best-effort)
      let distractors: string[] = [];
      let exampleSentence = '';
      let exampleSentenceJa = '';
      try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/generate-quiz-distractors', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            words: [{ id: 'share-1', english: english.trim(), japanese: japanese.trim() }],
          }),
        });
        const data = await res.json();
        if (data.success && data.results?.[0]) {
          const result = data.results[0];
          if (result.distractors) {
            distractors = result.distractors;
          }
          if (result.exampleSentence) {
            exampleSentence = result.exampleSentence;
          }
          if (result.exampleSentenceJa) {
            exampleSentenceJa = result.exampleSentenceJa;
          }
        }
      } catch {
        // Distractors generation failed — save with empty array
      }

      // Save word
      await repository.createWords([
        {
          projectId: targetProjectId,
          english: english.trim(),
          japanese: japanese.trim(),
          distractors,
          ...(exampleSentence ? { exampleSentence } : {}),
          ...(exampleSentenceJa ? { exampleSentenceJa } : {}),
        },
      ]);

      invalidateHomeCache();

      showToast({
        message: `「${english.trim()}」を追加しました`,
        type: 'success',
      });

      router.push('/');
    } catch (error) {
      console.error('Share target save error:', error);
      showToast({ message: '保存に失敗しました', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      {/* Header */}
      <header className="sticky top-0 bg-[var(--color-background)]/95 z-40 border-b border-[var(--color-border-light)]">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/')}
              className="p-1.5 -ml-1.5 hover:bg-[var(--color-primary-light)] rounded-md transition-colors"
            >
              <Icon name="close" size={20} className="text-[var(--color-muted)]" />
            </button>
            <h1 className="text-lg font-semibold text-[var(--color-foreground)]">
              単語を追加
            </h1>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-lg mx-auto px-4 py-6 pb-32">
        <div className="space-y-5">
          {/* English field */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-foreground)] mb-1.5">
              英単語・フレーズ
            </label>
            <input
              type="text"
              value={english}
              onChange={(e) => setEnglish(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-[var(--color-border)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-light)] outline-none transition-all bg-[var(--color-surface)]"
              placeholder="apple"
              autoFocus
            />
          </div>

          {/* Japanese field */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-foreground)] mb-1.5">
              日本語訳
            </label>
            <input
              type="text"
              value={japanese}
              onChange={(e) => setJapanese(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-[var(--color-border)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-light)] outline-none transition-all bg-[var(--color-surface)]"
              placeholder="りんご"
            />
          </div>

          {/* Project selector */}
          <div>
            <label className="block text-sm font-medium text-[var(--color-foreground)] mb-1.5">
              追加先単語帳
            </label>
            {isLoading ? (
              <div className="px-4 py-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] text-sm">
                読み込み中...
              </div>
            ) : showNewProject ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="flex-1 px-4 py-3 rounded-lg border border-[var(--color-border)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-light)] outline-none transition-all bg-[var(--color-surface)]"
                  placeholder="新しい単語帳名"
                  autoFocus
                />
                <button
                  onClick={() => {
                    setShowNewProject(false);
                    setNewProjectName('');
                  }}
                  className="px-3 py-2 text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                >
                  戻る
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="flex-1 px-4 py-3 rounded-lg border border-[var(--color-border)] focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-light)] outline-none transition-all bg-[var(--color-surface)] text-[var(--color-foreground)]"
                >
                  {projects.length === 0 && (
                    <option value="">単語帳なし（自動作成）</option>
                  )}
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setShowNewProject(true)}
                  className="px-3 py-2 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-primary-light)] transition-colors"
                  title="新規作成"
                >
                  <Icon name="add" size={20} className="text-[var(--color-primary)]" />
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Bottom action */}
      <div className="fixed bottom-0 left-0 right-0 bg-[var(--color-background)]/95 p-4 safe-area-bottom border-t border-[var(--color-border-light)]">
        <div className="max-w-lg mx-auto">
          <Button
            onClick={handleSave}
            disabled={saving || !english.trim() || !japanese.trim() || isLoading}
            className="w-full"
            size="lg"
          >
            {saving ? (
              <>
                <Icon name="progress_activity" size={20} className="animate-spin mr-2" />
                保存中...
              </>
            ) : (
              <>
                <Icon name="add" size={20} className="mr-2" />
                追加する
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function ShareTargetPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[var(--color-background)] flex items-center justify-center">
          <Icon name="progress_activity" size={32} className="animate-spin text-[var(--color-primary)]" />
        </div>
      }
    >
      <ShareTargetContent />
    </Suspense>
  );
}
