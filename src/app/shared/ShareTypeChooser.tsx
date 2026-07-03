'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui';
import { useToast } from '@/components/ui/toast';

type GroupCreateResponse = {
  success?: boolean;
  group?: { id: string; name: string };
  error?: string;
};

/**
 * Centered chooser shown when tapping the "+" on the shared page.
 * Lets the user pick between sharing a wordbook (navigates to a dedicated
 * selection page) or creating a study group (inline name entry).
 */
export function ShareTypeChooser({
  open,
  isLoggedIn,
  onClose,
  onLogin,
}: {
  open: boolean;
  isLoggedIn: boolean;
  onClose: () => void;
  onLogin: () => void;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [mode, setMode] = useState<'choose' | 'group'>('choose');
  const [groupName, setGroupName] = useState('');
  const [visibility, setVisibility] = useState<'private' | 'public'>('private');
  const [creating, setCreating] = useState(false);

  if (!open) return null;

  const handleClose = () => {
    setMode('choose');
    setGroupName('');
    setVisibility('private');
    onClose();
  };

  const handleShareWordbook = () => {
    if (!isLoggedIn) {
      onLogin();
      return;
    }
    handleClose();
    router.push('/shared/share-wordbook');
  };

  const handleStartGroup = () => {
    if (!isLoggedIn) {
      onLogin();
      return;
    }
    setMode('group');
  };

  const handleCreateGroup = async () => {
    const name = groupName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const response = await fetch('/api/shared-projects/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, visibility }),
      });
      const payload = await response.json().catch(() => null) as GroupCreateResponse | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || 'group_create_failed');
      }
      showToast({ message: 'グループを作成しました', type: 'success' });
      handleClose();
    } catch (error) {
      const message = error instanceof Error && error.message !== 'group_create_failed'
        ? error.message
        : 'グループの作成に失敗しました。';
      showToast({ message, type: 'error' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center px-6" style={{ fontFamily: 'var(--font-body)' }}>
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="閉じる"
        onClick={handleClose}
        style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
      />

      <div
        className="relative w-full animate-fade-in-up"
        style={{
          maxWidth: 380,
          background: '#faf7f1',
          border: '2px solid var(--solid-ink)',
          borderRadius: 20,
          padding: '20px 20px max(22px, env(safe-area-inset-bottom))',
          boxShadow: '0 12px 32px rgba(26,26,26,0.22)',
        }}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
              {mode === 'group' ? 'CREATE GROUP' : 'SHARE'}
            </div>
            <div className="mt-0.5 truncate font-display text-[19px] font-extrabold text-[var(--solid-ink)]">
              {mode === 'group' ? 'グループを作る' : '共有する'}
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="閉じる"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)]"
          >
            <Icon name="close" size={14} />
          </button>
        </div>

        {mode === 'choose' ? (
          <div className="flex flex-col gap-3">
            <ChooserButton
              icon="menu_book"
              title="単語帳を共有"
              description="自分の単語帳を選んでみんなに公開"
              onClick={handleShareWordbook}
            />
            <ChooserButton
              icon="groups"
              title="グループを作る"
              description="仲間と単語帳を共有するグループ"
              onClick={handleStartGroup}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <input
              value={groupName}
              onChange={(event) => setGroupName(event.target.value)}
              maxLength={40}
              placeholder="グループ名"
              autoFocus
              className="w-full rounded-[12px] border-2 border-[var(--solid-ink)] bg-white px-3 py-3 text-[14px] font-bold text-[var(--solid-ink)] outline-none"
            />
            <div className="flex overflow-hidden rounded-[12px] border-2 border-[var(--solid-ink)]">
              <button
                type="button"
                onClick={() => setVisibility('private')}
                className="flex flex-1 items-center justify-center gap-1.5 px-3 py-2.5 text-[13px] font-bold transition-colors"
                style={{
                  background: visibility === 'private' ? 'var(--solid-ink)' : '#fff',
                  color: visibility === 'private' ? '#fff' : 'var(--solid-ink)',
                }}
              >
                <Icon name="lock" size={14} />
                非公開
              </button>
              <button
                type="button"
                onClick={() => setVisibility('public')}
                className="flex flex-1 items-center justify-center gap-1.5 border-l-2 border-[var(--solid-ink)] px-3 py-2.5 text-[13px] font-bold transition-colors"
                style={{
                  background: visibility === 'public' ? 'var(--solid-ink)' : '#fff',
                  color: visibility === 'public' ? '#fff' : 'var(--solid-ink)',
                }}
              >
                <Icon name="public" size={14} />
                公開
              </button>
            </div>
            <p className="text-[11px] leading-4 text-[var(--color-muted)]">
              {visibility === 'public'
                ? '公開グループは共有ページの一覧から誰でも見つけられます'
                : '非公開グループは招待コードを知っている人のみ参加できます'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMode('choose')}
                className="inline-flex h-[46px] items-center justify-center gap-1 rounded-[12px] border-2 border-[var(--solid-ink)] bg-white px-4 text-[13px] font-extrabold text-[var(--solid-ink)]"
              >
                <Icon name="arrow_back" size={15} />
                戻る
              </button>
              <button
                type="button"
                onClick={() => void handleCreateGroup()}
                disabled={!groupName.trim() || creating}
                className="inline-flex h-[46px] flex-1 items-center justify-center gap-2 rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-4 text-[14px] font-extrabold text-white disabled:opacity-45"
              >
                <Icon name={creating ? 'progress_activity' : 'check'} size={16} className={creating ? 'animate-spin' : undefined} />
                {creating ? '作成中...' : '作成する'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ChooserButton({
  icon,
  title,
  description,
  onClick,
}: {
  icon: string;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 rounded-[14px] border-2 border-[var(--solid-ink)] bg-white px-4 py-3.5 text-left transition-all duration-100 active:translate-x-px active:translate-y-px"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface-secondary)] text-[var(--solid-ink)]">
        <Icon name={icon} size={22} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[15px] font-extrabold text-[var(--solid-ink)]">{title}</span>
        <span className="mt-0.5 block text-[11px] font-semibold text-[var(--color-muted)]">{description}</span>
      </span>
      <Icon name="chevron_right" size={20} className="shrink-0 text-[var(--color-muted)]" />
    </button>
  );
}
