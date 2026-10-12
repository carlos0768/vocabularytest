'use client';

import { useState, useEffect, useRef } from 'react';
import { Button, Icon } from '@/components/ui';
const PART_OF_SPEECH_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: '(自動で判定)' },
  { value: 'noun', label: '名詞 (noun)' },
  { value: 'verb', label: '動詞 (verb)' },
  { value: 'adjective', label: '形容詞 (adjective)' },
  { value: 'adverb', label: '副詞 (adverb)' },
  { value: 'idiom', label: '熟語 (idiom)' },
  { value: 'phrasal_verb', label: '句動詞 (phrasal verb)' },
  { value: 'preposition', label: '前置詞 (preposition)' },
  { value: 'conjunction', label: '接続詞 (conjunction)' },
  { value: 'pronoun', label: '代名詞 (pronoun)' },
  { value: 'interjection', label: '感動詞 (interjection)' },
  { value: 'other', label: 'その他 (other)' },
];

export function ManualWordInputModal({
  isOpen,
  onClose,
  onConfirm,
  isLoading,
  loadingMessage,
  english,
  setEnglish,
  japanese,
  setJapanese,
  partOfSpeech,
  setPartOfSpeech,
  exampleSentence,
  setExampleSentence,
  morphologyEnabled,
  setMorphologyEnabled,
  exampleEnabled,
  setExampleEnabled,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isLoading: boolean;
  loadingMessage?: string;
  english: string;
  setEnglish: (value: string) => void;
  japanese: string;
  setJapanese: (value: string) => void;
  partOfSpeech: string;
  setPartOfSpeech: (value: string) => void;
  exampleSentence: string;
  setExampleSentence: (value: string) => void;
  /** 語源解析トグル（未指定なら非表示 = 従来挙動） */
  morphologyEnabled?: boolean;
  setMorphologyEnabled?: (enabled: boolean) => void;
  /** 例文生成トグル（未指定なら非表示 = 従来挙動）。手動追加は無料。 */
  exampleEnabled?: boolean;
  setExampleEnabled?: (enabled: boolean) => void;
}) {
  const englishInputRef = useRef<HTMLInputElement>(null);
  const [showOptional, setShowOptional] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => englishInputRef.current?.focus(), 100);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowOptional(false);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (english.trim() && japanese.trim()) {
      onConfirm();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end sm:justify-center sm:items-center bg-black/50 p-0 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="閉じる"
        onClick={onClose}
        disabled={isLoading}
      />
      <div
        className="relative w-full max-w-lg bg-[var(--color-background)] rounded-t-3xl sm:rounded-3xl shadow-xl max-h-[min(90vh,640px)] flex flex-col animate-fade-in-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pt-2.5 pb-1 flex justify-center">
          <span className="h-1 w-10 rounded-full bg-[var(--color-border)]" />
        </div>
        <div className="flex items-center justify-between px-5 pt-1 pb-3 border-b border-[var(--color-border-light)]">
          <span className="w-10" />
          <h2 className="text-base font-bold text-[var(--color-foreground)]">単語を手で入力</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="w-10 h-10 rounded-full bg-[var(--color-surface-secondary)] flex items-center justify-center text-[var(--color-foreground)] disabled:opacity-40"
            aria-label="閉じる"
          >
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 py-5">
          <p className="text-xs text-center text-[var(--color-muted)] mb-4">
            品詞・例文・発音記号はAIが自動で補完します
          </p>
          <form onSubmit={handleSubmit}>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-[var(--color-muted)] mb-1.5">
                  英単語
                </label>
                <input
                  ref={englishInputRef}
                  type="text"
                  value={english}
                  onChange={(e) => setEnglish(e.target.value)}
                  placeholder="例: beautiful"
                  className="w-full px-4 py-3 border border-[var(--color-border)] rounded-[var(--radius-lg)] text-base bg-[var(--color-surface)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                  disabled={isLoading}
                  maxLength={50}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[var(--color-muted)] mb-1.5">
                  日本語訳
                </label>
                <input
                  type="text"
                  value={japanese}
                  onChange={(e) => setJapanese(e.target.value)}
                  placeholder="例: 美しい"
                  className="w-full px-4 py-3 border border-[var(--color-border)] rounded-[var(--radius-lg)] text-base bg-[var(--color-surface)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                  disabled={isLoading}
                  maxLength={100}
                />
              </div>

              {morphologyEnabled !== undefined && setMorphologyEnabled && (
                <button
                  type="button"
                  onClick={() => setMorphologyEnabled(!morphologyEnabled)}
                  disabled={isLoading}
                  className="w-full flex items-start gap-2.5 px-4 py-3 border rounded-[var(--radius-lg)] bg-[var(--color-surface)] text-left transition-colors disabled:opacity-60"
                  style={{
                    borderColor: morphologyEnabled ? 'var(--color-primary)' : 'var(--color-border)',
                  }}
                >
                  <span
                    className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                    style={{
                      border: `1.25px solid ${morphologyEnabled ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      background: morphologyEnabled ? 'var(--color-primary)' : 'transparent',
                    }}
                  >
                    {morphologyEnabled && <Icon name="check" size={11} className="text-white" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--color-foreground)]">
                      語源解析
                      <span className="shrink-0 text-[10px] font-bold text-[var(--color-primary)]">+1コイン/語</span>
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
                      接頭語・接尾語・接中語と語根の成り立ちを解説
                    </span>
                  </span>
                </button>
              )}

              {exampleEnabled !== undefined && setExampleEnabled && (
                <button
                  type="button"
                  onClick={() => setExampleEnabled(!exampleEnabled)}
                  disabled={isLoading}
                  className="w-full flex items-start gap-2.5 px-4 py-3 border rounded-[var(--radius-lg)] bg-[var(--color-surface)] text-left transition-colors disabled:opacity-60"
                  style={{
                    borderColor: exampleEnabled ? 'var(--color-primary)' : 'var(--color-border)',
                  }}
                >
                  <span
                    className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                    style={{
                      border: `1.25px solid ${exampleEnabled ? 'var(--color-primary)' : 'var(--color-border)'}`,
                      background: exampleEnabled ? 'var(--color-primary)' : 'transparent',
                    }}
                  >
                    {exampleEnabled && <Icon name="check" size={11} className="text-white" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-[var(--color-foreground)]">
                      例文生成
                    </span>
                    <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
                      この単語を使った例文と訳を自動生成（コイン消費なし）
                    </span>
                  </span>
                </button>
              )}


              <button
                type="button"
                onClick={() => setShowOptional((v) => !v)}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-1 text-xs font-medium text-[var(--color-primary)] hover:underline py-1 disabled:opacity-60"
              >
                <Icon name={showOptional ? 'expand_less' : 'expand_more'} size={16} />
                {showOptional ? '詳細を閉じる' : '詳細を入力 (任意)'}
              </button>

              {showOptional && (
                <div className="space-y-3 animate-fade-in-up">
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-muted)] mb-1.5">
                      品詞 <span className="text-[var(--color-muted)] font-normal">(任意・未入力なら自動補完)</span>
                    </label>
                    <select
                      value={partOfSpeech}
                      onChange={(e) => setPartOfSpeech(e.target.value)}
                      disabled={isLoading}
                      className="w-full px-4 py-3 border border-[var(--color-border)] rounded-[var(--radius-lg)] text-base bg-[var(--color-surface)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                    >
                      {PART_OF_SPEECH_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-[var(--color-muted)] mb-1.5">
                      例文 <span className="text-[var(--color-muted)] font-normal">(任意・未入力なら自動補完)</span>
                    </label>
                    <textarea
                      value={exampleSentence}
                      onChange={(e) => setExampleSentence(e.target.value)}
                      placeholder="例: She has a beautiful voice."
                      rows={2}
                      className="w-full px-4 py-3 border border-[var(--color-border)] rounded-[var(--radius-lg)] text-sm bg-[var(--color-surface)] focus:outline-none focus:border-[var(--color-primary)] transition-colors resize-none"
                      disabled={isLoading}
                      maxLength={500}
                    />
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-3 mt-4">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={isLoading}
                className="flex-1"
              >
                キャンセル
              </Button>
              <Button
                type="submit"
                disabled={!english.trim() || !japanese.trim() || isLoading}
                className="flex-1"
              >
                {isLoading ? (loadingMessage ?? '保存中...') : '保存'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
