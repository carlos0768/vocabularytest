'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { SolidButton } from '@/components/redesign/SolidPage';
import { WordbookChoiceRow } from './WordbookChoiceRow';

export type ReviewFilterProject = {
  id: string;
  title: string;
};

interface ReviewProjectFilterSheetProps {
  isOpen: boolean;
  onClose: () => void;
  projects: ReviewFilterProject[];
  selectedIds: string[] | null;
  onApply: (ids: string[] | null) => void;
}

/**
 * Centred floating dialog (like the word-detail modal) for choosing which
 * wordbooks (projects) contribute due words to a review/learn quiz session.
 * `selectedIds === null` means "all wordbooks" — the default when nothing has
 * been narrowed down. It used to be a bottom sheet; on an iPad that stretched
 * along the bottom edge, so it now floats in the middle on every layout.
 */
export function ReviewProjectFilterSheet({
  isOpen,
  onClose,
  projects,
  selectedIds,
  onApply,
}: ReviewProjectFilterSheetProps) {
  const [draft, setDraft] = useState<Set<string>>(() => new Set(selectedIds ?? []));
  // Reset the draft selection whenever the sheet transitions from closed to
  // open, computed during render (React's recommended alternative to
  // syncing state from props via an effect) rather than in a useEffect.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen && !wasOpen) {
    setWasOpen(true);
    setDraft(new Set(selectedIds ?? []));
  } else if (!isOpen && wasOpen) {
    setWasOpen(false);
  }

  if (!isOpen) return null;

  const allSelected = draft.size === 0;

  const toggleProject = (id: string) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleApply = () => {
    onApply(draft.size === 0 || draft.size === projects.length ? null : Array.from(draft));
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[110]" style={{ fontFamily: 'var(--font-body)' }}>
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
        onClick={onClose}
      />

      <div className="absolute inset-0 flex items-center justify-center px-4 py-10" onClick={onClose}>
        <div
          role="dialog"
          aria-modal="true"
          aria-label="出題する単語帳を選ぶ"
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
            <div>
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
                REVIEW SOURCE
              </div>
              <div className="mt-0.5 font-display text-[19px] font-extrabold text-[var(--solid-ink)]">
                出題する単語帳を選ぶ
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="閉じる"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
            >
              <Icon name="close" size={16} />
            </button>
          </div>

          <div className="mb-2 flex flex-col">
            <WordbookChoiceRow label="すべての単語帳" selected={allSelected} onClick={() => setDraft(new Set())} emphasized />
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="flex flex-col gap-1.5">
              {projects.map((project) => {
                const active = !allSelected && draft.has(project.id);
                return (
                  <WordbookChoiceRow
                    key={project.id}
                    label={project.title}
                    selected={active}
                    onClick={() => toggleProject(project.id)}
                  />
                );
              })}
            </div>
          </div>

          <SolidButton
            variant="accent"
            size="md"
            iconLeft="check"
            onClick={handleApply}
            className="mt-3.5 w-full"
            faceClassName="!w-full !justify-center"
          >
            この条件で出題
          </SolidButton>
        </div>
      </div>
    </div>
  );
}
