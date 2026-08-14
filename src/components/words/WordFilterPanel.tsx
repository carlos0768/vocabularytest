'use client';

/**
 * 単語一覧 (/words) の絞り込みパネル。
 * デスクトップでは左のサイドカラム、モバイルではボトムシートの中身として
 * 同じコンポーネントを使い回す。状態は親が持ち、ここは表示と入力だけを担う。
 */

import { Icon } from '@/components/ui/Icon';
import {
  FEATURE_LABELS,
  STATUS_LABELS,
  UNCATEGORIZED_BINDER,
  nextTriState,
  toggleValue,
  type CreatedFilter,
  type FavoriteFilter,
  type FeatureKey,
  type RepetitionFilter,
  type ReviewFilter,
  type TriState,
  type VocabularyTypeFilter,
  type WordFilterOption,
  type WordFilterOptions,
  type WordFilterState,
} from '@/lib/words/word-filter';
import type { WordStatus } from '@/types';

const STATUS_KEYS: WordStatus[] = ['new', 'review', 'active', 'mastered'];
const FEATURE_KEYS: FeatureKey[] = [
  'example',
  'pronunciation',
  'morphology',
  'derived',
  'multiMeaning',
  'custom',
  'wrong',
];

const FAVORITE_OPTIONS: Array<{ value: FavoriteFilter; label: string }> = [
  { value: 'any', label: 'すべて' },
  { value: 'only', label: '付きのみ' },
  { value: 'exclude', label: 'なしのみ' },
];

const REVIEW_OPTIONS: Array<{ value: ReviewFilter; label: string }> = [
  { value: 'any', label: 'すべて' },
  { value: 'due', label: '期限ぎれ' },
  { value: 'scheduled', label: '予定あり' },
  { value: 'never', label: '未学習' },
];

const CREATED_OPTIONS: Array<{ value: CreatedFilter; label: string }> = [
  { value: 'any', label: 'すべて' },
  { value: 'today', label: '24時間' },
  { value: 'week', label: '7日' },
  { value: 'month', label: '30日' },
];

const REPETITION_OPTIONS: Array<{ value: RepetitionFilter; label: string }> = [
  { value: 'any', label: 'すべて' },
  { value: 'zero', label: '0回' },
  { value: 'low', label: '1〜2回' },
  { value: 'high', label: '3回〜' },
];

const VOCABULARY_TYPE_OPTIONS: Array<{ value: VocabularyTypeFilter; label: string }> = [
  { value: 'active', label: '発信' },
  { value: 'passive', label: '受信' },
  { value: 'unset', label: '未設定' },
];

function Chip({
  label,
  active,
  count,
  suffix,
  onClick,
}: {
  label: string;
  active: boolean;
  count?: number;
  suffix?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="max-w-full shrink-0 rounded-full px-[11px] py-[6px] text-[11.5px] font-bold leading-none transition-colors"
      style={{
        background: active ? 'var(--solid-ink)' : '#fff',
        color: active ? '#fff' : 'var(--solid-ink)',
        border: `1.5px solid ${active ? 'var(--solid-ink)' : 'var(--color-border)'}`,
      }}
    >
      <span className="inline-flex max-w-full items-center gap-1">
        <span className="min-w-0 truncate">{label}</span>
        {suffix && <span className="font-mono text-[10px] opacity-80">{suffix}</span>}
        {typeof count === 'number' && (
          <span className="font-mono text-[9.5px] tabular-nums opacity-60">{count}</span>
        )}
      </span>
    </button>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-[var(--color-border)] pt-3 first:border-t-0 first:pt-0">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">
          {title}
        </span>
        {hint && <span className="text-[10px] text-[var(--color-muted)]">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-1.5">{children}</div>;
}

/** 選択肢が多い軸 (単語帳・バインダー) は高さを抑えてスクロールさせる。 */
function ScrollableChips({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-h-[132px] overflow-y-auto overflow-x-hidden pr-1">
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

export interface WordFilterPanelProps {
  filter: WordFilterState;
  options: WordFilterOptions;
  onChange: (filter: WordFilterState) => void;
  onClear: () => void;
  activeCount: number;
  /** ボトムシートでは見出しをシート側が持つので、パネル側は出さない。 */
  hideHeader?: boolean;
}

function ClearButton({ onClear, activeCount }: Pick<WordFilterPanelProps, 'onClear' | 'activeCount'>) {
  return (
    <button
      type="button"
      onClick={onClear}
      disabled={activeCount === 0}
      className="rounded-full border-[1.5px] border-[var(--color-border)] bg-white px-3 py-1 text-[11px] font-bold text-[var(--solid-ink)] disabled:opacity-40"
    >
      条件をクリア
    </button>
  );
}

export function WordFilterPanel({
  filter,
  options,
  onChange,
  onClear,
  activeCount,
  hideHeader = false,
}: WordFilterPanelProps) {
  const set = (patch: Partial<WordFilterState>) => onChange({ ...filter, ...patch });

  const renderOptionChips = (
    list: WordFilterOption[],
    selected: string[],
    onToggle: (value: string) => void,
  ) =>
    list.map((option) => (
      <Chip
        key={option.value || UNCATEGORIZED_BINDER}
        label={option.label}
        count={option.count}
        active={selected.includes(option.value)}
        onClick={() => onToggle(option.value)}
      />
    ));

  return (
    <div className="flex flex-col gap-3">
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <span className="font-display text-[13px] font-extrabold text-[var(--solid-ink)]">絞り込み</span>
          <ClearButton onClear={onClear} activeCount={activeCount} />
        </div>
      )}

      <Section title="STATUS" hint="学習度">
        <ChipRow>
          {STATUS_KEYS.map((status) => (
            <Chip
              key={status}
              label={STATUS_LABELS[status]}
              active={filter.statuses.includes(status)}
              onClick={() => set({ statuses: toggleValue(filter.statuses, status) })}
            />
          ))}
        </ChipRow>
      </Section>

      <Section title="BOOKMARK" hint="ブックマーク">
        <ChipRow>
          {FAVORITE_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              active={filter.favorite === option.value}
              onClick={() => set({ favorite: option.value })}
            />
          ))}
        </ChipRow>
      </Section>

      <Section title="REVIEW" hint="復習タイミング">
        <ChipRow>
          {REVIEW_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              active={filter.review === option.value}
              onClick={() => set({ review: option.value })}
            />
          ))}
        </ChipRow>
      </Section>

      <Section title="CORRECT" hint="連続正解回数">
        <ChipRow>
          {REPETITION_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              active={filter.repetition === option.value}
              onClick={() => set({ repetition: option.value })}
            />
          ))}
        </ChipRow>
      </Section>

      <Section title="ADDED" hint="追加した時期">
        <ChipRow>
          {CREATED_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              active={filter.created === option.value}
              onClick={() => set({ created: option.value })}
            />
          ))}
        </ChipRow>
      </Section>

      <Section title="ELEMENTS" hint="タップで あり → なし → 解除">
        <ChipRow>
          {FEATURE_KEYS.map((key) => {
            const state: TriState = filter.features[key] ?? 'off';
            return (
              <Chip
                key={key}
                label={FEATURE_LABELS[key]}
                suffix={state === 'has' ? 'あり' : state === 'none' ? 'なし' : undefined}
                active={state !== 'off'}
                onClick={() =>
                  set({ features: { ...filter.features, [key]: nextTriState(state) } })
                }
              />
            );
          })}
        </ChipRow>
      </Section>

      <Section title="VOCAB TYPE" hint="発信 / 受信">
        <ChipRow>
          {VOCABULARY_TYPE_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              active={filter.vocabularyTypes.includes(option.value)}
              onClick={() => set({ vocabularyTypes: toggleValue(filter.vocabularyTypes, option.value) })}
            />
          ))}
        </ChipRow>
      </Section>

      {options.partOfSpeech.length > 0 && (
        <Section title="PART OF SPEECH" hint="品詞">
          <ScrollableChips>
            {renderOptionChips(options.partOfSpeech, filter.partOfSpeech, (value) =>
              set({ partOfSpeech: toggleValue(filter.partOfSpeech, value) }),
            )}
          </ScrollableChips>
        </Section>
      )}

      {options.cefrLevels.length > 0 && (
        <Section title="CEFR" hint="難易度">
          <ChipRow>
            {renderOptionChips(options.cefrLevels, filter.cefrLevels, (value) =>
              set({ cefrLevels: toggleValue(filter.cefrLevels, value) }),
            )}
          </ChipRow>
        </Section>
      )}

      {options.binders.length > 1 && (
        <Section title="BINDER" hint="バインダー">
          <ScrollableChips>
            {renderOptionChips(options.binders, filter.binders, (value) =>
              set({ binders: toggleValue(filter.binders, value) }),
            )}
          </ScrollableChips>
        </Section>
      )}

      <Section title="WORDBOOK" hint="単語帳">
        {options.projects.length === 0 ? (
          <p className="m-0 text-[11px] text-[var(--color-muted)]">単語帳がありません</p>
        ) : (
          <ScrollableChips>
            {renderOptionChips(options.projects, filter.projectIds, (value) =>
              set({ projectIds: toggleValue(filter.projectIds, value) }),
            )}
          </ScrollableChips>
        )}
      </Section>
    </div>
  );
}

/** モバイル用のボトムシート。中身はデスクトップと同じパネル。 */
export function WordFilterSheet({
  open,
  onClose,
  resultCount,
  ...panelProps
}: WordFilterPanelProps & { open: boolean; onClose: () => void; resultCount: number }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] lg:hidden" style={{ fontFamily: 'var(--font-body)' }}>
      <button
        type="button"
        aria-label="閉じる"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
        style={{ background: 'rgba(26,26,26,0.45)' }}
      />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[86dvh] flex-col rounded-t-2xl border-t-2 border-x-2 border-[var(--solid-ink)] bg-[var(--color-background)]">
        <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
          <span className="font-display text-[15px] font-extrabold text-[var(--solid-ink)]">絞り込み</span>
          <div className="ml-auto flex items-center gap-2">
            <ClearButton onClear={panelProps.onClear} activeCount={panelProps.activeCount} />
            <button
              type="button"
              onClick={onClose}
              aria-label="閉じる"
              className="flex h-8 w-8 items-center justify-center rounded-full border-[1.5px] border-[var(--color-border)] bg-white text-[var(--solid-ink)]"
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3.5">
          <WordFilterPanel {...panelProps} hideHeader />
        </div>

        <div
          className="border-t border-[var(--color-border)] bg-white px-4 pt-3"
          style={{ paddingBottom: 'max(14px, env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-full items-center justify-center rounded-xl border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] text-[13.5px] font-bold text-white"
          >
            {resultCount}語を表示
          </button>
        </div>
      </div>
    </div>
  );
}
