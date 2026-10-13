'use client';

/**
 * 単語詳細を重ねて出す共通のオーバーレイ (背景 + 中央のカード + WordDetailView)。
 *
 * 単語帳詳細 / 単語一覧 / 保存済み / ホームの単語検索で同じものをコピーしていたので
 * 1 つにまとめた。phone は 480px、tablet は 560px の中央カード。desktop は
 * DesktopWordDetailModal (前後移動つき) を使うのでここは通らない。
 */

import type { ReactNode } from 'react';
import { WordDetailView, type WordDetailViewProps } from '@/components/word/WordDetailView';
import { useLayoutMode } from '@/hooks/use-layout-mode';
import type { Word } from '@/types';

export function WordDetailOverlay({
  word,
  onClose,
  onWordUpdated,
  onDelete,
  zIndex = 80,
  footer,
}: {
  word: Word;
  onClose: () => void;
  onWordUpdated?: WordDetailViewProps['onWordUpdated'];
  onDelete?: WordDetailViewProps['onDelete'];
  /** 重ねる順。別のシートの上に出すときだけ上げる */
  zIndex?: number;
  /** カードの下に添えるもの (任意) */
  footer?: ReactNode;
}) {
  const mode = useLayoutMode();
  const maxWidth = mode === 'tablet' ? 560 : 480;

  return (
    <div className="fixed inset-0" style={{ zIndex, fontFamily: 'var(--font-body)' }}>
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
        onClick={onClose}
      />
      <div className="absolute inset-0 flex items-center justify-center px-4 py-10" onClick={onClose}>
        <div
          className="w-full overflow-y-auto overscroll-contain"
          onClick={(event) => event.stopPropagation()}
          style={{
            maxWidth,
            maxHeight: '80dvh',
            background: 'var(--color-paper)',
            border: '2px solid var(--solid-ink)',
            borderRadius: 20,
          }}
        >
          <WordDetailView
            wordId={word.id}
            variant="modal"
            initialWord={word}
            onClose={onClose}
            onWordUpdated={onWordUpdated}
            onDelete={onDelete}
          />
          {footer}
        </div>
      </div>
    </div>
  );
}
