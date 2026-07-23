'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { GRAMMAR_CHOICE_LABELS } from '@/components/desktop/DesktopGrammar';

/**
 * 語法問題の手動作成フォーム (モバイル/デスクトップ共用のフローティングモーダル)。
 * ChatGPT連携を使わなくても問題集に問題を追加できるようにする。
 * 送信先は既存の Pro ゲート付き POST /api/chatgpt/grammar-questions。
 */
export function GrammarQuestionFormModal({
  open,
  bookId,
  onClose,
  onCreated,
}: {
  open: boolean;
  bookId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [sentence, setSentence] = useState('');
  const [choices, setChoices] = useState(['', '', '', '']);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [explanation, setExplanation] = useState('');
  const [grammarPoint, setGrammarPoint] = useState('');
  const [sentenceJa, setSentenceJa] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const resetForm = () => {
    setSentence('');
    setChoices(['', '', '', '']);
    setCorrectIndex(0);
    setExplanation('');
    setGrammarPoint('');
    setSentenceJa('');
    setError(null);
  };

  const handleSubmit = async () => {
    if (saving) return;
    if (!sentence.includes('___')) {
      setError('問題文には空欄マーカー ___ (アンダースコア3つ) を含めてください');
      return;
    }
    if (choices.some((choice) => !choice.trim())) {
      setError('選択肢を4つすべて入力してください');
      return;
    }
    if (!explanation.trim()) {
      setError('解説を入力してください');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/chatgpt/grammar-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookId,
          questions: [
            {
              sentence: sentence.trim(),
              choices: choices.map((choice) => choice.trim()),
              correctIndex,
              explanation: explanation.trim(),
              ...(grammarPoint.trim() ? { grammarPoint: grammarPoint.trim() } : {}),
              ...(sentenceJa.trim() ? { sentenceJa: sentenceJa.trim() } : {}),
            },
          ],
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!response.ok || !payload.success) {
        setError(payload.error || '問題の追加に失敗しました');
        return;
      }
      resetForm();
      onCreated();
    } catch {
      setError('通信に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    'w-full rounded-[10px] border-2 border-[var(--solid-ink)] bg-white px-3 py-2 text-[13px] text-[var(--solid-ink)] outline-none';
  const labelClass = 'mb-1 block font-mono text-[10px] font-bold tracking-[0.06em] text-[var(--color-muted)]';

  return (
    <div className="fixed inset-0 z-[90]" style={{ fontFamily: 'var(--font-body)' }}>
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
        onClick={() => { if (!saving) onClose(); }}
      />
      <div className="absolute inset-0 flex items-center justify-center px-4 py-8">
        <div
          className="w-full overflow-y-auto overscroll-contain rounded-[20px] border-2 border-[var(--solid-ink)] bg-white"
          style={{ maxWidth: 520, maxHeight: '86dvh' }}
        >
          <div className="sticky top-0 z-[2] flex items-center justify-between border-b border-[var(--color-border)] bg-white px-4 py-3">
            <span className="font-mono text-[10.5px] font-bold tracking-[0.06em] text-[var(--color-muted)]">
              問題を手動で追加
            </span>
            <button
              type="button"
              onClick={() => { if (!saving) onClose(); }}
              aria-label="閉じる"
              className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-[var(--color-border)] bg-white text-[var(--color-secondary-text)]"
            >
              <Icon name="close" size={16} />
            </button>
          </div>

          <div className="flex flex-col gap-3.5 p-5">
            <div>
              <label className={labelClass}>問題文 (空欄は ___ )</label>
              <textarea
                value={sentence}
                onChange={(e) => setSentence(e.target.value)}
                rows={2}
                placeholder="He suggested that she ___ a doctor."
                className={`${inputClass} resize-y leading-[1.7]`}
              />
            </div>

            <div>
              <label className={labelClass}>選択肢 (正解をタップで選択)</label>
              <div className="flex flex-col gap-2">
                {choices.map((choice, choiceIndex) => (
                  <div key={choiceIndex} className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setCorrectIndex(choiceIndex)}
                      aria-label={`${GRAMMAR_CHOICE_LABELS[choiceIndex]} を正解にする`}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 font-mono text-[12px] font-bold transition-all"
                      style={{
                        borderColor: correctIndex === choiceIndex ? 'var(--color-accent)' : 'var(--color-border)',
                        background: correctIndex === choiceIndex ? 'var(--color-accent)' : '#fff',
                        color: correctIndex === choiceIndex ? '#fff' : 'var(--color-muted)',
                      }}
                    >
                      {GRAMMAR_CHOICE_LABELS[choiceIndex]}
                    </button>
                    <input
                      value={choice}
                      onChange={(e) => {
                        const next = [...choices];
                        next[choiceIndex] = e.target.value;
                        setChoices(next);
                      }}
                      placeholder={`選択肢 ${GRAMMAR_CHOICE_LABELS[choiceIndex]}`}
                      className={inputClass}
                    />
                  </div>
                ))}
              </div>
              <p className="m-0 mt-1.5 text-[10.5px] text-[var(--color-muted)]">
                正解: {GRAMMAR_CHOICE_LABELS[correctIndex]}
              </p>
            </div>

            <div>
              <label className={labelClass}>解説</label>
              <textarea
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
                rows={3}
                placeholder="suggest that S (should) do の仮定法現在。..."
                className={`${inputClass} resize-y leading-[1.7]`}
              />
            </div>

            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
              <div>
                <label className={labelClass}>文法項目 (任意)</label>
                <input
                  value={grammarPoint}
                  onChange={(e) => setGrammarPoint(e.target.value)}
                  placeholder="仮定法現在"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>和訳 (任意)</label>
                <input
                  value={sentenceJa}
                  onChange={(e) => setSentenceJa(e.target.value)}
                  placeholder="彼は彼女に医者に診てもらうよう勧めた。"
                  className={inputClass}
                />
              </div>
            </div>

            {error && (
              <p className="m-0 text-[12px] font-bold text-[var(--color-error,#d33)]">{error}</p>
            )}

            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={saving}
              className="flex h-11 items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] font-bold text-white transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-60"
            >
              {saving && <Icon name="progress_activity" size={15} className="animate-spin" />}
              問題を追加
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
