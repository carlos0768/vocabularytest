'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon, Modal, useToast } from '@/components/ui';
import { useAuth } from '@/hooks/use-auth';

type ApiPayload = {
  success?: boolean;
  error?: string;
  message?: string;
  code?: string;
};

function getAccountDeleteError(payload: ApiPayload | null): string {
  if (payload?.code === 'active_appstore_subscription') {
    return 'App Storeでサブスクリプションを解約してから、もう一度お試しください。';
  }

  if (payload?.code === 'missing_stripe_subscription_id') {
    return '課金情報を確認できないため自動削除できません。お問い合わせからご連絡ください。';
  }

  return payload?.error || 'アカウント削除に失敗しました';
}

export default function DeleteAccountPage() {
  const router = useRouter();
  const { isPro, subscription, signOut } = useAuth();
  const { showToast } = useToast();
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const isAppStorePro = isPro && subscription?.proSource === 'appstore';

  const closeModal = () => {
    if (deleteLoading) return;
    setShowConfirm(false);
    setDeleteError(null);
  };

  const handleDeleteAccount = async () => {
    if (deleteLoading) return;

    setDeleteLoading(true);
    setDeleteError(null);

    try {
      const response = await fetch('/api/account/delete', { method: 'DELETE' });
      const payload = await response.json().catch(() => null) as ApiPayload | null;

      if (!response.ok || !payload?.success) {
        throw new Error(getAccountDeleteError(payload));
      }

      showToast({
        type: 'success',
        message: 'アカウントを削除しました',
        duration: 5000,
      });
      await signOut();
      router.replace('/');
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : 'アカウント削除に失敗しました'
      );
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-[var(--color-background)] pb-[110px] pt-3 font-[var(--font-body)] lg:hidden">
      <div className="px-[18px] pb-[14px] pt-1">
        <button
          type="button"
          onClick={() => router.push('/settings/account')}
          className="mb-2 inline-flex items-center gap-0.5 font-display text-[12px] font-bold text-[var(--color-muted)]"
        >
          <Icon name="chevron_left" size={16} />
          アカウント
        </button>
        <div className="font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--color-error)]">DANGER ZONE</div>
        <div className="mt-0.5 font-display text-[26px] font-extrabold leading-[1.1] tracking-[-0.02em] text-[var(--solid-ink)]">アカウント削除</div>
      </div>

      <div className="px-[18px] pb-4">
        <div className="overflow-hidden rounded-[12px] border-2 border-[var(--color-error)] bg-white p-4">
          <div className="space-y-2 text-[13px] leading-[1.7] text-[var(--color-muted)]">
            <p>アカウントを削除すると、以下のデータが完全に削除されます：</p>
            <ul className="ml-4 list-disc space-y-1">
              <li>ログイン情報</li>
              <li>クラウド上の学習データ</li>
              <li>プロジェクト・単語帳</li>
            </ul>
            <p>Stripe課金中の場合は、削除時にサブスクリプションも停止します。</p>
            {isAppStorePro && (
              <p className="font-bold text-[var(--color-error)]">
                App Store課金中の場合は、先にApp Storeでサブスクリプションを解約してください。
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            className="mt-4 w-full rounded-[10px] border-2 border-[var(--color-error)] bg-white py-3 font-display text-[13px] font-bold text-[var(--color-error)] transition-all duration-100 active:translate-x-px active:translate-y-px"
          >
            アカウントを削除する
          </button>
        </div>
      </div>

      <Modal isOpen={showConfirm} onClose={closeModal} showCloseButton={false} closeOnBackdrop={!deleteLoading}>
        <div className="p-5">
          <div className="mb-4 flex items-center gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-[rgba(239,68,68,0.1)] text-[var(--color-error)]">
              <Icon name="delete" size={20} />
            </span>
            <div>
              <div className="font-display text-[17px] font-extrabold text-[var(--solid-ink)]">本当に削除しますか？</div>
              <div className="mt-0.5 text-[11px] text-[var(--color-muted)]">この操作は取り消せません</div>
            </div>
          </div>

          {deleteError && (
            <p className="mt-3 rounded-[9px] border border-[var(--color-error)] bg-[rgba(239,68,68,0.08)] px-3 py-2 text-[12px] font-bold text-[var(--color-error)]">
              {deleteError}
            </p>
          )}

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={closeModal}
              disabled={deleteLoading}
              className="flex-1 rounded-[10px] border-2 border-[var(--solid-ink)] bg-white py-3 font-display text-[13px] font-bold text-[var(--solid-ink)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              戻る
            </button>
            <button
              type="button"
              onClick={handleDeleteAccount}
              disabled={deleteLoading}
              className="flex-1 rounded-[10px] border-2 border-[var(--color-error)] bg-[var(--color-error)] py-3 font-display text-[13px] font-bold text-white transition-all duration-100 disabled:cursor-not-allowed disabled:opacity-60 active:translate-x-px active:translate-y-px"
            >
              {deleteLoading ? '削除中...' : '削除する'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
