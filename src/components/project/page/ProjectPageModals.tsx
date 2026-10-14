'use client';

// 単語帳ページ (`/project/[id]`) の確認・移動モーダル。
import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { Project, Word } from '@/types';
import { thumbColor } from '@/lib/ui/thumb-color';
import { SectionSelectRow } from '@/components/project/page/SectionControls';
import { normalizeSectionNames } from '@/lib/project/word-sections';

export function DeleteProjectModal({
  open,
  loading,
  title,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  loading: boolean;
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100]" style={{ fontFamily: 'var(--font-body)' }}>
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="閉じる"
        onClick={onCancel}
        style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
      />
      <div className="absolute inset-0 flex items-center justify-center px-5">
        <div
          className="w-full max-w-[360px] rounded-[16px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] p-5"


        >
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
            DELETE
          </div>
          <h2 className="mt-1 font-display text-[18px] font-extrabold text-[var(--solid-ink)]">
            この単語帳を削除しますか？
          </h2>
          <p className="mt-2 truncate text-[12px] text-[var(--color-muted)]">「{title}」</p>
          <p className="mt-1 text-[11px] leading-[1.5] text-[var(--color-muted)]">
            この操作は取り消せません。含まれる単語もすべて削除されます。
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-2.5 text-[13px] font-bold text-[var(--solid-ink)] disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border-2 border-[var(--solid-ink)] px-3 py-2.5 text-[13px] font-bold text-white disabled:opacity-60"
              style={{ background: 'var(--color-error, #cc4d59)' }}
            >
              {loading && <Icon name="progress_activity" size={14} className="animate-spin" />}
              削除する
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BulkDeleteModal({
  open,
  loading,
  count,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  loading: boolean;
  count: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100]" style={{ fontFamily: 'var(--font-body)' }}>
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="閉じる"
        onClick={onCancel}
        style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
      />
      <div className="absolute inset-0 flex items-center justify-center px-5">
        <div
          className="w-full max-w-[360px] rounded-[16px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] p-5"


        >
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
            DELETE
          </div>
          <h2 className="mt-1 font-display text-[18px] font-extrabold text-[var(--solid-ink)]">
            {count}語を削除しますか？
          </h2>
          <p className="mt-2 text-[11px] leading-[1.5] text-[var(--color-muted)]">
            選択した{count}語が削除されます。この操作は取り消せません。
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-2.5 text-[13px] font-bold text-[var(--solid-ink)] disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border-2 border-[var(--solid-ink)] px-3 py-2.5 text-[13px] font-bold text-white disabled:opacity-60"
              style={{ background: 'var(--color-error, #cc4d59)' }}
            >
              {loading && <Icon name="progress_activity" size={14} className="animate-spin" />}
              削除する
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ImportToProjectModal({
  open,
  loading,
  count,
  projects,
  onCreateSection,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  loading: boolean;
  count: number;
  projects: Project[];
  /** コピー先の単語帳に新しいセクションを作る。 */
  onCreateSection: (projectId: string, name: string) => Promise<boolean>;
  onCancel: () => void;
  /** sectionName はコピー先のセクション (null = 未分類)。 */
  onConfirm: (projectId: string, sectionName: string | null) => void;
}) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedSectionName, setSelectedSectionName] = useState<string | null>(null);
  const selectedProject = projects.find((p) => p.id === selectedProjectId) ?? null;

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100]" style={{ fontFamily: 'var(--font-body)' }}>
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="閉じる"
        onClick={onCancel}
        style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
      />
      <div className="absolute inset-0 flex items-center justify-center px-5">
        <div
          className="w-full max-w-[360px] rounded-[16px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] p-5"


        >
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
            COPY TO
          </div>
          <h2 className="mt-1 font-display text-[18px] font-extrabold text-[var(--solid-ink)]">
            {count}語をコピー
          </h2>
          <p className="mt-2 text-[11px] leading-[1.5] text-[var(--color-muted)]">
            コピー先の単語帳を選択してください。選択した単語がコピーされます。
          </p>
          <div className="mt-3 max-h-[240px] overflow-y-auto">
            {projects.length === 0 ? (
              <p className="py-4 text-center text-[12px] text-[var(--color-muted)]">
                他の単語帳がありません
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {projects.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      if (selectedProjectId !== p.id) setSelectedSectionName(null);
                      setSelectedProjectId(p.id);
                    }}
                    disabled={loading}
                    className={`flex items-center gap-2.5 rounded-[10px] border-2 px-3 py-2.5 text-left transition-all duration-100 ${
                      selectedProjectId === p.id
                        ? 'border-[var(--solid-ink)] bg-[var(--color-accent-subtle)]'
                        : 'border-[var(--color-border)] bg-[var(--color-surface)]'
                    }`}
                  >
                    <span
                      className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[6px] text-[11px] font-black text-white"
                      style={{ background: thumbColor(p.id) }}
                    >
                      {p.title.slice(0, 1)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[var(--solid-ink)]">
                      {p.title}
                    </span>
                    {selectedProjectId === p.id && (
                      <Icon name="check" size={16} className="shrink-0 text-[var(--color-accent)]" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedProject && (
            <div className="mt-3">
              <SectionSelectRow
                sectionNames={normalizeSectionNames(selectedProject.sectionNames ?? [])}
                value={selectedSectionName}
                disabled={loading}
                onChange={setSelectedSectionName}
                onCreate={(name) => onCreateSection(selectedProject.id, name)}
              />
            </div>
          )}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-2.5 text-[13px] font-bold text-[var(--solid-ink)] disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => selectedProjectId && onConfirm(selectedProjectId, selectedSectionName)}
              disabled={loading || !selectedProjectId}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-accent)] px-3 py-2.5 text-[13px] font-bold text-[var(--color-on-accent)] disabled:opacity-60"
            >
              {loading && <Icon name="progress_activity" size={14} className="animate-spin" />}
              コピーする
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SingleWordDeleteModal({
  open,
  loading,
  word,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  loading: boolean;
  word: Word | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open || !word) return null;
  return (
    <div className="fixed inset-0 z-[100]" style={{ fontFamily: 'var(--font-body)' }}>
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="閉じる"
        onClick={onCancel}
        style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
      />
      <div className="absolute inset-0 flex items-center justify-center px-5">
        <div
          className="w-full max-w-[360px] rounded-[16px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] p-5"


        >
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
            DELETE
          </div>
          <h2 className="mt-1 font-display text-[18px] font-extrabold text-[var(--solid-ink)]">
            単語を削除しますか？
          </h2>
          <p className="mt-2 text-[11px] leading-[1.5] text-[var(--color-muted)]">
            {word.english} が削除されます。この操作は取り消せません。
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-2.5 text-[13px] font-bold text-[var(--solid-ink)] disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={loading}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border-2 border-[var(--solid-ink)] px-3 py-2.5 text-[13px] font-bold text-white disabled:opacity-60"
              style={{ background: 'var(--color-error, #cc4d59)' }}
            >
              {loading && <Icon name="progress_activity" size={14} className="animate-spin" />}
              削除する
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
