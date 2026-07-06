'use client';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import type { ReelItem } from '@/lib/reels/types';

type ReelActionRailProps = {
  item: ReelItem;
  onLike: () => void;
  onSave: () => void;
  onSpeak: () => void;
  onComment: () => void;
  onShare: () => void;
  onMore: () => void;
};

function RailButton({
  icon,
  filled,
  label,
  active,
  activeVariant = 'like',
  onClick,
  ariaLabel,
}: {
  icon: string;
  filled?: boolean;
  label?: string;
  active?: boolean;
  activeVariant?: 'like' | 'save';
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="flex flex-col items-center gap-1"
    >
      <span
        className={cn(
          'flex h-12 w-12 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] transition-transform duration-100 active:scale-90',
          active && (activeVariant === 'save' ? 'bg-[var(--color-accent-light)]' : 'bg-[var(--color-error-light)]'),
        )}
      >
        <Icon
          name={icon}
          filled={filled}
          size={24}
          className={
            active
              ? activeVariant === 'save'
                ? 'text-[var(--color-accent)]'
                : 'text-[var(--color-error)]'
              : 'text-[var(--color-foreground)]'
          }
        />
      </span>
      {label !== undefined && (
        <span className="text-xs font-semibold text-[var(--color-foreground)]">{label}</span>
      )}
    </button>
  );
}

/** SNS-style vertical action rail on the right edge of a reel card. */
export function ReelActionRail({ item, onLike, onSave, onSpeak, onComment, onShare, onMore }: ReelActionRailProps) {
  return (
    <div className="flex flex-col items-center gap-4">
      <RailButton
        icon="favorite"
        filled={item.likedByMe}
        active={item.likedByMe}
        label={String(item.likeCount)}
        onClick={onLike}
        ariaLabel={item.likedByMe ? 'いいねを取り消す' : 'いいねする'}
      />
      <RailButton
        icon="bookmark"
        filled={item.savedByMe}
        active={item.savedByMe}
        activeVariant="save"
        label="保存"
        onClick={onSave}
        ariaLabel={item.savedByMe ? '保存済みに追加済み' : 'この単語を保存済みに追加'}
      />
      <RailButton
        icon="chat_bubble"
        label={item.commentCount > 0 ? String(item.commentCount) : undefined}
        onClick={onComment}
        ariaLabel="コメントを見る・書く"
      />
      <RailButton icon="volume_up" onClick={onSpeak} ariaLabel="発音を再生" />
      <RailButton icon="send" onClick={onShare} ariaLabel="この単語を共有" />
      <RailButton
        icon="more_horiz"
        onClick={onMore}
        ariaLabel="その他のメニュー（興味あり/なし）"
      />
    </div>
  );
}
