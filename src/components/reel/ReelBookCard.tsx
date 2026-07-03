'use client';

import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import type { ReelBook } from '@/lib/reels/types';

type ReelBookCardProps = {
  book: ReelBook;
  importing: boolean;
  onImport: () => void;
};

/**
 * Spotify-style attribution card at the bottom of a reel:
 * thumbnail + wordbook title + creator, with a one-tap whole-book
 * import button on the right.
 */
export function ReelBookCard({ book, importing, onImport }: ReelBookCardProps) {
  const router = useRouter();
  const canNavigate = book.type === 'shared' && Boolean(book.shareId);

  const handleOpen = () => {
    if (canNavigate && book.shareId) {
      router.push(`/share/${encodeURIComponent(book.shareId)}`);
    }
  };

  return (
    <div
      role={canNavigate ? 'button' : undefined}
      tabIndex={canNavigate ? 0 : undefined}
      onClick={handleOpen}
      onKeyDown={(event) => {
        if (canNavigate && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          handleOpen();
        }
      }}
      className={cn(
        'flex w-full items-center gap-3 rounded-[var(--solid-radius-sm)] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] p-2.5',
        canNavigate && 'cursor-pointer transition-transform duration-100 active:translate-x-px active:translate-y-px',
      )}
    >
      {book.iconImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={book.iconImage}
          alt=""
          className="h-11 w-11 flex-shrink-0 rounded-[8px] border border-[var(--color-border)] object-cover"
        />
      ) : (
        <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-secondary)]">
          <Icon name="menu_book" size={22} className="text-[var(--color-muted)]" />
        </span>
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-[var(--color-foreground)]">{book.title}</p>
        <p className="truncate text-xs text-[var(--color-secondary-text)]">
          {book.type === 'official' ? (
            <span className="font-semibold text-[var(--color-accent)]">公式単語帳</span>
          ) : (
            <>{book.ownerName || '匿名ユーザー'}</>
          )}
          {book.wordCount > 0 && <> ・ {book.wordCount}語</>}
        </p>
      </div>

      <button
        type="button"
        aria-label={book.importedByMe ? 'インポート済み' : 'この単語帳をインポート'}
        disabled={book.importedByMe || importing}
        onClick={(event) => {
          event.stopPropagation();
          onImport();
        }}
        className={cn(
          'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] transition-transform duration-100',
          book.importedByMe
            ? 'bg-[var(--color-accent-light)]'
            : 'bg-[var(--color-surface)] active:scale-90',
          importing && 'opacity-60',
        )}
      >
        {book.importedByMe ? (
          <Icon name="check" size={22} className="text-[var(--color-accent)]" />
        ) : (
          <Icon
            name={importing ? 'progress_activity' : 'add'}
            size={22}
            className={cn('text-[var(--color-foreground)]', importing && 'animate-spin')}
          />
        )}
      </button>
    </div>
  );
}
