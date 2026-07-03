'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, useToast } from '@/components/ui';
import { Icon } from '@/components/ui/Icon';
import type { ReelComment, ReelItem } from '@/lib/reels/types';

type ReelCommentSheetProps = {
  item: ReelItem;
  isOpen: boolean;
  onClose: () => void;
  /** notify the feed so the item's comment count stays in sync */
  onCountChange: (delta: number) => void;
};

function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - Date.parse(iso);
  if (!Number.isFinite(diffMs) || diffMs < 0) return '';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'たった今';
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}日前`;
  return new Date(iso).toLocaleDateString('ja-JP');
}

/** Bottom-sheet comment section for a reel word. */
export function ReelCommentSheet({ item, isOpen, onClose, onCountChange }: ReelCommentSheetProps) {
  const { showToast } = useToast();
  const [comments, setComments] = useState<ReelComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const loadedForRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ source: item.source, wordId: item.wordId });
      const response = await fetch(`/api/reels/comments?${params.toString()}`, { cache: 'no-store' });
      const payload = (await response.json()) as { success: boolean; comments?: ReelComment[] };
      if (response.ok && payload.success && payload.comments) {
        setComments(payload.comments);
      }
    } catch (error) {
      console.error('Failed to load reel comments:', error);
    } finally {
      setLoading(false);
    }
  }, [item.source, item.wordId]);

  useEffect(() => {
    if (isOpen && loadedForRef.current !== item.id) {
      loadedForRef.current = item.id;
      setComments([]);
      void load();
    }
    if (!isOpen) {
      loadedForRef.current = null;
    }
  }, [isOpen, item.id, load]);

  const handlePost = async () => {
    const trimmed = body.trim();
    if (!trimmed || posting) return;
    setPosting(true);
    try {
      const response = await fetch('/api/reels/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: item.source, wordId: item.wordId, body: trimmed }),
      });
      const payload = (await response.json()) as { success: boolean; comment?: ReelComment };
      if (!response.ok || !payload.success || !payload.comment) {
        throw new Error('comment_post_failed');
      }
      setComments((prev) => [payload.comment!, ...prev]);
      setBody('');
      onCountChange(1);
    } catch (error) {
      console.error('Failed to post reel comment:', error);
      showToast({ message: 'コメントの投稿に失敗しました', type: 'error' });
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    const previous = comments;
    setComments((prev) => prev.filter((comment) => comment.id !== commentId));
    try {
      const response = await fetch(`/api/reels/comments/${encodeURIComponent(commentId)}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('comment_delete_failed');
      onCountChange(-1);
    } catch (error) {
      console.error('Failed to delete reel comment:', error);
      setComments(previous);
      showToast({ message: 'コメントの削除に失敗しました', type: 'error' });
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} variant="sheet">
      <div className="flex max-h-[70dvh] flex-col px-4 pb-4 pt-5">
        <h2 className="mb-3 px-1 font-display text-base font-bold text-[var(--color-foreground)]">
          コメント
          <span className="ml-2 text-sm font-semibold text-[var(--color-secondary-text)]">
            {item.english}
          </span>
        </h2>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {loading ? (
            <p className="py-8 text-center text-sm text-[var(--color-muted)]">読み込み中...</p>
          ) : comments.length === 0 ? (
            <p className="py-8 text-center text-sm text-[var(--color-muted)]">
              まだコメントがありません。最初のコメントを書いてみましょう。
            </p>
          ) : (
            <ul className="space-y-3 py-1">
              {comments.map((comment) => (
                <li key={comment.id} className="flex items-start gap-2.5 px-1">
                  <span className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface-secondary)]">
                    <Icon name="person" size={18} className="text-[var(--color-muted)]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-[var(--color-secondary-text)]">
                      <span className="font-bold text-[var(--color-foreground)]">
                        {comment.authorName}
                      </span>
                      <span className="ml-2">{formatRelativeTime(comment.createdAt)}</span>
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-[var(--color-foreground)]">
                      {comment.body}
                    </p>
                  </div>
                  {comment.isMine && (
                    <button
                      type="button"
                      aria-label="コメントを削除"
                      onClick={() => void handleDelete(comment.id)}
                      className="p-1 text-[var(--color-muted)] transition-colors hover:text-[var(--color-error)]"
                    >
                      <Icon name="delete" size={16} />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-3 flex items-end gap-2 border-t border-[var(--color-border)] pt-3">
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={1}
            maxLength={500}
            placeholder="コメントを書く..."
            className="max-h-24 min-h-[42px] flex-1 resize-none rounded-[var(--solid-radius-sm)] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-foreground)] placeholder:text-[var(--color-muted)] focus:outline-none"
          />
          <button
            type="button"
            aria-label="コメントを送信"
            disabled={!body.trim() || posting}
            onClick={() => void handlePost()}
            className="flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] text-white transition-transform duration-100 active:scale-90 disabled:opacity-40"
          >
            <Icon name="send" size={18} />
          </button>
        </div>
      </div>
    </Modal>
  );
}
