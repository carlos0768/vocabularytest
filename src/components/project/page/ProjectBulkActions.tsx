'use client';

// 単語帳ページ (`/project/[id]`) の一括選択時の操作バー。
import { useState } from 'react';
import type { VocabularyType } from '@/types';
import { Icon } from '@/components/ui/Icon';
import { SelectCheckbox } from '@/components/project/WordRow';

export function BulkActionBar({
  open,
  selectedCount,
  totalCount,
  allSelected,
  allFavoriteInSelection,
  favoriteLoading,
  vocabularyTypeLoading,
  importLoading,
  onCancel,
  onToggleSelectAll,
  onBulkFavorite,
  onBulkVocabularyType,
  onBulkImport,
  onBulkSection,
  onBulkDelete,
}: {
  open: boolean;
  selectedCount: number;
  totalCount: number;
  allSelected: boolean;
  allFavoriteInSelection: boolean;
  favoriteLoading: boolean;
  vocabularyTypeLoading: VocabularyType | null;
  importLoading: boolean;
  onCancel: () => void;
  onToggleSelectAll: () => void;
  onBulkFavorite: () => void;
  onBulkVocabularyType: (vocabularyType: VocabularyType) => void;
  onBulkImport: () => void;
  onBulkSection: () => void;
  onBulkDelete: () => void;
}) {
  const [actionMenuOpen, setActionMenuOpen] = useState(false);
  const hasSelection = selectedCount > 0;
  const actionLoading = favoriteLoading || vocabularyTypeLoading !== null || importLoading;
  const showActionMenu = actionMenuOpen && hasSelection && !actionLoading;

  if (!open) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-0 left-0 right-0 z-40 bg-[linear-gradient(to_top,var(--color-background)_70%,transparent)] px-3 pt-3 desktop:bg-none tablet:bg-none"
      style={{ paddingBottom: 'max(0.875rem, env(safe-area-inset-bottom))' }}
    >
      <div className="pointer-events-auto mx-auto w-full max-w-lg desktop:max-w-4xl">
        <div className="relative">
          <div
            className="pointer-events-none absolute inset-0 rounded-[14px] bg-[var(--solid-ink)]"
            style={{ transform: 'translate(2px, 3px)' }}
          />
          <div className="relative flex items-center gap-2 rounded-[14px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-2.5 py-2.5">
            <button
              type="button"
              onClick={onCancel}
              aria-label="選択を終了"
              className="inline-flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
            >
              <Icon name="close" size={16} />
            </button>
            <button
              type="button"
              onClick={onToggleSelectAll}
              disabled={totalCount === 0}
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-2.5 py-[7px] text-[12px] font-bold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-50"
            >
              <SelectCheckbox checked={allSelected && totalCount > 0} />
              {allSelected && totalCount > 0 ? '解除' : '全選択'}
            </button>
            <div className="min-w-[76px] flex-1 whitespace-nowrap px-1 text-center">
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
                SELECTED
              </div>
              <div className="font-display text-[14px] font-extrabold leading-none text-[var(--solid-ink)]">
                {selectedCount}
                <span className="ml-1 font-mono text-[10px] font-semibold text-[var(--color-muted)]">
                  / {totalCount}
                </span>
              </div>
            </div>
            {/* Desktop: bulk actions laid out inline (no "..." menu) */}
            <div className="hidden shrink-0 items-center gap-2 desktop:flex tablet:flex">
              <BulkInlineActionButton
                icon="bookmark"
                label="ブックマーク"
                filled={allFavoriteInSelection && hasSelection}
                loading={favoriteLoading}
                disabled={!hasSelection || actionLoading}
                onClick={onBulkFavorite}
              />
              <BulkInlineActionButton
                icon="keyboard_alt"
                label="Active (A)"
                loading={vocabularyTypeLoading === 'active'}
                disabled={!hasSelection || actionLoading}
                onClick={() => onBulkVocabularyType('active')}
              />
              <BulkInlineActionButton
                icon="visibility"
                label="Passive (P)"
                loading={vocabularyTypeLoading === 'passive'}
                disabled={!hasSelection || actionLoading}
                onClick={() => onBulkVocabularyType('passive')}
              />
              <BulkInlineActionButton
                icon="segment"
                label="セクション"
                disabled={!hasSelection || actionLoading}
                onClick={onBulkSection}
              />
              <BulkInlineActionButton
                icon="drive_file_move"
                label="コピー"
                loading={importLoading}
                disabled={!hasSelection || actionLoading}
                onClick={onBulkImport}
              />
            </div>
            {/* Mobile: compact "..." menu */}
            <div className="relative shrink-0 desktop:hidden tablet:hidden">
              {showActionMenu && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-40 cursor-default bg-transparent"
                    aria-label="一括操作メニューを閉じる"
                    onClick={() => setActionMenuOpen(false)}
                  />
                  <div
                    role="menu"
                    className="absolute bottom-[44px] right-0 z-50 flex w-[148px] flex-col gap-2 pb-1"
                  >
                    <BulkActionMenuButton
                      icon="bookmark"
                      label="ブックマーク"
                      filled={allFavoriteInSelection && hasSelection}
                      loading={favoriteLoading}
                      disabled={!hasSelection || actionLoading}
                      onClick={() => {
                        setActionMenuOpen(false);
                        onBulkFavorite();
                      }}
                    />
                    <BulkActionMenuButton
                      icon="keyboard_alt"
                      label="Active (A)"
                      loading={vocabularyTypeLoading === 'active'}
                      disabled={!hasSelection || actionLoading}
                      onClick={() => {
                        setActionMenuOpen(false);
                        onBulkVocabularyType('active');
                      }}
                    />
                    <BulkActionMenuButton
                      icon="visibility"
                      label="Passive (P)"
                      loading={vocabularyTypeLoading === 'passive'}
                      disabled={!hasSelection || actionLoading}
                      onClick={() => {
                        setActionMenuOpen(false);
                        onBulkVocabularyType('passive');
                      }}
                    />
                    <BulkActionMenuButton
                      icon="segment"
                      label="セクション"
                      disabled={!hasSelection || actionLoading}
                      onClick={() => {
                        setActionMenuOpen(false);
                        onBulkSection();
                      }}
                    />
                    <BulkActionMenuButton
                      icon="drive_file_move"
                      label="コピー"
                      loading={importLoading}
                      disabled={!hasSelection || actionLoading}
                      onClick={() => {
                        setActionMenuOpen(false);
                        onBulkImport();
                      }}
                    />
                  </div>
                </>
              )}
              <button
                type="button"
                onClick={() => setActionMenuOpen((value) => !value)}
                disabled={!hasSelection || actionLoading}
                aria-label="一括操作メニュー"
                aria-haspopup="menu"
                aria-expanded={showActionMenu}
                className="relative z-50 inline-flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-50"
              >
                {actionLoading ? (
                  <Icon name="progress_activity" size={16} className="animate-spin" />
                ) : (
                  <Icon name="more_horiz" size={16} />
                )}
              </button>
            </div>
            <button
              type="button"
              onClick={onBulkDelete}
              disabled={!hasSelection}
              aria-label="削除"
              className="inline-flex h-[36px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] border-2 border-[var(--solid-ink)] px-3 text-[12px] font-bold text-white transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-50"
              style={{ background: 'var(--color-error, #cc4d59)' }}
            >
              <Icon name="delete" size={15} />
              削除
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BulkInlineActionButton({
  icon,
  label,
  filled,
  loading,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  filled?: boolean;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-[36px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 text-[12px] font-bold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-50"
    >
      {loading ? (
        <Icon name="progress_activity" size={15} className="animate-spin" />
      ) : (
        <Icon
          name={icon}
          size={15}
          filled={filled}
          className={icon === 'bookmark' ? 'text-[var(--color-accent)]' : undefined}
        />
      )}
      {label}
    </button>
  );
}

function BulkActionMenuButton({
  icon,
  label,
  filled,
  loading,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  filled?: boolean;
  loading?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-[38px] w-full items-center justify-between rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 text-[12px] font-bold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-50"
    >
      <span>{label}</span>
      {loading ? (
        <Icon name="progress_activity" size={15} className="animate-spin" />
      ) : (
        <Icon
          name={icon}
          size={15}
          filled={filled}
          className={icon === 'bookmark' ? 'text-[var(--color-accent)]' : undefined}
        />
      )}
    </button>
  );
}
