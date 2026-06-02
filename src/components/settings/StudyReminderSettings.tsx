'use client';

import { useMemo, useState } from 'react';
import { Icon, useToast } from '@/components/ui';
import { SolidPanel, SolidSectionTitle } from '@/components/redesign/SolidPage';
import { useAuth } from '@/hooks/use-auth';
import { useUserPreferences } from '@/hooks/use-user-preferences';
import { ensureWebPushSubscription, type PushSubscriptionSetupResult } from '@/lib/notifications/push-client';
import {
  MAX_STUDY_REMINDER_TIMES,
  getBrowserStudyReminderTimeZone,
  getStudyReminderPeriod,
  isValidStudyReminderTimeValue,
  type StudyReminderTime,
} from '@/lib/notifications/study-reminders';
import { createBrowserClient } from '@/lib/supabase';
import { cn } from '@/lib/utils';

type StudyReminderSettingsProps = {
  variant?: 'mobile' | 'desktop';
};

const ADD_TIME_CANDIDATES = ['12:00', '21:00', '10:00', '19:00', '07:00', '22:00', '14:00'];

function createReminderId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `reminder_${Date.now()}`;
}

function sortReminderTimes(times: StudyReminderTime[]): StudyReminderTime[] {
  return [...times].sort((first, second) => first.time.localeCompare(second.time));
}

function getSetupErrorMessage(result: PushSubscriptionSetupResult): string {
  switch (result) {
    case 'unsupported':
      return 'このブラウザはプッシュ通知に対応していません';
    case 'missing-vapid-key':
      return '通知用の公開鍵が設定されていません';
    case 'invalid-vapid-key':
      return '通知用の公開鍵の形式が正しくありません';
    case 'permission-default':
      return '通知の許可が完了していません';
    case 'permission-denied':
      return 'ブラウザ設定で通知がブロックされています';
    case 'service-worker-unavailable':
      return '通知の準備が完了していません。ページを再読み込みしてください';
    case 'push-service-error':
      return 'ブラウザのプッシュサービス登録に失敗しました。公開鍵と通知設定を確認してください';
    case 'subscription-save-failed':
      return '通知の登録情報を保存できませんでした';
    case 'error':
      return '通知の設定に失敗しました';
    case 'enabled':
      return '';
  }
}

export function StudyReminderSettings({ variant = 'mobile' }: StudyReminderSettingsProps) {
  const { isAuthenticated } = useAuth();
  const { showToast } = useToast();
  const {
    studyReminderEnabled,
    studyReminderTimes,
    loading,
    saving,
    error,
    setStudyReminders,
  } = useUserPreferences();
  const [setupLoading, setSetupLoading] = useState(false);

  const sortedTimes = useMemo(() => sortReminderTimes(studyReminderTimes), [studyReminderTimes]);
  const activeCount = studyReminderTimes.filter((time) => time.enabled).length;
  const busy = loading || saving || setupLoading;

  const detail = !isAuthenticated
    ? 'ログインすると通知設定を保存できます'
    : studyReminderEnabled
    ? activeCount > 0
      ? `1日 ${activeCount} 回、設定した時刻に通知します`
      : '有効な通知時間がありません'
    : '通知はオフです';

  const saveReminders = async (preferences: {
    enabled?: boolean;
    times?: StudyReminderTime[];
  }): Promise<boolean> => {
    const success = await setStudyReminders({
      ...preferences,
      timeZone: getBrowserStudyReminderTimeZone(),
    });
    if (!success) {
      showToast({ type: 'error', message: '通知設定の保存に失敗しました' });
    }
    return success;
  };

  const ensurePushEnabled = async (): Promise<boolean> => {
    if (!isAuthenticated) {
      showToast({ type: 'warning', message: '通知を使うにはログインしてください' });
      return false;
    }

    setSetupLoading(true);
    try {
      const supabase = createBrowserClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        showToast({ type: 'warning', message: 'ログイン状態を確認できませんでした' });
        return false;
      }

      const result = await ensureWebPushSubscription({
        accessToken: session.access_token,
        requestPermission: true,
      });

      if (result !== 'enabled') {
        showToast({ type: 'warning', message: getSetupErrorMessage(result) });
        return false;
      }

      return true;
    } finally {
      setSetupLoading(false);
    }
  };

  const toggleMaster = async () => {
    if (busy) return;

    if (!studyReminderEnabled) {
      const pushEnabled = await ensurePushEnabled();
      if (!pushEnabled) return;
      await saveReminders({ enabled: true });
      return;
    }

    await saveReminders({ enabled: false });
  };

  const updateTime = async (id: string, time: string) => {
    if (!isValidStudyReminderTimeValue(time)) return;
    if (studyReminderTimes.some((item) => item.id !== id && item.time === time)) {
      showToast({ type: 'warning', message: '同じ通知時刻は追加できません' });
      return;
    }
    await saveReminders({
      times: studyReminderTimes.map((item) => item.id === id ? { ...item, time } : item),
    });
  };

  const toggleTime = async (id: string) => {
    await saveReminders({
      times: studyReminderTimes.map((item) => (
        item.id === id ? { ...item, enabled: !item.enabled } : item
      )),
    });
  };

  const removeTime = async (id: string) => {
    if (studyReminderTimes.length <= 1) return;
    await saveReminders({
      times: studyReminderTimes.filter((item) => item.id !== id),
    });
  };

  const addTime = async () => {
    if (studyReminderTimes.length >= MAX_STUDY_REMINDER_TIMES) return;
    const usedTimes = new Set(studyReminderTimes.map((item) => item.time));
    const nextTime = ADD_TIME_CANDIDATES.find((time) => !usedTimes.has(time)) ?? '12:00';
    await saveReminders({
      times: [
        ...studyReminderTimes,
        { id: createReminderId(), time: nextTime, enabled: true },
      ],
    });
  };

  if (variant === 'desktop') {
    return (
      <div className="ds-set-group">
        <div className="gh">通知</div>
        <div className="ds-set-row">
          <div className="ic">
            <Icon
              name="notifications"
              style={studyReminderEnabled ? { color: 'var(--color-accent)' } : undefined}
            />
          </div>
          <div className="lab">
            <div className="t">学習リマインダー</div>
            <div className="d">{detail}</div>
          </div>
          <ToggleSwitch
            on={studyReminderEnabled}
            disabled={busy}
            onClick={() => void toggleMaster()}
            label="学習リマインダー"
          />
        </div>

        <div className={cn('ds-notif-list', !studyReminderEnabled && 'off')}>
          {sortedTimes.map((item) => (
            <DesktopReminderRow
              key={item.id}
              item={item}
              disabled={busy || !studyReminderEnabled}
              canRemove={studyReminderTimes.length > 1}
              onTimeChange={updateTime}
              onToggle={toggleTime}
              onRemove={removeTime}
            />
          ))}
          <button
            type="button"
            className="ds-notif-add"
            onClick={() => void addTime()}
            disabled={busy || !studyReminderEnabled || studyReminderTimes.length >= MAX_STUDY_REMINDER_TIMES}
          >
            <Icon name="add" size={18} />
            {studyReminderTimes.length >= MAX_STUDY_REMINDER_TIMES
              ? '通知は最大6件までです'
              : '通知時間を追加'}
          </button>
        </div>
        {error && <div className="ds-notif-error">{error}</div>}
      </div>
    );
  }

  return (
    <section>
      <SolidSectionTitle icon="notifications" title="通知" />
      <SolidPanel className="overflow-hidden" faceClassName="!p-0">
        <div className="flex items-center gap-3 border-b border-[var(--color-border-light)] px-5 py-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] border-[1.5px] border-[var(--solid-ink)] bg-[var(--color-surface-secondary)]">
            <Icon
              name="notifications"
              size={19}
              className={studyReminderEnabled ? 'text-[var(--color-accent)]' : 'text-[var(--solid-ink)]'}
            />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[var(--solid-ink)]">学習リマインダー</p>
            <p className="mt-0.5 text-xs leading-5 text-[var(--color-muted)]">{detail}</p>
          </div>
          <ToggleSwitch
            on={studyReminderEnabled}
            disabled={busy}
            onClick={() => void toggleMaster()}
            label="学習リマインダー"
          />
        </div>

        <div className={cn(!studyReminderEnabled && 'pointer-events-none opacity-45')}>
          {sortedTimes.map((item) => (
            <MobileReminderRow
              key={item.id}
              item={item}
              disabled={busy || !studyReminderEnabled}
              canRemove={studyReminderTimes.length > 1}
              onTimeChange={updateTime}
              onToggle={toggleTime}
              onRemove={removeTime}
            />
          ))}
          <button
            type="button"
            onClick={() => void addTime()}
            disabled={busy || !studyReminderEnabled || studyReminderTimes.length >= MAX_STUDY_REMINDER_TIMES}
            className="flex w-full items-center justify-center gap-2 border-t border-dashed border-[var(--color-border)] px-5 py-3.5 font-display text-[13px] font-bold text-[var(--color-accent)] disabled:cursor-not-allowed disabled:text-[var(--color-muted)]"
          >
            <Icon name="add" size={18} />
            {studyReminderTimes.length >= MAX_STUDY_REMINDER_TIMES
              ? '通知は最大6件までです'
              : '通知時間を追加'}
          </button>
        </div>
        {error && (
          <p className="border-t border-[var(--color-border-light)] px-5 py-3 text-xs font-bold text-[var(--color-error)]">
            {error}
          </p>
        )}
      </SolidPanel>
    </section>
  );
}

function ToggleSwitch({
  on,
  disabled,
  onClick,
  label,
}: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'ds-toggle',
        on && 'on',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    />
  );
}

function DesktopReminderRow({
  item,
  disabled,
  canRemove,
  onTimeChange,
  onToggle,
  onRemove,
}: {
  item: StudyReminderTime;
  disabled: boolean;
  canRemove: boolean;
  onTimeChange: (id: string, time: string) => Promise<void>;
  onToggle: (id: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const period = getStudyReminderPeriod(item.time);

  return (
    <div className="ds-notif-row">
      <div className="pic" style={{ background: period.tint }}>
        <Icon name={period.icon} style={{ color: period.color }} />
      </div>
      <input
        className="ds-time-input"
        type="time"
        value={item.time}
        disabled={disabled}
        onChange={(event) => void onTimeChange(item.id, event.target.value || item.time)}
      />
      <span className="ds-notif-period">
        <Icon name="schedule" />
        {period.label}の通知
      </span>
      <div style={{ flex: 1 }} />
      <ToggleSwitch
        on={item.enabled}
        disabled={disabled}
        onClick={() => void onToggle(item.id)}
        label={`${period.label}の通知`}
      />
      <button
        type="button"
        className="ds-del-btn"
        title="削除"
        aria-label={`${period.label}の通知を削除`}
        onClick={() => void onRemove(item.id)}
        disabled={disabled || !canRemove}
      >
        <Icon name="delete" size={18} />
      </button>
    </div>
  );
}

function MobileReminderRow({
  item,
  disabled,
  canRemove,
  onTimeChange,
  onToggle,
  onRemove,
}: {
  item: StudyReminderTime;
  disabled: boolean;
  canRemove: boolean;
  onTimeChange: (id: string, time: string) => Promise<void>;
  onToggle: (id: string) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const period = getStudyReminderPeriod(item.time);

  return (
    <div className="flex min-h-[66px] items-center gap-3 border-b border-[var(--color-border-light)] px-5 py-3 last:border-b-0">
      <span
        className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px]"
        style={{ background: period.tint }}
      >
        <Icon name={period.icon} size={20} style={{ color: period.color }} />
      </span>
      <input
        type="time"
        value={item.time}
        disabled={disabled}
        onChange={(event) => void onTimeChange(item.id, event.target.value || item.time)}
        className="w-[112px] rounded-[12px] border-[1.5px] border-[var(--solid-ink)] bg-white px-3 py-2 font-display text-[18px] font-extrabold leading-none text-[var(--solid-ink)] outline-none focus:shadow-[0_0_0_3px_var(--color-accent-light)] disabled:opacity-70"
      />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1 text-xs font-bold text-[var(--color-secondary-text)]">
          <Icon name="schedule" size={15} />
          {period.label}の通知
        </p>
      </div>
      <ToggleSwitch
        on={item.enabled}
        disabled={disabled}
        onClick={() => void onToggle(item.id)}
        label={`${period.label}の通知`}
      />
      <button
        type="button"
        aria-label={`${period.label}の通知を削除`}
        disabled={disabled || !canRemove}
        onClick={() => void onRemove(item.id)}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] border-[1.5px] border-[var(--color-border)] bg-white text-[var(--color-muted)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Icon name="delete" size={18} />
      </button>
    </div>
  );
}
