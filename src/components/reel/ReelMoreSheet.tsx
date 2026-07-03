'use client';

import { Modal } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import type { ReelFeedback, ReelItem } from '@/lib/reels/types';

type ReelMoreSheetProps = {
  item: ReelItem;
  isOpen: boolean;
  onClose: () => void;
  onOpenComments: () => void;
  onFeedback: (feedback: ReelFeedback) => void;
};

function SheetRow({
  icon,
  label,
  sub,
  onClick,
}: {
  icon: string;
  label: string;
  sub?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[var(--solid-radius-sm)] px-3 py-3.5 text-left transition-colors hover:bg-[var(--color-surface-secondary)]"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-secondary)]">
        <Icon name={icon} size={20} className="text-[var(--color-foreground)]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-[var(--color-foreground)]">{label}</span>
        {sub && <span className="block text-xs text-[var(--color-secondary-text)]">{sub}</span>}
      </span>
      <Icon name="chevron_right" size={18} className="text-[var(--color-muted)]" />
    </button>
  );
}

/** "..." menu: comments entry + interested / not-interested feedback. */
export function ReelMoreSheet({
  item,
  isOpen,
  onClose,
  onOpenComments,
  onFeedback,
}: ReelMoreSheetProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} variant="sheet">
      <div className="px-4 pb-6 pt-5">
        <p className="mb-3 truncate px-3 font-display text-sm font-bold text-[var(--color-secondary-text)]">
          {item.english}
        </p>
        <SheetRow
          icon="chat_bubble"
          label="コメント"
          sub={item.commentCount > 0 ? `${item.commentCount}件のコメント` : 'コメントを見る・書く'}
          onClick={onOpenComments}
        />
        <SheetRow
          icon="thumb_up"
          label="興味あり"
          sub="似た単語帳のリールを増やします"
          onClick={() => onFeedback('interested')}
        />
        <SheetRow
          icon="visibility_off"
          label="興味なし"
          sub="この単語を今後表示しません"
          onClick={() => onFeedback('not_interested')}
        />
      </div>
    </Modal>
  );
}
