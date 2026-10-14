'use client';

/**
 * 目標の設定シート。目標は「どの単語帳を」「いつまでに」の組で、
 * 単語帳の選択で指定する。
 */

import { useMemo, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { SolidButton } from '@/components/redesign/SolidPage';
import { WordbookChoiceRow } from '@/components/quiz/WordbookChoiceRow';
import { parseLocalDateKey, toLocalDateKey, type StudyGoal } from '@/lib/goal/study-goal';

export interface GoalSheetProject {
  id: string;
  title: string;
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
    <div className="fixed inset-0 z-[110]" style={{ fontFamily: 'var(--font-body)' }}>
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
        onClick={onClose}
      />

      {/* クイズの「出題する単語帳を選ぶ」(ReviewProjectFilterSheet) と同じ、中央に浮かぶダイアログ */}
      <div className="absolute inset-0 flex items-center justify-center px-4 py-10" onClick={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label="目標を設定"
          className="w-full animate-fade-in"
          onClick={(event) => event.stopPropagation()}
          style={{
            maxWidth: 480,
            background: 'var(--color-paper)',
            border: '2px solid var(--solid-ink)',
            borderRadius: 20,
            padding: '18px 18px 20px',
            boxShadow: '4px 5px 0 var(--solid-shadow)',
            maxHeight: 'min(80dvh, 640px)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="font-display text-[19px] font-extrabold text-[var(--solid-ink)]">目標を設定</div>
            <button
              type="button"
              onClick={onClose}
              aria-label="閉じる"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
            >
              <Icon name="close" size={16} />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {projects.length === 0 ? (
              <p className="rounded-[12px] border-2 border-dashed border-[var(--color-border)] p-3 text-xs font-bold text-[var(--color-muted)]">
                単語帳がまだありません。先に単語帳を作成してください。
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {projects.map((project) => (
                  <WordbookChoiceRow
                    key={project.id}
                    label={project.title}
                    selected={projectIds.includes(project.id)}
                    onClick={() => toggleProject(project.id)}
                  />
                ))}
              </div>
            )}
          </div>

          <p className="mb-1.5 mt-3.5 text-[11px] font-black tracking-[0.06em] text-[var(--color-muted)]">
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

          <div className="mt-3.5 flex items-center gap-2">
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
              faceClassName="!w-full !justify-center"
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
