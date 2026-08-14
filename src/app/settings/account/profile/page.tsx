'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, useToast } from '@/components/ui';
import { DesktopButton, DesktopTopbar } from '@/components/desktop/DesktopChrome';
import { ProfileAvatar } from '@/components/profile/ProfileAvatar';
import { profileAvatarColor } from '@/components/profile/ProfileView';
import { useProfile } from '@/hooks/use-profile';
import { processAccountIconFile } from '@/lib/image-utils';
import { StickyPageHeader } from '@/components/ui/StickyPageHeader';

type IconAction = 'idle' | 'saving' | 'removing';

export default function ProfileSettingsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const {
    username,
    accountId,
    avatarUrl,
    loading: profileLoading,
    saving: profileSaving,
    error: profileError,
    setUsername,
    setAccountId: saveAccountId,
    setAvatarUrl,
  } = useProfile();
  const [usernameInput, setUsernameInput] = useState<string | null>(null);
  const [accountIdInput, setAccountIdInput] = useState<string | null>(null);
  const [iconAction, setIconAction] = useState<IconAction>('idle');
  const [iconError, setIconError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const iconBusy = iconAction !== 'idle';
  const avatarInitial = (username || accountId || '?').charAt(0).toUpperCase();
  const avatarColor = profileAvatarColor(accountId ?? 'guest');

  const openIconPicker = () => {
    if (iconBusy || profileLoading) return;
    setIconError(null);
    fileInputRef.current?.click();
  };

  const handleIconFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // 同じファイルを選び直しても change が発火するよう、値は必ず空に戻す。
    event.target.value = '';
    if (!file) return;

    setIconAction('saving');
    setIconError(null);
    try {
      // 正方形にクロップ・圧縮してから data URL として保存する。
      const dataUrl = await processAccountIconFile(file);
      const success = await setAvatarUrl(dataUrl);
      if (success) {
        showToast({ type: 'success', message: 'アイコンを変更しました' });
      } else {
        setIconError('アイコンの保存に失敗しました');
      }
    } catch (error) {
      setIconError(error instanceof Error ? error.message : 'アイコン画像を読み込めませんでした');
    } finally {
      setIconAction('idle');
    }
  };

  const handleIconRemove = async () => {
    if (iconBusy || !avatarUrl) return;
    setIconAction('removing');
    setIconError(null);
    const success = await setAvatarUrl(null);
    if (success) {
      showToast({ type: 'success', message: 'アイコンを削除しました' });
    } else {
      setIconError('アイコンの削除に失敗しました');
    }
    setIconAction('idle');
  };

  const isEditing = usernameInput !== null;
  const displayValue = usernameInput ?? username ?? '';

  const isEditingAccountId = accountIdInput !== null;
  const displayAccountIdValue = accountIdInput ?? accountId ?? '';
  const isAccountIdValid = /^[a-z0-9_]{4,24}$/.test(displayAccountIdValue);

  // プロフィール変更はアカウント設定以外(プロフィール画面の設定ボタンなど)からも
  // 開かれるので、履歴があれば実際の遷移元へ戻す。直接開かれた場合のみ既定へ。
  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push('/settings/account');
  };

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
    <>
    {/* アイコン選択用。モバイル・デスクトップ双方の「画像を選ぶ」から使う */}
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={(event) => void handleIconFileChange(event)}
    />

    {/* デスクトップ表示（プロフィール / 設定の「プロフィールを編集」から遷移） */}
    <div className="hidden h-full min-h-0 flex-col lg:flex">
      <DesktopTopbar title="プロフィール変更" crumb="アカウント / プロフィール">
        <DesktopButton icon="arrow_back" onClick={handleBack}>戻る</DesktopButton>
      </DesktopTopbar>
      <div className="ds-scroll">
        <div style={{ width: 'min(100%, 640px)', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="ds-set-group">
            <div className="gh">アイコン</div>
            <div className="ds-set-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <ProfileAvatar
                  avatarUrl={avatarUrl}
                  initial={avatarInitial}
                  color={avatarColor}
                  size={72}
                  radius={20}
                  fontSize={30}
                />
                <div className="lab" style={{ flex: 1, minWidth: 0 }}>
                  <div className="t">{avatarUrl ? '設定済み' : '未設定'}</div>
                  <div className="d">プロフィールや共有ページで表示されます</div>
                </div>
                <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
                  <DesktopButton
                    icon="photo_camera"
                    onClick={openIconPicker}
                    disabled={iconBusy || profileLoading}
                  >
                    {iconAction === 'saving' ? '保存中...' : avatarUrl ? '変更' : '画像を選ぶ'}
                  </DesktopButton>
                  {avatarUrl && (
                    <DesktopButton icon="delete" onClick={() => void handleIconRemove()} disabled={iconBusy}>
                      {iconAction === 'removing' ? '削除中...' : '削除'}
                    </DesktopButton>
                  )}
                </div>
              </div>
              {iconError && (
                <p style={{ margin: 0, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-error)', background: 'rgba(239,68,68,0.08)', fontSize: 12.5, fontWeight: 700, color: 'var(--color-error)' }}>
                  {iconError}
                </p>
              )}
            </div>
          </div>

          <div className="ds-set-group">
            <div className="gh">ユーザー名</div>
            <div className="ds-set-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
              {isEditing ? (
                <>
                  <label htmlFor="desktop-profile-username" className="mono muted" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em' }}>
                    USERNAME
                  </label>
                  <input
                    id="desktop-profile-username"
                    className="ds-input"
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
                  />
                  <div className="mono muted" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span>1〜20文字</span>
                    <span>{displayValue.length}/20</span>
                  </div>
                  {profileError && (
                    <p style={{ margin: 0, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-error)', background: 'rgba(239,68,68,0.08)', fontSize: 12.5, fontWeight: 700, color: 'var(--color-error)' }}>
                      {profileError}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <DesktopButton variant="dark" onClick={() => void handleSave()} disabled={profileSaving || !displayValue.trim()}>
                      {profileSaving ? '保存中...' : '保存'}
                    </DesktopButton>
                    <DesktopButton onClick={cancelEditing} disabled={profileSaving}>キャンセル</DesktopButton>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div className="lab" style={{ flex: 1, minWidth: 0 }}>
                    <div className="t">{profileLoading ? '読み込み中...' : (username ?? 'ユーザー名未設定')}</div>
                    <div className="d">アプリ内で表示される名前です</div>
                  </div>
                  <DesktopButton icon="edit" onClick={startEditing} disabled={profileLoading}>編集</DesktopButton>
                </div>
              )}
            </div>
          </div>

          <div className="ds-set-group">
            <div className="gh">アカウントID</div>
            <div className="ds-set-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10 }}>
              {isEditingAccountId ? (
                <>
                  <label htmlFor="desktop-profile-account-id" className="mono muted" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em' }}>
                    ACCOUNT ID
                  </label>
                  <div style={{ position: 'relative' }}>
                    <span className="mono muted" style={{ position: 'absolute', left: 15, top: '50%', transform: 'translateY(-50%)', fontSize: 14.5, fontWeight: 700, pointerEvents: 'none' }}>@</span>
                    <input
                      id="desktop-profile-account-id"
                      className="ds-input mono"
                      style={{ paddingLeft: 32 }}
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
                    />
                  </div>
                  <div className="mono muted" style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 11 }}>
                    <span>半角英小文字・数字・_ / 4〜24文字</span>
                    <span>{displayAccountIdValue.length}/24</span>
                  </div>
                  {profileError && (
                    <p style={{ margin: 0, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-error)', background: 'rgba(239,68,68,0.08)', fontSize: 12.5, fontWeight: 700, color: 'var(--color-error)' }}>
                      {profileError}
                    </p>
                  )}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <DesktopButton variant="dark" onClick={() => void handleSaveAccountId()} disabled={profileSaving || !isAccountIdValid}>
                      {profileSaving ? '保存中...' : '保存'}
                    </DesktopButton>
                    <DesktopButton onClick={cancelEditingAccountId} disabled={profileSaving}>キャンセル</DesktopButton>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div className="lab" style={{ flex: 1, minWidth: 0 }}>
                    <div className="t mono">{profileLoading ? '...' : accountId ? `@${accountId}` : '未設定'}</div>
                    <div className="d">共有・フォローで使われる固有のIDです</div>
                  </div>
                  <DesktopButton icon="edit" onClick={startEditingAccountId} disabled={profileLoading}>編集</DesktopButton>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>

    <div className="relative min-h-screen bg-[var(--color-background)] pb-[110px] font-[var(--font-body)] lg:hidden">
      <StickyPageHeader eyebrow="PROFILE" title="プロフィール変更" onBack={handleBack} className="mb-3" />

      <div className="px-[18px] pb-4">
        <div className="overflow-hidden rounded-[12px] border-2 border-[var(--solid-ink)] bg-white">
          {/* アイコン */}
          <div className="px-4 py-3.5">
            <div className="font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
              ICON
            </div>
            <div className="mt-2 flex items-center gap-3.5">
              <button
                type="button"
                onClick={openIconPicker}
                disabled={iconBusy || profileLoading}
                aria-label="アイコン画像を選ぶ"
                className="relative shrink-0 rounded-[18px] transition-all duration-100 disabled:opacity-60 active:translate-x-px active:translate-y-px"
              >
                <ProfileAvatar
                  avatarUrl={avatarUrl}
                  initial={avatarInitial}
                  color={avatarColor}
                  size={68}
                  radius={18}
                  fontSize={28}
                />
                <span className="absolute -bottom-1 -right-1 inline-flex h-[26px] w-[26px] items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)]">
                  <Icon name={iconAction === 'saving' ? 'progress_activity' : 'photo_camera'} size={14} className={iconAction === 'saving' ? 'animate-spin' : undefined} />
                </span>
              </button>
              <div className="min-w-0 flex-1">
                <p className="font-display text-[14px] font-bold text-[var(--solid-ink)]">
                  {avatarUrl ? 'アイコン設定済み' : 'アイコン未設定'}
                </p>
                <p className="mt-0.5 text-[10.5px] leading-4 text-[var(--color-muted)]">
                  プロフィールやフォロー一覧で表示されます
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={openIconPicker}
                    disabled={iconBusy || profileLoading}
                    className="inline-flex items-center gap-1 rounded-[8px] border-2 border-[var(--solid-ink)] bg-white px-2.5 py-1.5 font-display text-[11px] font-bold text-[var(--solid-ink)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Icon name="photo_camera" size={13} />
                    {iconAction === 'saving' ? '保存中...' : avatarUrl ? '変更' : '画像を選ぶ'}
                  </button>
                  {avatarUrl && (
                    <button
                      type="button"
                      onClick={() => void handleIconRemove()}
                      disabled={iconBusy}
                      className="inline-flex items-center gap-1 rounded-[8px] border-2 border-[var(--color-error)] bg-white px-2.5 py-1.5 font-display text-[11px] font-bold text-[var(--color-error)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Icon name="delete" size={13} />
                      {iconAction === 'removing' ? '削除中...' : '削除'}
                    </button>
                  )}
                </div>
              </div>
            </div>
            {iconError && (
              <p className="mt-2 rounded-[8px] border border-[var(--color-error)] bg-[rgba(239,68,68,0.08)] px-2.5 py-2 text-[11px] font-bold text-[var(--color-error)]">
                {iconError}
              </p>
            )}
          </div>

          {/* ユーザー名 */}
          <div className="border-t border-[var(--color-border)] px-4 py-3.5">
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
    </>
  );
}
