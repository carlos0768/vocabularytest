'use client';

// 単語帳ページ (`/project/[id]`) のセクション操作: 選択チップ / 新規作成 / 一括移動。
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import type { Word } from '@/types';
import {
  normalizeSectionName,
  suggestNewSectionName,
  UNSECTIONED_LABEL,
} from '@/lib/project/word-sections';
import { SECTION_NAME_MAX_LENGTH } from '../../../../shared/word-sections';

const CHIP_BASE =
  'inline-flex h-[32px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full border-2 px-3 text-[12px] font-bold transition-all duration-100 disabled:opacity-50';

/**
 * セクションを選ぶチップの列。末尾の「＋」でその場で新しいセクションを作れる。
 * value が null なら未分類。
 */
export function SectionChipPicker({
  sectionNames,
  value,
  disabled,
  onChange,
  onCreate,
}: {
  sectionNames: string[];
  value: string | null;
  disabled?: boolean;
  onChange: (name: string | null) => void;
  /** 新しいセクションを作る。成功したら作った名前が選ばれる。 */
  onCreate: (name: string) => Promise<boolean> | boolean;
}) {
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  const submit = async () => {
    const name = normalizeSectionName(draft);
    if (!name || saving) return;
    if (sectionNames.includes(name)) {
      onChange(name);
      setCreating(false);
      return;
    }
    setSaving(true);
    const ok = await onCreate(name);
    setSaving(false);
    if (ok) {
      onChange(name);
      setCreating(false);
    }
  };

  const chip = (label: string, name: string | null) => {
    const active = value === name;
    return (
      <button
        key={name ?? '__unsectioned'}
        type="button"
        onClick={() => onChange(name)}
        disabled={disabled}
        aria-pressed={active}
        className={`${CHIP_BASE} ${
          active
            ? 'border-[var(--solid-ink)] bg-[var(--solid-ink)] text-[var(--color-on-ink)]'
            : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--solid-ink)]'
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {chip(UNSECTIONED_LABEL, null)}
        {sectionNames.map((name) => chip(name, name))}
        {!creating && (
          <button
            type="button"
            onClick={() => {
              setDraft(suggestNewSectionName(sectionNames));
              setCreating(true);
            }}
            disabled={disabled}
            aria-label="新しいセクション"
            className={`${CHIP_BASE} border-dashed border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)]`}
          >
            <Icon name="add" size={14} />
            新規
          </button>
        )}
      </div>
      {creating && (
        <div className="mt-1.5 flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void submit();
              }
              if (event.key === 'Escape') setCreating(false);
            }}
            maxLength={SECTION_NAME_MAX_LENGTH}
            disabled={saving}
            aria-label="新しいセクション名"
            className="min-w-0 flex-1 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-2 text-[13px] font-bold text-[var(--solid-ink)] outline-none disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving || !normalizeSectionName(draft)}
            className="inline-flex h-[38px] shrink-0 items-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-accent)] px-3 text-[12px] font-bold text-[var(--color-on-accent)] disabled:opacity-50"
          >
            {saving ? <Icon name="progress_activity" size={14} className="animate-spin" /> : '作成'}
          </button>
          <button
            type="button"
            onClick={() => setCreating(false)}
            disabled={saving}
            aria-label="作成をやめる"
            className="inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]"
          >
            <Icon name="close" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function ModalFrame({
  onCancel,
  busy,
  children,
}: {
  onCancel: () => void;
  busy: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[100]" style={{ fontFamily: 'var(--font-body)' }}>
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="閉じる"
        onClick={() => { if (!busy) onCancel(); }}
        style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
      />
      <div className="absolute inset-0 flex items-center justify-center px-5">
        <div className="w-full max-w-[380px] rounded-[16px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] p-5">
          {children}
        </div>
      </div>
    </div>
  );
}

function ModalActions({
  busy,
  confirmLabel,
  confirmDisabled,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  confirmLabel: string;
  confirmDisabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="mt-4 flex gap-2">
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="flex-1 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-2.5 text-[13px] font-bold text-[var(--solid-ink)] disabled:opacity-50"
      >
        キャンセル
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={busy || confirmDisabled}
        className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-accent)] px-3 py-2.5 text-[13px] font-bold text-[var(--color-on-accent)] disabled:opacity-50"
      >
        {busy && <Icon name="progress_activity" size={14} className="animate-spin" />}
        {confirmLabel}
      </button>
    </div>
  );
}

type SectionNameModalProps = {
  sectionNames: string[];
  loading: boolean;
  onCancel: () => void;
  onConfirm: (name: string) => void;
};

/** 新しいセクションを作るモーダル (下部バーの右端の「＋」から)。 */
export function CreateSectionModal(props: SectionNameModalProps & { open: boolean }) {
  // 開くたびに初期値から始めたいので、中身は開いている間だけマウントする
  return props.open ? (
    <SectionNameModalBody
      {...props}
      title="新しいセクション"
      confirmLabel="作成"
      initialName={suggestNewSectionName(props.sectionNames)}
    />
  ) : null;
}

/**
 * セクションの名前を変えるモーダル (セクション名の横の編集ボタンから)。
 * target.name が null なら未分類の語に名前を付ける (新しいセクションになる)。
 */
export function RenameSectionModal(
  props: SectionNameModalProps & {
    target: { name: string | null } | null;
    /** セクションを消す (語は未分類へ)。名前の付いたセクションのときだけ使う */
    onDelete?: () => void;
    /** 消すセクションに入っている語数 (確認に出す) */
    wordCount?: number;
  },
) {
  const { target } = props;
  if (!target) return null;
  return (
    <SectionNameModalBody
      {...props}
      title="セクション名を変更"
      confirmLabel="変更"
      initialName={target.name ?? suggestNewSectionName(props.sectionNames)}
      currentName={target.name ?? undefined}
      onDelete={target.name ? props.onDelete : undefined}
    />
  );
}

function SectionNameModalBody({
  sectionNames,
  loading,
  onCancel,
  onConfirm,
  title,
  confirmLabel,
  initialName,
  currentName,
  onDelete,
  wordCount = 0,
}: SectionNameModalProps & {
  title: string;
  confirmLabel: string;
  initialName: string;
  /** 名前変更のときの元の名前 (重複判定から外す) */
  currentName?: string;
  onDelete?: () => void;
  wordCount?: number;
}) {
  const [name, setName] = useState(initialName);
  // 削除は押した後にもう一度確かめる
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (confirmingDelete && onDelete) {
    return (
      <ModalFrame onCancel={onCancel} busy={loading}>
        <h2 className="font-display text-[18px] font-extrabold text-[var(--solid-ink)]">
          「{currentName}」を削除
        </h2>
        {wordCount > 0 && (
          <p className="mt-2 text-[12px] text-[var(--color-muted)]">{wordCount}語は未分類に移ります</p>
        )}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setConfirmingDelete(false)}
            disabled={loading}
            className="flex-1 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-2.5 text-[13px] font-bold text-[var(--solid-ink)] disabled:opacity-50"
          >
            戻る
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={loading}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border-2 border-[var(--solid-ink)] px-3 py-2.5 text-[13px] font-bold text-white disabled:opacity-50"
            style={{ background: 'var(--color-error, #cc4d59)' }}
          >
            {loading && <Icon name="progress_activity" size={14} className="animate-spin" />}
            削除
          </button>
        </div>
      </ModalFrame>
    );
  }

  const normalized = normalizeSectionName(name);
  const unchanged = normalized !== null && normalized === currentName;
  const duplicate = normalized !== null && !unchanged && sectionNames.includes(normalized);
  const submit = () => { if (normalized && !duplicate && !unchanged && !loading) onConfirm(normalized); };

  return (
    <ModalFrame onCancel={onCancel} busy={loading}>
      <h2 className="font-display text-[18px] font-extrabold text-[var(--solid-ink)]">{title}</h2>
      <input
        type="text"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') submit(); }}
        maxLength={SECTION_NAME_MAX_LENGTH}
        disabled={loading}
        autoFocus
        aria-label="セクション名"
        className="mt-3 w-full rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-2.5 font-display text-[15px] font-bold text-[var(--solid-ink)] outline-none disabled:opacity-60"
      />
      {duplicate && (
        <p className="mt-1.5 text-[11px] font-bold text-[var(--color-error)]">同じ名前のセクションがあります</p>
      )}
      <ModalActions
        busy={loading}
        confirmLabel={confirmLabel}
        confirmDisabled={!normalized || duplicate || unchanged}
        onCancel={onCancel}
        onConfirm={submit}
      />
      {onDelete && (
        <button
          type="button"
          onClick={() => setConfirmingDelete(true)}
          disabled={loading}
          className="mx-auto mt-3 flex items-center gap-1 text-[12px] font-bold text-[var(--color-error)] disabled:opacity-50"
        >
          <Icon name="delete" size={14} />
          セクションを削除
        </button>
      )}
    </ModalFrame>
  );
}

/** 選択した単語をセクションへ移すモーダル (選択モードの一括操作から)。 */
type MoveToSectionModalProps = {
  open: boolean;
  count: number;
  sectionNames: string[];
  initialSectionName: string | null;
  loading: boolean;
  onCancel: () => void;
  onCreateSection: (name: string) => Promise<boolean>;
  onConfirm: (name: string | null) => void;
};

export function MoveToSectionModal(props: MoveToSectionModalProps) {
  return props.open ? <MoveToSectionModalBody {...props} /> : null;
}

function MoveToSectionModalBody({
  count,
  sectionNames,
  initialSectionName,
  loading,
  onCancel,
  onCreateSection,
  onConfirm,
}: MoveToSectionModalProps) {
  const [selected, setSelected] = useState<string | null>(initialSectionName);
  return (
    <ModalFrame onCancel={onCancel} busy={loading}>
      <h2 className="font-display text-[18px] font-extrabold text-[var(--solid-ink)]">
        {count}語をセクションへ移動
      </h2>
      <div className="mt-3">
        <SectionChipPicker
          sectionNames={sectionNames}
          value={selected}
          disabled={loading}
          onChange={setSelected}
          onCreate={onCreateSection}
        />
      </div>
      <ModalActions
        busy={loading}
        confirmLabel="移動"
        onCancel={onCancel}
        onConfirm={() => onConfirm(selected)}
      />
    </ModalFrame>
  );
}

/** 一覧のセクション送り (タブレット・デスクトップの一覧の下に置く)。 */
export type ProjectSectionNav = {
  /** 送りを出すか (単語もセクションも無い単語帳では出さない) */
  visible: boolean;
  /** 表示中のセクション名。セクションの無い単語帳では null */
  label: string | null;
  /** 表示中のセクションの語 (絞り込み・並べ替え済み) */
  words: Word[];
  atStart: boolean;
  atEnd: boolean;
  /** 検索中は単語帳全体を1つに出すので送らない */
  disabled: boolean;
  onPrev: () => void;
  onNext: () => void;
  onCreateEnd: () => void;
  /** 表示中のまとまりの名前を変える (未分類なら名前を付けてセクションにする)。検索中は渡さない */
  onRename?: () => void;
};

function SectionPagerButton({
  direction,
  atEdge,
  disabled,
  onStep,
  onCreate,
}: {
  direction: 'prev' | 'next';
  atEdge: boolean;
  disabled: boolean;
  onStep: () => void;
  /** 渡したときだけ、端で「＋」になる (右端だけ) */
  onCreate?: () => void;
}) {
  const create = atEdge && !disabled && onCreate !== undefined;
  const label = create ? '新しいセクション' : direction === 'prev' ? '前のセクション' : '次のセクション';
  return (
    <button
      type="button"
      onClick={create ? onCreate : onStep}
      disabled={disabled || (atEdge && !create)}
      aria-label={label}
      title={label}
      className="inline-flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-40"
    >
      <Icon name={create ? 'add' : direction === 'prev' ? 'chevron_left' : 'chevron_right'} size={18} />
    </button>
  );
}

export function SectionPager({ nav }: { nav: ProjectSectionNav }) {
  if (!nav.visible) return null;
  return (
    <div className="flex items-center justify-between gap-3 pt-3">
      <SectionPagerButton
        direction="prev"
        atEdge={nav.atStart}
        disabled={nav.disabled}
        onStep={nav.onPrev}
      />
      <div className="flex min-w-0 flex-1 flex-col items-center text-center">
        {nav.label && (
          <div className="flex max-w-full items-center gap-1">
            <span className="min-w-0 truncate font-display text-[14px] font-extrabold text-[var(--solid-ink)]">
              {nav.label}
            </span>
            {nav.onRename && <SectionRenameButton onClick={nav.onRename} className="h-11 w-11" />}
          </div>
        )}
        <div className="flex items-center gap-1">
          <span className="font-mono text-[11px] font-bold tabular-nums text-[var(--color-muted)]">
            {nav.words.length}語
          </span>
          {/* セクションの無い単語帳は名前が無いので、語数の横に出す */}
          {!nav.label && nav.onRename && <SectionRenameButton onClick={nav.onRename} className="h-11 w-11" />}
        </div>
      </div>
      <SectionPagerButton
        direction="next"
        atEdge={nav.atEnd}
        disabled={nav.disabled}
        onStep={nav.onNext}
        onCreate={nav.onCreateEnd}
      />
    </div>
  );
}

/** セクション名の横の編集ボタン。 */
export function SectionRenameButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="セクション名を変更"
      title="セクション名を変更"
      className={`inline-flex shrink-0 items-center justify-center rounded-[8px] text-[var(--color-muted)] transition-colors hover:text-[var(--solid-ink)] active:translate-x-px active:translate-y-px ${className ?? 'h-8 w-8'}`}
    >
      <Icon name="edit" size={15} />
    </button>
  );
}
