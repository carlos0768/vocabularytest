'use client';

import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { Button, Icon } from '@/components/ui';
import { processProjectIconFile } from '@/lib/image-utils';

export function ProjectNameModal({
  isOpen,
  onClose,
  onConfirm,
  scanStatus,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (name: string, iconImage?: string) => void;
  /** 'uploading' while background scan is being created, 'done' when finished, undefined for default form */
  scanStatus?: 'uploading' | 'done' | 'error';
}) {
  const [name, setName] = useState('');
  const [iconImage, setIconImage] = useState<string | null>(null);
  const [iconError, setIconError] = useState<string | null>(null);
  const [iconProcessing, setIconProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && !scanStatus) {
      setName('');
      setIconImage(null);
      setIconError(null);
      setIconProcessing(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, scanStatus]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (trimmedName) {
      onConfirm(trimmedName, iconImage ?? undefined);
    }
  };

  const handleIconFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setIconProcessing(true);
    setIconError(null);
    try {
      const processed = await processProjectIconFile(file);
      setIconImage(processed);
    } catch (error) {
      const message = error instanceof Error ? error.message : '画像の読み込みに失敗しました';
      setIconError(message);
    } finally {
      setIconProcessing(false);
    }
  };

  if (!isOpen) return null;

  // Show scan status screen instead of form
  if (scanStatus === 'uploading' || scanStatus === 'done') {
    return (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="card p-6 w-full max-w-sm animate-fade-in-up text-center">
          {scanStatus === 'uploading' ? (
            <>
              <div className="mx-auto w-14 h-14 rounded-full bg-[var(--color-primary-light)] flex items-center justify-center mb-4">
                <Icon name="progress_activity" size={28} className="text-[var(--color-primary)] animate-spin" />
              </div>
              <h2 className="text-lg font-bold text-[var(--color-foreground)]">
                アップロード中...
              </h2>
              <p className="text-sm text-[var(--color-muted)] mt-2">
                画像をサーバーに送信しています
              </p>
            </>
          ) : (
            <>
              <div className="mx-auto w-14 h-14 rounded-full bg-[var(--color-success-light)] flex items-center justify-center mb-4">
                <Icon name="check_circle" size={28} className="text-[var(--color-success)]" />
              </div>
              <h2 className="text-lg font-bold text-[var(--color-foreground)]">
                スキャンを開始しました
              </h2>
              <p className="text-sm text-[var(--color-muted)] mt-2">
                バックグラウンドで処理中です。完了したら通知でお知らせします。
              </p>
              <Button onClick={onClose} className="mt-5 w-full">
                閉じる
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card p-6 w-full max-w-sm animate-fade-in-up">
        <h2 className="text-lg font-bold mb-4 text-center text-[var(--color-foreground)]">
          単語帳の名前
        </h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-[var(--color-muted)] mb-2">
              アイコン画像
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => iconInputRef.current?.click()}
                disabled={iconProcessing}
                className="w-16 h-16 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] overflow-hidden flex items-center justify-center hover:border-[var(--color-primary)] transition-colors disabled:opacity-60"
              >
                {iconImage ? (
                  <span
                    className="w-full h-full bg-center bg-cover"
                    style={{ backgroundImage: `url(${iconImage})` }}
                  />
                ) : (
                  <Icon name="image" size={24} className="text-[var(--color-muted)]" />
                )}
              </button>
              <div className="flex-1 min-w-0 space-y-1">
                <button
                  type="button"
                  onClick={() => iconInputRef.current?.click()}
                  disabled={iconProcessing}
                  className="text-sm font-semibold text-[var(--color-primary)] hover:underline disabled:opacity-60"
                >
                  {iconImage ? '画像を変更' : '画像を選択'}
                </button>
                {iconImage && (
                  <button
                    type="button"
                    onClick={() => {
                      setIconImage(null);
                      setIconError(null);
                    }}
                    disabled={iconProcessing}
                    className="block text-xs text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
                  >
                    画像を削除
                  </button>
                )}
                <p className="text-xs text-[var(--color-muted)]">
                  正方形で表示されます
                </p>
              </div>
            </div>
            {iconError && (
              <p className="mt-2 text-xs text-[var(--color-error)]">{iconError}</p>
            )}
            <input
              ref={iconInputRef}
              type="file"
              accept="image/*,.heic,.heif"
              onChange={handleIconFileChange}
              className="hidden"
            />
          </div>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例: 英語テスト対策"
            className="w-full px-4 py-3 border border-[var(--color-border)] rounded-[var(--radius-lg)] text-base bg-[var(--color-surface)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
            maxLength={50}
          />
          <div className="flex gap-3 mt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              className="flex-1"
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || iconProcessing}
              className="flex-1"
            >
              {iconProcessing ? '画像処理中...' : '次へ'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function EditProjectNameModal({
  isOpen,
  onClose,
  onConfirm,
  currentName,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (newName: string) => void;
  currentName: string;
}) {
  const [name, setName] = useState(currentName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(currentName);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, currentName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && name !== currentName) {
      onConfirm(name.trim());
    } else if (name === currentName) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
      <div className="card p-6 w-full max-w-sm animate-fade-in-up">
        <h2 className="text-lg font-bold mb-4 text-center text-[var(--color-foreground)]">
          単語帳の名前を変更
        </h2>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="単語帳の名前"
            className="w-full px-4 py-3 border border-[var(--color-border)] rounded-[var(--radius-lg)] text-base bg-[var(--color-surface)] focus:outline-none focus:border-[var(--color-primary)] transition-colors"
            maxLength={50}
          />
          <div className="flex gap-3 mt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              className="flex-1"
            >
              キャンセル
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || name === currentName}
              className="flex-1"
            >
              変更
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

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
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="card p-6 w-full max-w-sm animate-fade-in-up max-h-[90vh] overflow-y-auto">
        <h2 className="text-lg font-bold mb-1 text-center text-[var(--color-foreground)]">
          単語を手で入力
        </h2>
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
  );
}
