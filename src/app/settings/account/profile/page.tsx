'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, useToast } from '@/components/ui';
import { useProfile } from '@/hooks/use-profile';

export default function ProfileSettingsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const {
    username,
    accountId,
    loading: profileLoading,
    saving: profileSaving,
    error: profileError,
    setUsername,
    setAccountId: saveAccountId,
  } = useProfile();
  const [usernameInput, setUsernameInput] = useState<string | null>(null);
  const [accountIdInput, setAccountIdInput] = useState<string | null>(null);

  const isEditing = usernameInput !== null;
  const displayValue = usernameInput ?? username ?? '';

  const isEditingAccountId = accountIdInput !== null;
  const displayAccountIdValue = accountIdInput ?? accountId ?? '';
  const isAccountIdValid = /^[a-z0-9_]{4,24}$/.test(displayAccountIdValue);

  const startEditing = () => {
    setUsernameInput(username ?? '');
  };

  const cancelEditing = () => {
    setUsernameInput(null);
  };

  const handleSave = async () => {
    if (profileSaving || !displayValue.trim()) return;
    const success = await setUsername(displayValue);
    if (success) {
      setUsernameInput(null);
      showToast({ type: 'success', message: 'ユーザー名を変更しました' });
    }
  };

  const startEditingAccountId = () => {
    setAccountIdInput(accountId ?? '');
  };

  const cancelEditingAccountId = () => {
    setAccountIdInput(null);
  };

  const handleSaveAccountId = async () => {
    if (profileSaving || !isAccountIdValid) return;
    const success = await saveAccountId(displayAccountIdValue);
    if (success) {
      setAccountIdInput(null);
      showToast({ type: 'success', message: 'IDを変更しました' });
    }
  };

  return (
    <div className="relative min-h-screen bg-[var(--color-background)] pb-[110px] pt-3 font-[var(--font-body)] lg:hidden">
      <div className="px-[18px] pb-[14px] pt-1">
        <button
          type="button"
          onClick={() => router.push('/settings/account')}
          aria-label="アカウントへ戻る"
          className="mb-2 flex h-[38px] w-[38px] items-center justify-center rounded-[19px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
        >
          <Icon name="chevron_left" size={20} />
        </button>
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">PROFILE</div>
        <div className="mt-0.5 font-display text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] text-[var(--solid-ink)]">プロフィール変更</div>
      </div>

      <div className="px-[18px] pb-4">
        <div className="overflow-hidden rounded-[12px] border-2 border-[var(--solid-ink)] bg-white">
          {/* ユーザー名 */}
          <div className="px-4 py-3.5">
            <div className="flex items-center justify-between">
              <label htmlFor="profile-username" className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
                USERNAME
              </label>
              {!isEditing && (
                <button
                  type="button"
                  onClick={startEditing}
                  disabled={profileLoading}
                  className="inline-flex items-center gap-0.5 font-display text-[11px] font-bold text-[var(--color-accent)] disabled:opacity-50"
                >
                  <Icon name="edit" size={13} />
                  編集
                </button>
              )}
            </div>

            {isEditing ? (
              <>
                <input
                  id="profile-username"
                  type="text"
                  value={displayValue}
                  onChange={(event) => setUsernameInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void handleSave();
                    }
                    if (event.key === 'Escape') {
                      cancelEditing();
                    }
                  }}
                  maxLength={20}
                  autoFocus
                  placeholder="ユーザー名を入力"
                  className="mt-1.5 w-full rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2.5 font-display text-[15px] font-bold text-[var(--solid-ink)] outline-none transition-shadow placeholder:text-[var(--color-muted)] focus:shadow-[2px_2px_0_var(--color-accent)]"
                />
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <p className="font-mono text-[9px] text-[var(--color-muted)]">1-20文字</p>
                  <p className="font-mono text-[9px] text-[var(--color-muted)]">{displayValue.length}/20</p>
                </div>
                {profileError && (
                  <p className="mt-2 rounded-[8px] border border-[var(--color-error)] bg-[rgba(239,68,68,0.08)] px-2.5 py-2 text-[11px] font-bold text-[var(--color-error)]">
                    {profileError}
                  </p>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={profileSaving || !displayValue.trim()}
                    className="flex-1 rounded-[9px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-3 py-2.5 font-display text-[13px] font-bold text-white shadow-[2px_2px_0_var(--color-accent)] transition-all duration-100 disabled:cursor-not-allowed disabled:opacity-50 active:translate-x-px active:translate-y-px"
                  >
                    {profileSaving ? '保存中...' : '保存'}
                  </button>
                  <button
                    type="button"
                    onClick={cancelEditing}
                    disabled={profileSaving}
                    className="flex-1 rounded-[9px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2.5 font-display text-[13px] font-bold text-[var(--solid-ink)] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    キャンセル
                  </button>
                </div>
              </>
            ) : (
              <p className="mt-1 font-display text-[15px] font-bold text-[var(--solid-ink)]">
                {profileLoading ? '読み込み中...' : (username ?? 'ユーザー名未設定')}
              </p>
            )}
          </div>

          {/* アカウントID */}
          <div className="border-t border-[var(--color-border)] px-4 py-3.5">
            <div className="flex items-center justify-between">
              <label htmlFor="profile-account-id" className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
                ACCOUNT ID
              </label>
              {!isEditingAccountId && (
                <button
                  type="button"
                  onClick={startEditingAccountId}
                  disabled={profileLoading}
                  className="inline-flex items-center gap-0.5 font-display text-[11px] font-bold text-[var(--color-accent)] disabled:opacity-50"
                >
                  <Icon name="edit" size={13} />
                  編集
                </button>
              )}
            </div>

            {isEditingAccountId ? (
              <>
                <div className="relative mt-1.5">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[15px] font-bold text-[var(--color-muted)]">@</span>
                  <input
                    id="profile-account-id"
                    type="text"
                    value={displayAccountIdValue}
                    onChange={(event) => setAccountIdInput(event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        void handleSaveAccountId();
                      }
                      if (event.key === 'Escape') {
                        cancelEditingAccountId();
                      }
                    }}
                    maxLength={24}
                    autoFocus
                    placeholder="account_id"
                    className="w-full rounded-[10px] border-2 border-[var(--solid-ink)] bg-white py-2.5 pl-8 pr-3 font-mono text-[15px] font-bold text-[var(--solid-ink)] outline-none transition-shadow placeholder:text-[var(--color-muted)] focus:shadow-[2px_2px_0_var(--color-accent)]"
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-2">
                  <p className="font-mono text-[9px] text-[var(--color-muted)]">半角英小文字・数字・_ / 4〜24文字</p>
                  <p className="font-mono text-[9px] text-[var(--color-muted)]">{displayAccountIdValue.length}/24</p>
                </div>
                {profileError && (
                  <p className="mt-2 rounded-[8px] border border-[var(--color-error)] bg-[rgba(239,68,68,0.08)] px-2.5 py-2 text-[11px] font-bold text-[var(--color-error)]">
                    {profileError}
                  </p>
                )}
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={handleSaveAccountId}
                    disabled={profileSaving || !isAccountIdValid}
                    className="flex-1 rounded-[9px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-3 py-2.5 font-display text-[13px] font-bold text-white shadow-[2px_2px_0_var(--color-accent)] transition-all duration-100 disabled:cursor-not-allowed disabled:opacity-50 active:translate-x-px active:translate-y-px"
                  >
                    {profileSaving ? '保存中...' : '保存'}
                  </button>
                  <button
                    type="button"
                    onClick={cancelEditingAccountId}
                    disabled={profileSaving}
                    className="flex-1 rounded-[9px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2.5 font-display text-[13px] font-bold text-[var(--solid-ink)] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    キャンセル
                  </button>
                </div>
              </>
            ) : (
              <p className="mt-1 font-mono text-[14px] font-bold text-[var(--solid-ink)]">
                {profileLoading ? '...' : accountId ? `@${accountId}` : '未設定'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
