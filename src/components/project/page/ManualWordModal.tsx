'use client';

// 単語帳ページ (`/project/[id]`) の手入力で単語を追加するモーダル。
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { MANUAL_TRANSLATION_INPUT_LIMIT } from '@/lib/words/manual-translations';
import { SectionChipPicker } from '@/components/project/page/SectionControls';

export function ManualWordModal({
  open,
  loading,
  loadingMessage,
  addedCount,
  english,
  translations,
  partOfSpeech,
  exampleSentence,
  morphologyEnabled,
  exampleEnabled,
  setExampleEnabled,
  onEnglishChange,
  onTranslationsChange,
  onPartOfSpeechChange,
  onExampleSentenceChange,
  onMorphologyEnabledChange,
  sectionNames,
  sectionName,
  onSectionNameChange,
  onCreateSection,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  loading: boolean;
  loadingMessage?: string;
  addedCount: number;
  english: string;
  /** 日本語訳の欄 (1欄 = 1訳)。少なくとも1欄ある。 */
  translations: string[];
  partOfSpeech: string;
  exampleSentence: string;
  morphologyEnabled: boolean;
  /** 例文生成トグル。手動追加は無料なのでコインバッジは付けない。 */
  exampleEnabled: boolean;
  setExampleEnabled: (enabled: boolean) => void;
  onEnglishChange: (value: string) => void;
  onTranslationsChange: (values: string[]) => void;
  onPartOfSpeechChange: (value: string) => void;
  onExampleSentenceChange: (value: string) => void;
  onMorphologyEnabledChange: (enabled: boolean) => void;
  /** 単語帳のセクション (表示順)。追加する語の入り先を選ぶ。 */
  sectionNames: string[];
  /** 追加する語の入り先。null は未分類。 */
  sectionName: string | null;
  onSectionNameChange: (name: string | null) => void;
  onCreateSection: (name: string) => Promise<boolean>;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [showOptional, setShowOptional] = useState(false);
  const englishInputRef = useRef<HTMLInputElement>(null);
  const translationInputRefs = useRef<(HTMLInputElement | null)[]>([]);
  // 「＋ 訳を追加」で増やした欄にフォーカスを移すための印
  const focusTranslationIndexRef = useRef<number | null>(null);
  const wasLoadingRef = useRef(loading);

  useEffect(() => {
    const index = focusTranslationIndexRef.current;
    if (index === null) return;
    focusTranslationIndexRef.current = null;
    translationInputRefs.current[index]?.focus();
  }, [translations.length]);

  // After each save the form clears and stays open for the next word —
  // refocus the english field so batch entry flows without extra taps.
  useEffect(() => {
    if (wasLoadingRef.current && !loading && open) {
      englishInputRef.current?.focus();
    }
    wasLoadingRef.current = loading;
  }, [loading, open]);

  if (!open) return null;
  // 日本語訳は任意（未入力ならマスター/AI が補完する）。英単語だけ必須。
  const canSubmit = english.trim().length > 0 && !loading;

  return (
    <div className="fixed inset-0 z-[100]" style={{ fontFamily: 'var(--font-body)' }}>
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="閉じる"
        onClick={() => { if (!loading) onCancel(); }}
        style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
      />
      <div className="absolute inset-0 flex items-center justify-center px-5">
        <div
          className="w-full max-w-[400px] rounded-[16px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] p-5"


        >
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
            ADD WORD
          </div>
          <h2 className="mt-1 font-display text-[18px] font-extrabold text-[var(--solid-ink)]">
            単語を追加
          </h2>
          <p className="mt-1 text-[11px] leading-[1.5] text-[var(--color-muted)]">
            続けて何語でも入力できます。日本語訳・品詞・例文・発音記号は未入力でも AI が自動で補完します。
          </p>
          {addedCount > 0 && (
            <div className="mt-2 inline-flex items-center gap-1 rounded-full border border-[var(--solid-ink)] bg-[var(--color-accent-light)] px-2.5 py-1 font-mono text-[10px] font-bold text-[var(--color-accent-ink)]">
              <Icon name="check" size={11} />
              {addedCount}語追加済み
            </div>
          )}

          <div className="mt-4 space-y-3">
            <div>
              <div className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
                セクション
              </div>
              <SectionChipPicker
                sectionNames={sectionNames}
                value={sectionName}
                disabled={loading}
                onChange={onSectionNameChange}
                onCreate={onCreateSection}
              />
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
                英単語
              </label>
              <input
                ref={englishInputRef}
                type="text"
                value={english}
                onChange={(e) => onEnglishChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) onConfirm(); }}
                placeholder="例: beautiful"
                disabled={loading}
                maxLength={50}
                autoFocus
                className="w-full rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-2.5 font-display text-[15px] font-bold text-[var(--solid-ink)] outline-none disabled:opacity-60"
              />
            </div>
            <div>
              <label className="mb-1 block font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
                日本語訳（任意・複数可）
              </label>
              <div className="space-y-2">
                {translations.map((translation, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <input
                      ref={(el) => { translationInputRefs.current[index] = el; }}
                      type="text"
                      value={translation}
                      onChange={(e) => {
                        const next = [...translations];
                        next[index] = e.target.value;
                        onTranslationsChange(next);
                      }}
                      onKeyDown={(e) => { if (e.key === 'Enter' && canSubmit) onConfirm(); }}
                      placeholder={index === 0 ? '例: 美しい（未入力なら自動補完）' : `訳${index + 1}`}
                      aria-label={`日本語訳${index + 1}`}
                      disabled={loading}
                      maxLength={100}
                      className="min-w-0 flex-1 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-2.5 font-display text-[15px] font-bold text-[var(--solid-ink)] outline-none disabled:opacity-60"
                    />
                    {translations.length > 1 && (
                      <button
                        type="button"
                        onClick={() => onTranslationsChange(translations.filter((_, i) => i !== index))}
                        disabled={loading}
                        aria-label={`日本語訳${index + 1}を削除`}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[var(--color-border)] text-[var(--color-muted)] transition-colors hover:border-[var(--solid-ink)] hover:text-[var(--solid-ink)] disabled:opacity-50"
                      >
                        <Icon name="close" size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {translations.length < MANUAL_TRANSLATION_INPUT_LIMIT && (
                <button
                  type="button"
                  onClick={() => {
                    focusTranslationIndexRef.current = translations.length;
                    onTranslationsChange([...translations, '']);
                  }}
                  disabled={loading}
                  className="mt-2 flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)] transition-colors hover:text-[var(--solid-ink)] disabled:opacity-50"
                >
                  <Icon name="add" size={12} />
                  訳を追加
                </button>
              )}
            </div>

            {/* 語源解析トグル（スキャンパネルと同じチェックカード型） */}
            <button
              type="button"
              onClick={() => onMorphologyEnabledChange(!morphologyEnabled)}
              disabled={loading}
              className="flex w-full items-start gap-2 rounded-[10px] border-2 bg-[var(--color-surface)] px-3 py-2.5 text-left transition-all disabled:opacity-60"
              style={{
                borderColor: morphologyEnabled ? 'var(--solid-ink)' : 'var(--color-border)',
                boxShadow: morphologyEnabled ? '2px 2px 0 var(--solid-ink)' : 'none',
              }}
            >
              <span
                className="mt-[1px] inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                style={{
                  border: `1.25px solid ${morphologyEnabled ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  background: morphologyEnabled ? 'var(--color-accent)' : 'var(--color-surface)',
                }}
              >
                {morphologyEnabled && <Icon name="check" size={11} className="text-white" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-[12px] font-bold text-[var(--solid-ink)]">
                  <span className="truncate">語源解析</span>
                  <span className="shrink-0 font-mono text-[8px] font-bold tracking-[0.04em] text-[var(--color-accent)]">
                    +1コイン/語
                  </span>
                </span>
                <span className="mt-0.5 block text-[10px] font-medium text-[var(--color-muted)]">
                  接頭語・接尾語・接中語と語根の成り立ちを解説
                </span>
              </span>
            </button>

            {/* 例文生成トグル（手動追加はコイン消費なし） */}
            <button
              type="button"
              onClick={() => setExampleEnabled(!exampleEnabled)}
              disabled={loading}
              className="flex w-full items-start gap-2 rounded-[10px] border-2 bg-[var(--color-surface)] px-3 py-2.5 text-left transition-all disabled:opacity-60"
              style={{
                borderColor: exampleEnabled ? 'var(--solid-ink)' : 'var(--color-border)',
                boxShadow: exampleEnabled ? '2px 2px 0 var(--solid-ink)' : 'none',
              }}
            >
              <span
                className="mt-[1px] inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                style={{
                  border: `1.25px solid ${exampleEnabled ? 'var(--color-accent)' : 'var(--color-border)'}`,
                  background: exampleEnabled ? 'var(--color-accent)' : 'var(--color-surface)',
                }}
              >
                {exampleEnabled && <Icon name="check" size={11} className="text-white" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-bold text-[var(--solid-ink)]">
                  例文生成
                </span>
                <span className="mt-0.5 block text-[10px] font-medium text-[var(--color-muted)]">
                  この単語を使った例文と訳を自動生成（コイン消費なし）
                </span>
              </span>
            </button>


            <button
              type="button"
              onClick={() => setShowOptional((v) => !v)}
              className="flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)] transition-colors hover:text-[var(--solid-ink)]"
            >
              <Icon name={showOptional ? 'expand_less' : 'expand_more'} size={12} />
              詳細を入力する（任意）
            </button>

            {showOptional && (
              <div className="space-y-3 border-t border-[var(--color-border)] pt-3">
                <div>
                  <label className="mb-1 block font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
                    品詞（任意）
                  </label>
                  <input
                    type="text"
                    value={partOfSpeech}
                    onChange={(e) => onPartOfSpeechChange(e.target.value)}
                    placeholder="例: noun / verb / adjective"
                    disabled={loading}
                    className="w-full rounded-[10px] border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[12px] text-[var(--solid-ink)] outline-none focus:border-[var(--solid-ink)] disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
                    例文（任意）
                  </label>
                  <input
                    type="text"
                    value={exampleSentence}
                    onChange={(e) => onExampleSentenceChange(e.target.value)}
                    placeholder="例: She is beautiful."
                    disabled={loading}
                    className="w-full rounded-[10px] border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[12px] text-[var(--solid-ink)] outline-none focus:border-[var(--solid-ink)] disabled:opacity-60"
                  />
                </div>
              </div>
            )}
          </div>

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-2.5 text-[13px] font-bold text-[var(--solid-ink)] disabled:opacity-50"
            >
              {addedCount > 0 ? '完了' : 'キャンセル'}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!canSubmit}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-3 py-2.5 text-[13px] font-bold text-[var(--color-on-ink)] disabled:opacity-50"
            >
              {loading && <Icon name="progress_activity" size={14} className="animate-spin" />}
              {loading ? (loadingMessage ?? '保存中...') : '追加して次へ'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
