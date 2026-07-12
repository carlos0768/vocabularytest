'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui';
import { AnnouncementBlocks } from '@/components/announcements/AnnouncementBlocks';
import { ANNOUNCEMENT_AUTHORING_PROMPT } from '@/lib/announcements/authoring-prompt';
import {
  announcementBlocksSchema,
  type Announcement,
  type AnnouncementBlocks as AnnouncementBlocksType,
} from '@/lib/announcements/blocks';
import { useAdminSecret } from '../use-admin-secret';

// お知らせ管理画面。本文はMDSブロックJSONで記述する。
// ChatGPT等に書かせる場合は「AIプロンプトをコピー」→機能説明を足して送信→
// 返ってきたJSONを本文欄に貼るだけでよい(ライブプレビューとZod検証つき)。

type ParseState =
  | { ok: true; blocks: AnnouncementBlocksType }
  | { ok: false; error: string };

function parseBlocksInput(input: string): ParseState {
  if (!input.trim()) return { ok: false, error: '本文JSONを入力してください' };
  let json: unknown;
  try {
    json = JSON.parse(input);
  } catch {
    return { ok: false, error: 'JSONとして解釈できません(カンマや引用符を確認してください)' };
  }
  const parsed = announcementBlocksSchema.safeParse(json);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path?.length ? `[${issue.path.join('.')}] ` : '';
    return { ok: false, error: `スキーマ違反: ${path}${issue?.message ?? 'invalid'}` };
  }
  return { ok: true, blocks: parsed.data };
}

export default function OpsAnnouncementsPage() {
  const [adminSecret, setAdminSecret] = useAdminSecret();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [blocksInput, setBlocksInput] = useState('');

  const parseState = useMemo(() => parseBlocksInput(blocksInput), [blocksInput]);

  const request = async (path: string, init?: RequestInit) => {
    const response = await fetch(path, {
      ...init,
      headers: {
        'x-admin-secret': adminSecret,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result?.success) {
      throw new Error(result?.error ?? `Request failed (${response.status})`);
    }
    return result;
  };

  const loadList = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await request('/api/ops/announcements');
      setAnnouncements(result.announcements as Announcement[]);
    } catch (loadError) {
      setAnnouncements(null);
      setError(loadError instanceof Error ? loadError.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setTitle('');
    setBlocksInput('');
  };

  const startEdit = (announcement: Announcement) => {
    setEditingId(announcement.id);
    setTitle(announcement.title);
    setBlocksInput(JSON.stringify(announcement.bodyBlocks, null, 2));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const save = async (publish: boolean) => {
    if (!parseState.ok || !title.trim()) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      if (editingId) {
        await request(`/api/ops/announcements/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title: title.trim(),
            bodyBlocks: parseState.blocks,
            ...(publish ? { status: 'published' } : {}),
          }),
        });
        setNotice(publish ? '更新して公開しました' : '更新しました');
      } else {
        await request('/api/ops/announcements', {
          method: 'POST',
          body: JSON.stringify({ title: title.trim(), bodyBlocks: parseState.blocks, publish }),
        });
        setNotice(publish ? '作成して公開しました' : '下書きを作成しました');
      }
      resetForm();
      await loadList();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (announcement: Announcement) => {
    setError(null);
    try {
      await request(`/api/ops/announcements/${announcement.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: announcement.status === 'published' ? 'draft' : 'published' }),
      });
      await loadList();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'Failed to update');
    }
  };

  const remove = async (announcement: Announcement) => {
    if (!window.confirm(`「${announcement.title}」を削除しますか?`)) return;
    setError(null);
    try {
      await request(`/api/ops/announcements/${announcement.id}`, { method: 'DELETE' });
      if (editingId === announcement.id) resetForm();
      await loadList();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete');
    }
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(ANNOUNCEMENT_AUTHORING_PROMPT);
      setNotice('AIプロンプトをコピーしました。ChatGPT等に貼り付けて、末尾に機能説明を書いてください');
    } catch {
      setError('コピーに失敗しました');
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-background)] pb-16">
      <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-background)]/95 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-[var(--color-muted)]">Ops</p>
            <h1 className="text-xl font-bold text-[var(--color-foreground)]">お知らせ管理</h1>
          </div>
          <Link href="/ops" className="text-sm font-bold text-[var(--color-muted)]">
            ダッシュボードに戻る
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-6">
        {/* 認証 + 一覧読み込み */}
        <section className="rounded-2xl border-2 border-b-4 border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_auto_auto]">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--color-muted)]">ADMIN_SECRET</span>
              <input
                type="password"
                value={adminSecret}
                onChange={(event) => setAdminSecret(event.target.value)}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[var(--color-foreground)]"
                placeholder="x-admin-secret"
              />
            </label>
            <button
              type="button"
              onClick={() => void loadList()}
              disabled={loading || !adminSecret}
              className="self-end rounded-xl border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {loading ? '読み込み中...' : '一覧を読み込む'}
            </button>
            <button
              type="button"
              onClick={() => void copyPrompt()}
              className="self-end rounded-xl border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-5 py-2 text-sm font-bold text-[var(--solid-ink)]"
            >
              <span className="inline-flex items-center gap-1.5">
                <Icon name="smart_toy" size={16} />
                AIプロンプトをコピー
              </span>
            </button>
          </div>
          {error && <p className="mt-2 text-sm font-bold text-[var(--color-error)]">{error}</p>}
          {notice && <p className="mt-2 text-sm font-bold text-[var(--color-accent)]">{notice}</p>}
        </section>

        {/* 作成/編集フォーム + ライブプレビュー */}
        <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border-2 border-b-4 border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold text-[var(--color-foreground)]">
                {editingId ? 'お知らせを編集' : '新しいお知らせ'}
              </h2>
              {editingId && (
                <button type="button" onClick={resetForm} className="text-xs font-bold text-[var(--color-muted)] underline">
                  新規作成に切り替え
                </button>
              )}
            </div>

            <label className="mb-3 flex flex-col gap-1">
              <span className="text-xs text-[var(--color-muted)]">タイトル(管理用・モーダルのヘッダーにも表示)</span>
              <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[var(--color-foreground)]"
                placeholder="例: 新機能: 語彙力レベル診断"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--color-muted)]">本文(MDSブロックJSON — AIプロンプトの出力をそのまま貼り付け)</span>
              <textarea
                value={blocksInput}
                onChange={(event) => setBlocksInput(event.target.value)}
                rows={14}
                spellCheck={false}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-mono text-xs leading-relaxed text-[var(--color-foreground)]"
                placeholder='[{"type":"h2","text":"新機能: ..."},{"type":"p","text":"..."}]'
              />
            </label>
            {!parseState.ok && blocksInput.trim() && (
              <p className="mt-2 text-xs font-bold text-[var(--color-error)]">{parseState.error}</p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void save(false)}
                disabled={saving || !parseState.ok || !title.trim() || !adminSecret}
                className="rounded-xl border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-4 py-2 text-sm font-bold text-[var(--solid-ink)] disabled:opacity-50"
              >
                下書き保存
              </button>
              <button
                type="button"
                onClick={() => void save(true)}
                disabled={saving || !parseState.ok || !title.trim() || !adminSecret}
                className="rounded-xl border-2 border-[var(--color-accent-ink,var(--color-accent))] bg-[var(--color-accent)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存して公開'}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border-2 border-b-4 border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <h2 className="mb-3 font-bold text-[var(--color-foreground)]">ライブプレビュー</h2>
            <div className="rounded-[16px] border-2 border-[var(--solid-ink)] bg-[var(--color-background)] p-4">
              {title.trim() && (
                <div className="mb-3 font-display text-[18px] font-extrabold text-[var(--solid-ink)]">{title}</div>
              )}
              {parseState.ok ? (
                <AnnouncementBlocks blocks={parseState.blocks} />
              ) : (
                <p className="py-8 text-center text-sm text-[var(--color-muted)]">
                  本文JSONが正しくなるとここにプレビューが表示されます
                </p>
              )}
            </div>
          </div>
        </section>

        {/* 一覧 */}
        {announcements && (
          <section className="rounded-2xl border-2 border-b-4 border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <h2 className="mb-3 font-bold text-[var(--color-foreground)]">お知らせ一覧({announcements.length}件)</h2>
            {announcements.length === 0 ? (
              <p className="text-sm text-[var(--color-muted)]">まだお知らせがありません。上のフォームから作成してください。</p>
            ) : (
              <div className="space-y-2">
                {announcements.map((announcement) => (
                  <div
                    key={announcement.id}
                    className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5"
                  >
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                        announcement.status === 'published'
                          ? 'bg-[var(--color-accent)] text-white'
                          : 'bg-[var(--color-border)] text-[var(--color-muted)]'
                      }`}
                    >
                      {announcement.status === 'published' ? '公開中' : '下書き'}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--color-foreground)]">
                      {announcement.title}
                    </span>
                    <span className="font-mono text-[11px] text-[var(--color-muted)]">
                      {new Date(announcement.publishedAt ?? announcement.createdAt).toLocaleDateString('ja-JP')}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => startEdit(announcement)}
                        className="rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs font-bold text-[var(--color-foreground)]"
                      >
                        編集
                      </button>
                      <button
                        type="button"
                        onClick={() => void toggleStatus(announcement)}
                        className="rounded-lg border border-[var(--color-border)] px-2.5 py-1 text-xs font-bold text-[var(--color-foreground)]"
                      >
                        {announcement.status === 'published' ? '非公開にする' : '公開する'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void remove(announcement)}
                        className="rounded-lg border border-[var(--color-error)] px-2.5 py-1 text-xs font-bold text-[var(--color-error)]"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
