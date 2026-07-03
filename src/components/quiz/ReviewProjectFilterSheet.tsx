'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { SolidButton } from '@/components/redesign/SolidPage';

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
 * Bottom sheet for choosing which wordbooks (projects) contribute due words
 * to a review/learn quiz session. `selectedIds === null` means "all
 * wordbooks" — the default when nothing has been narrowed down.
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

      <div className="absolute bottom-0 left-0 right-0 flex justify-center">
        <div
          className="w-full animate-fade-in-up"
          style={{
            maxWidth: 480,
            background: '#faf7f1',
            border: '2px solid var(--solid-ink)',
            borderBottomWidth: 0,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            padding: '14px 18px max(28px, env(safe-area-inset-bottom))',
            boxShadow: '0 -8px 24px rgba(26,26,26,0.18)',
            maxHeight: 'min(80vh, 640px)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div className="mb-2.5 flex justify-center">
            <div className="h-1 w-10 rounded-full bg-[rgba(26,26,26,0.2)]" />
          </div>

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
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)]"
            >
              <Icon name="close" size={14} />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setDraft(new Set())}
            className="mb-2 flex items-center gap-3 rounded-[12px] border-2 px-3.5 py-3 text-left"
            style={{
              borderColor: allSelected ? 'var(--solid-ink)' : 'var(--color-border)',
              boxShadow: allSelected ? '2px 2px 0 var(--solid-ink)' : 'none',
              background: '#fff',
            }}
          >
            <span
              className="flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full"
              style={{
                border: `1.5px solid ${allSelected ? 'var(--color-accent)' : 'var(--color-border)'}`,
                background: allSelected ? 'var(--color-accent)' : '#fff',
              }}
            >
              {allSelected && <Icon name="check" size={13} className="text-white" />}
            </span>
            <span className="font-display text-[14px] font-bold text-[var(--solid-ink)]">すべての単語帳</span>
          </button>

          <div className="flex-1 overflow-y-auto">
            <div className="flex flex-col gap-1.5">
              {projects.map((project) => {
                const active = !allSelected && draft.has(project.id);
                return (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => toggleProject(project.id)}
                    className="flex items-center gap-3 rounded-[12px] border-2 px-3.5 py-2.5 text-left"
                    style={{
                      borderColor: active ? 'var(--solid-ink)' : 'var(--color-border)',
                      background: '#fff',
                    }}
                  >
                    <span
                      className="flex h-[20px] w-[20px] shrink-0 items-center justify-center rounded-full"
                      style={{
                        border: `1.5px solid ${active ? 'var(--color-accent)' : 'var(--color-border)'}`,
                        background: active ? 'var(--color-accent)' : '#fff',
                      }}
                    >
                      {active && <Icon name="check" size={13} className="text-white" />}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-display text-[13.5px] font-bold text-[var(--solid-ink)]">
                      {project.title}
                    </span>
                  </button>
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
