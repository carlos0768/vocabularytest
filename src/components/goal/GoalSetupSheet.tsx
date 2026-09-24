'use client';

/**
 * 目標の設定シート。目標は「どの単語帳を」「いつまでに」の組で、
 * 単語帳の選択で指定する。
 */

import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { SolidButton } from '@/components/redesign/SolidPage';
import { parseLocalDateKey, toLocalDateKey, type StudyGoal } from '@/lib/goal/study-goal';

export interface GoalSheetProject {
  id: string;
  title: string;
  totalWords: number;
}

const DEFAULT_GOAL_SPAN_DAYS = 30;

function defaultTargetDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + DEFAULT_GOAL_SPAN_DAYS);
  return toLocalDateKey(date);
}

interface GoalSetupSheetProps {
  isOpen: boolean;
  onClose: () => void;
  projects: GoalSheetProject[];
  current: StudyGoal | null;
  /**
   * 目標日の初期値 (カレンダーの日付をタップして開いたとき)。
   * 指定があれば現在の目標日より優先する。
   */
  initialTargetDate?: string | null;
  onSave: (goal: StudyGoal) => void;
  onClear: () => void;
}

/**
 * 閉じている間はフォームをマウントしない。開くたびにフォームが作り直されるので、
 * 入力状態は常に「今の目標」から初期化され、前回の編集途中を引きずらない。
 */
export function GoalSetupSheet(props: GoalSetupSheetProps) {
  if (!props.isOpen) return null;
  return <GoalSetupForm {...props} />;
}

function GoalSetupForm({
  onClose,
  projects,
  current,
  initialTargetDate,
  onSave,
  onClear,
}: GoalSetupSheetProps) {
  const [projectIds, setProjectIds] = useState<string[]>(
    current?.projectIds ?? (projects[0] ? [projects[0].id] : []),
  );
  const [targetDate, setTargetDate] = useState<string>(
    initialTargetDate ?? current?.targetDate ?? defaultTargetDate(),
  );

  const today = useMemo(() => toLocalDateKey(new Date()), []);
  const dateValid = parseLocalDateKey(targetDate) !== null;
  const canSave = projectIds.length > 0 && dateValid;

  const toggleProject = (id: string) => {
    setProjectIds((prev) =>
      prev.includes(id) ? prev.filter((existing) => existing !== id) : [...prev, id],
    );
  };

  return (
    <div className="fixed inset-0 z-[100]" style={{ fontFamily: 'var(--font-body)' }}>
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
        onClick={onClose}
      />
      <div className="absolute bottom-0 left-0 right-0 flex justify-center">
        <div
          className="w-full animate-fade-in-up"
          style={{
            maxWidth: 480,
            maxHeight: '88vh',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--color-paper)',
            border: '2px solid var(--solid-ink)',
            borderBottomWidth: 0,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: '14px 18px max(28px, env(safe-area-inset-bottom))',
            boxShadow: '0 -8px 24px color-mix(in srgb, var(--solid-ink) 18%, transparent)',
          }}
        >
          <div className="mb-2.5 flex justify-center">
            <div className="h-1 w-10 rounded-full bg-[color-mix(in_srgb,_var(--solid-ink)_20%,_transparent)]" />
          </div>

          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-[18px] font-black text-[var(--solid-ink)]">目標を設定</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="閉じる"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)]"
            >
              <Icon name="close" size={14} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <p className="mb-1.5 text-[11px] font-black tracking-[0.06em] text-[var(--color-muted)]">
              目標にする単語帳 (複数選択可)
            </p>
            {projects.length === 0 ? (
              <p className="rounded-[12px] border-2 border-dashed border-[var(--color-border)] p-3 text-xs font-bold text-[var(--color-muted)]">
                単語帳がまだありません。先に単語帳を作成してください。
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {projects.map((project) => {
                  const selected = projectIds.includes(project.id);
                  return (
                    <button
                      key={project.id}
                      type="button"
                      role="checkbox"
                      aria-checked={selected}
                      onClick={() => toggleProject(project.id)}
                      className={`flex items-center gap-2.5 rounded-[12px] border-2 px-3 py-2.5 text-left transition-colors ${
                        selected
                          ? 'border-[var(--color-accent)] bg-[var(--color-accent-subtle)]'
                          : 'border-[var(--solid-ink)] bg-[var(--color-surface)]'
                      }`}
                    >
                      <Icon
                        name={selected ? 'check_box' : 'check_box_outline_blank'}
                        size={18}
                        className={selected ? 'text-[var(--color-accent)]' : 'text-[var(--color-muted)]'}
                      />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[var(--solid-ink)]">
                        {project.title}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] font-bold text-[var(--color-muted)]">
                        {project.totalWords}語
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <p className="mb-1.5 mt-4 text-[11px] font-black tracking-[0.06em] text-[var(--color-muted)]">
              目標日
            </p>
            <input
              type="date"
              value={targetDate}
              min={today}
              onChange={(event) => setTargetDate(event.target.value)}
              aria-label="目標日"
              className="w-full rounded-[12px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-2.5 text-[14px] font-bold text-[var(--solid-ink)]"
            />
          </div>

          <div className="mt-4 flex items-center gap-2">
            {current && (
              <SolidButton type="button" variant="default" onClick={onClear} className="shrink-0">
                目標を消す
              </SolidButton>
            )}
            <SolidButton
              type="button"
              variant="accent"
              disabled={!canSave}
              onClick={() => canSave && onSave({ projectIds, targetDate })}
              className="flex-1"
              iconLeft="flag"
            >
              保存
            </SolidButton>
          </div>
        </div>
      </div>
    </div>
  );
}
