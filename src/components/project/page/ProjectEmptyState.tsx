'use client';

// 単語帳ページ (`/project/[id]`) の空の単語帳の案内とおすすめ単語。
import type { Word } from '@/types';
import { Icon } from '@/components/ui/Icon';
import { thumbColor } from '@/lib/ui/thumb-color';
import { posShort } from '@/components/project/WordRow';
import { TranslationDisplay } from '@/components/word/TranslationDisplay';

// A word suggested for an empty wordbook, picked from the user's other books.
export type RecommendedWordSuggestion = {
  word: Word;
  sourceProjectTitle: string;
};

export function EmptyWordbookState({
  isPro,
  onScan,
  onManualAdd,
  onVoiceAdd,
}: {
  isPro: boolean;
  onScan: () => void;
  onManualAdd: () => void;
  onVoiceAdd?: () => void;
}) {
  // Free users get manual entry first (scanning is Pro-only);
  // Pro users get scan as the recommended first action.
  const actions: {
    key: string;
    icon: string;
    label: string;
    hint: string;
    primary?: boolean;
    pro?: boolean;
    onClick: () => void;
  }[] = isPro
    ? [
        { key: 'scan', icon: 'photo_camera', label: 'スキャンで追加', hint: '写真から自動で単語を抽出', primary: true, onClick: onScan },
        { key: 'manual', icon: 'edit', label: '手で入力', hint: '続けて何語でも入力できます', onClick: onManualAdd },
      ]
    : [
        { key: 'manual', icon: 'edit', label: '手で入力', hint: '続けて何語でも入力できます', primary: true, onClick: onManualAdd },
        { key: 'scan', icon: 'photo_camera', label: 'スキャンで追加', hint: '写真から自動抽出（Pro限定）', pro: true, onClick: onScan },
      ];
  if (onVoiceAdd) {
    // 手入力のすぐ後ろに置く (どちらも無料で使える追加方法)。
    const manualIndex = actions.findIndex((action) => action.key === 'manual');
    actions.splice(manualIndex + 1, 0, {
      key: 'voice', icon: 'mic', label: '音声で追加', hint: '読み上げた単語をまとめて追加', onClick: onVoiceAdd,
    });
  }

  return (
    <div
      className="rounded-[14px] border-2 border-dashed border-[var(--solid-ink)] bg-[var(--color-surface)] px-5 py-7 text-center"
      style={{ background: 'color-mix(in srgb, var(--solid-ink) 2%, transparent)' }}
    >
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-accent-light)]">
        <Icon name="menu_book" size={20} className="text-[var(--color-accent-ink)]" />
      </div>
      <div className="mt-3 font-display text-[16px] font-extrabold text-[var(--solid-ink)]">
        まだ単語がありません
      </div>
      <p className="mt-1.5 text-[12px] leading-[1.6] text-[var(--color-muted)]">
        単語を追加すると、クイズやカードで学習を始められます。
      </p>
      <div className="mt-4 flex flex-col gap-2.5 text-left">
        {actions.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={action.onClick}
            className="flex items-center gap-3 rounded-[12px] border-2 px-3.5 py-3 transition-all duration-100 active:translate-x-px active:translate-y-px"
            style={{
              borderColor: 'var(--solid-ink)',
              background: action.primary ? 'var(--color-accent)' : 'var(--color-surface)',
              boxShadow: '2px 2px 0 var(--solid-ink)',
            }}
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px]"
              style={{
                background: action.primary ? 'rgba(255,255,255,0.18)' : 'var(--color-surface-secondary)',
                color: action.primary ? 'var(--color-on-accent)' : 'var(--solid-ink)',
              }}
            >
              <Icon name={action.icon} size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span
                className="flex items-center gap-1.5 text-[13.5px] font-bold"
                style={{ color: action.primary ? 'var(--color-on-accent)' : 'var(--solid-ink)' }}
              >
                {action.label}
                {action.pro && (
                  <span className="rounded-[3px] border border-[var(--solid-ink)] bg-[var(--color-surface)] px-[5px] py-[1px] font-mono text-[8px] font-bold tracking-[0.04em] text-[var(--color-accent)]">
                    PRO
                  </span>
                )}
              </span>
              <span
                className="mt-0.5 block text-[10.5px] font-medium"
                style={{ color: action.primary ? 'rgba(255,255,255,0.8)' : 'var(--color-muted)' }}
              >
                {action.hint}
              </span>
            </span>
            <Icon
              name="chevron_right"
              size={16}
              style={{ color: action.primary ? 'var(--color-on-accent)' : 'var(--color-muted)' }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

export function RecommendedWordsSection({
  suggestions,
  addingIds,
  onAdd,
}: {
  suggestions: RecommendedWordSuggestion[];
  addingIds: Set<string>;
  onAdd: (suggestion: RecommendedWordSuggestion) => void;
}) {
  return (
    <section className="mt-7 px-1">
      <div className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
        PICKED FOR YOU
      </div>
      <h2 className="mt-0.5 font-display text-[18px] font-extrabold text-[var(--solid-ink)]">
        おすすめの単語
      </h2>
      <p className="mt-0.5 text-[11px] leading-[1.5] text-[var(--color-muted)]">
        あなたの他の単語帳からピックアップしました
      </p>
      <div className="mt-2 divide-y divide-[var(--color-border)]">
        {suggestions.map((suggestion) => {
          const { word } = suggestion;
          const adding = addingIds.has(word.id);
          const pos = word.partOfSpeechTags?.[0] ?? null;
          return (
            <div key={word.id} className="flex items-stretch gap-2.5 py-2.5">
              <div
                className="flex h-10 w-10 shrink-0 self-center items-center justify-center rounded-[9px] border-2 border-[var(--solid-ink)] font-display text-[16px] font-extrabold text-white"
                style={{ backgroundColor: thumbColor(word.id) }}
              >
                {word.english.charAt(0).toUpperCase()}
              </div>
              {/* 一覧と同じく、訳は英語の下ではなく右のカラムに仕切りを挟んで並べる。
                  仕切りは行の上下いっぱい (py-2.5 の外) まで貫通させる。
                  出典の単語帳名だけは訳と横に並べると潰れるので、右カラムの下に置く */}
              <div className="flex min-w-0 flex-1 items-stretch gap-2">
                <div className="flex min-w-0 shrink-0 basis-[46%] items-center">
                  <span className="truncate font-display text-[15px] font-bold text-[var(--solid-ink)]">
                    {word.english}
                  </span>
                </div>
                <span aria-hidden className="-my-2.5 w-px shrink-0 self-stretch bg-[var(--color-border)]" />
                <div className="flex min-w-0 flex-1 flex-col justify-center">
                  <div className="flex min-w-0 items-baseline gap-1 text-[11px] text-[var(--color-muted)]">
                    {pos && <span className="shrink-0 font-mono text-[9px]">{posShort(pos)}</span>}
                    <span className="block min-w-0">
                      <TranslationDisplay word={word} compact stacked maxLines={1} />
                    </span>
                  </div>
                  <div className="mt-px truncate text-[11px] text-[var(--color-muted)]">
                    {suggestion.sourceProjectTitle}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onAdd(suggestion)}
                disabled={adding}
                aria-label={`「${word.english}」をこの単語帳に追加`}
                className="flex h-8 w-8 shrink-0 self-center items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-50"
              >
                <Icon
                  name={adding ? 'progress_activity' : 'add'}
                  size={16}
                  className={adding ? 'animate-spin' : undefined}
                />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
