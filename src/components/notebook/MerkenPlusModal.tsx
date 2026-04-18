'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { MerkenIcon } from './merken-primitives';

export type MerkenNotebookScreenId = 'wordbook' | 'structure' | 'correction';

export function MerkenPlusModal({
  open,
  onClose,
  onPick,
  variant = 'swiss',
}: {
  open: boolean;
  onClose: () => void;
  onPick: (id: MerkenNotebookScreenId) => void;
  variant?: 'editorial' | 'swiss';
}) {
  const [visible, setVisible] = useState(open);

  useEffect(() => {
    if (open) setVisible(true);
  }, [open]);

  if (!visible && !open) return null;

  const editorial = variant === 'editorial';
  const modes = [
    {
      id: 'wordbook' as const,
      icon: 'menu_book',
      title: '単語帳',
      sub: 'スキャン・手動・自動生成',
      blurb: '写真から単語を抽出、手動で追加、または既出語から例文を生成。',
    },
    {
      id: 'structure' as const,
      icon: 'account_tree',
      title: '構造解析',
      sub: '準1級レベルの構文を抽出',
      blurb: '句ごとに折りたたみ。どこが一括りか、一目でわかる。',
    },
    {
      id: 'correction' as const,
      icon: 'spellcheck',
      title: '添削',
      sub: '誤用を洗い出し、文法化',
      blurb: '間違いはすべて指摘。語法ごとにカード化して復習へ。',
    },
  ];

  const close = () => {
    onClose();
    window.setTimeout(() => setVisible(false), 300);
  };

  return (
    <div
      onClick={close}
      className="absolute inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(10,10,10,.35)', backdropFilter: 'blur(6px)', animation: 'fadeIn .2s' }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className={cn(
          'a-slideUp mx-3 mb-3 w-full border p-5',
          editorial ? 'rounded-[28px] border-rule bg-paper' : 'border-bd bg-white',
        )}
        style={editorial ? undefined : { borderRadius: 4 }}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div
              className={cn(
                'text-[10px] font-bold uppercase tracking-[.24em]',
                editorial ? 'text-ochre' : 'text-muted',
              )}
              style={{ fontFamily: editorial ? 'Fraunces, serif' : '"Inter Tight"' }}
            >
              新規作成
            </div>
            <div
              className={cn(
                'mt-1 tracking-tight',
                editorial ? 'font-serif text-[22px] font-medium' : 'font-sans text-[20px] font-extrabold',
              )}
            >
              何を作りますか？
            </div>
          </div>
          <button onClick={close} className="press flex h-9 w-9 items-center justify-center rounded-full hover:bg-black/5">
            <MerkenIcon name="close" size={18} />
          </button>
        </div>

        <div className="stagger grid grid-cols-1 gap-2.5">
          {modes.map((mode) => (
            <button
              key={mode.id}
              onClick={() => {
                onPick(mode.id);
                close();
              }}
              className={cn(
                'press flex items-start gap-4 p-4 text-left transition',
                editorial
                  ? 'rounded-2xl border border-rule bg-cream hover:bg-[#efead9]'
                  : 'border border-bd bg-white hover:border-ink',
              )}
              style={editorial ? undefined : { borderRadius: 4 }}
            >
              <div
                className={cn(
                  'flex shrink-0 items-center justify-center bg-ink text-paper',
                  editorial ? 'h-12 w-12 rounded-full' : 'h-11 w-11',
                )}
                style={editorial ? undefined : { borderRadius: 2 }}
              >
                <MerkenIcon name={mode.icon} size={22} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <div
                    className={cn(
                      'tracking-tight',
                      editorial ? 'font-serif text-[18px] font-medium' : 'font-sans text-[16px] font-bold',
                    )}
                  >
                    {mode.title}
                  </div>
                  <div
                    className={cn(
                      'text-[10px]',
                      editorial ? 'font-serif italic text-ochre' : 'uppercase tracking-[.14em] text-muted',
                    )}
                    style={editorial ? undefined : { fontFamily: '"Inter Tight"' }}
                  >
                    {mode.sub}
                  </div>
                </div>
                <div className="mt-1 text-[11.5px] leading-relaxed text-muted">{mode.blurb}</div>
              </div>
              <MerkenIcon name="arrow_forward" size={18} className="mt-1 text-muted" />
            </button>
          ))}
        </div>

        <div
          className={cn(
            'mt-4 flex items-center justify-between border-t pt-3 text-[10.5px] text-muted',
            editorial ? 'border-rule' : 'border-bd',
          )}
          style={{ fontFamily: editorial ? 'Fraunces, serif' : '"Inter Tight"' }}
        >
          <span className={editorial ? 'italic' : undefined}>3 つの面が 1 冊のノートを作ります</span>
          <span className={editorial ? 'italic' : undefined}>⌘ + N</span>
        </div>
      </div>
    </div>
  );
}
