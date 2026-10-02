'use client';

import { useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import {
  VOICE_DICTATION_MAX_MS,
  useVoiceWordDictation,
  type VoiceDictationResult,
} from '@/hooks/use-voice-word-dictation';
import { MAX_DICTATED_ENTRY_LENGTH, MAX_DICTATED_WORDS } from '@/lib/speech/dictated-words-limits';

interface Candidate {
  id: number;
  english: string;
}

let nextCandidateId = 1;

function toCandidates(words: readonly string[]): Candidate[] {
  return words.map((english) => ({ id: nextCandidateId++, english }));
}

function formatSeconds(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * 音声で単語をまとめて追加するモーダル。
 *
 * マイクのボタンで録音を始め、もう一度押すと止まる。読み上げた語は
 * 一覧になり、認識違いを直したり消したりしてから「追加」で保存する。
 * 「続けて話す」で録り足せる (同じ語は重ねない)。保存は呼び出し側で、
 * 手入力と同じ経路 (日本語訳・発音などはAIが補完) に流す。
 *
 * 開いている間だけマウントすること。閉じる (アンマウント) と録音は止まり、
 * 一覧も捨てられるので、次に開いたときは空から始まる。
 */
export function VoiceWordModal({
  adding,
  addingMessage,
  existingEnglish,
  morphologyEnabled,
  onMorphologyEnabledChange,
  onClose,
  onAdd,
}: {
  adding: boolean;
  addingMessage?: string;
  /** 単語帳にすでにある見出し語 (小文字)。重ねて追加しないよう一覧で印を付ける。 */
  existingEnglish: ReadonlySet<string>;
  morphologyEnabled: boolean;
  onMorphologyEnabledChange: (enabled: boolean) => void;
  onClose: () => void;
  onAdd: (words: string[]) => void | Promise<void>;
}) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const handleResult = ({ words }: VoiceDictationResult) => {
    if (words.length === 0) {
      setNotice('英単語を聞き取れませんでした。もう一度ゆっくり話してみてください');
      return;
    }
    setNotice(null);
    setCandidates((prev) => {
      const seen = new Set(prev.map((c) => c.english.trim().toLowerCase()));
      const fresh = words.filter((word) => {
        const key = word.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return [...prev, ...toCandidates(fresh)].slice(0, MAX_DICTATED_WORDS);
    });
  };

  const dictation = useVoiceWordDictation(handleResult);

  const busy = adding || dictation.phase === 'processing' || dictation.phase === 'starting';
  const recording = dictation.phase === 'recording';
  const isExisting = (english: string) => existingEnglish.has(english.trim().toLowerCase());
  const addable = candidates
    .map((c) => c.english.trim())
    .filter((english) => english.length > 0 && !isExisting(english));
  const errorText = dictation.error ?? notice;

  const handleMicPress = () => {
    if (recording) {
      dictation.stop();
      return;
    }
    if (busy) return;
    setNotice(null);
    dictation.clearError();
    void dictation.start();
  };

  const handleClose = () => {
    if (adding) return;
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100]" style={{ fontFamily: 'var(--font-body)' }}>
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="閉じる"
        onClick={handleClose}
        style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
      />
      <div className="absolute inset-0 flex items-center justify-center px-5">
        <div className="flex max-h-[90dvh] w-full max-w-[400px] flex-col rounded-[16px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] p-5">
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
            VOICE INPUT
          </div>
          <h2 className="mt-1 font-display text-[18px] font-extrabold text-[var(--solid-ink)]">
            音声で追加
          </h2>
          <p className="mt-1 text-[11px] leading-[1.5] text-[var(--color-muted)]">
            マイクを押して、覚えたい英単語や熟語を少し間をあけながら読み上げてください。もう一度押すと終了します。日本語訳などは AI が自動で補完します。
          </p>

          {/* 録音ボタン */}
          <div className="mt-4 flex flex-col items-center">
            <button
              type="button"
              onClick={handleMicPress}
              disabled={busy && !recording}
              aria-pressed={recording}
              aria-label={recording ? '録音を終了' : '録音を開始'}
              className="relative flex h-[76px] w-[76px] items-center justify-center rounded-full border-2 border-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-60"
              style={{
                background: recording ? 'var(--color-error)' : 'var(--color-accent)',
                color: recording ? '#fff' : 'var(--color-on-accent)',
                boxShadow: '3px 3px 0 var(--solid-ink)',
              }}
            >
              {recording && (
                <span
                  aria-hidden
                  className="absolute inset-[-6px] animate-ping rounded-full border-2"
                  style={{ borderColor: 'var(--color-error)', opacity: 0.4 }}
                />
              )}
              {dictation.phase === 'processing' || dictation.phase === 'starting' ? (
                <Icon name="progress_activity" size={30} className="animate-spin" />
              ) : (
                <Icon name={recording ? 'stop' : 'mic'} size={32} />
              )}
            </button>
            <div className="mt-2.5 min-h-[18px] text-center text-[12px] font-bold text-[var(--solid-ink)]">
              {recording
                ? (
                  <>
                    録音中 {formatSeconds(dictation.elapsedMs)}
                    <span className="font-medium text-[var(--color-muted)]"> / {formatSeconds(VOICE_DICTATION_MAX_MS)}・タップで終了</span>
                  </>
                )
                : dictation.phase === 'processing'
                  ? '文字に起こしています...'
                  : dictation.phase === 'starting'
                    ? 'マイクを準備しています...'
                    : candidates.length > 0
                      ? 'タップして続けて話す'
                      : 'タップして話す'}
            </div>
            {errorText && (
              <p className="mt-1.5 text-center text-[11px] font-medium text-[var(--color-error)]">{errorText}</p>
            )}
          </div>

          {/* 聞き取った単語の一覧 */}
          {candidates.length > 0 && (
            <div className="mt-4 flex min-h-0 flex-1 flex-col">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--color-muted)]">
                  聞き取った単語 {candidates.length}
                </span>
                <button
                  type="button"
                  onClick={() => setCandidates([])}
                  disabled={busy}
                  className="text-[10px] font-bold text-[var(--color-muted)] hover:text-[var(--solid-ink)] disabled:opacity-50"
                >
                  すべて消す
                </button>
              </div>
              <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
                {candidates.map((candidate) => {
                  const existing = isExisting(candidate.english);
                  return (
                    <li key={candidate.id} className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={candidate.english}
                        onChange={(e) => {
                          const english = e.target.value;
                          setCandidates((prev) => prev.map((c) => (c.id === candidate.id ? { ...c, english } : c)));
                        }}
                        disabled={adding}
                        maxLength={MAX_DICTATED_ENTRY_LENGTH}
                        aria-label="単語"
                        className="min-w-0 flex-1 rounded-[9px] border-2 border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 font-display text-[14px] font-bold text-[var(--solid-ink)] outline-none focus:border-[var(--solid-ink)] disabled:opacity-60"
                        style={existing ? { opacity: 0.5 } : undefined}
                      />
                      {existing && (
                        <span className="shrink-0 font-mono text-[9px] font-bold text-[var(--color-muted)]">登録済み</span>
                      )}
                      <button
                        type="button"
                        onClick={() => setCandidates((prev) => prev.filter((c) => c.id !== candidate.id))}
                        disabled={adding}
                        aria-label={`${candidate.english}を削除`}
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[var(--color-muted)] hover:text-[var(--solid-ink)] disabled:opacity-50"
                      >
                        <Icon name="close" size={16} />
                      </button>
                    </li>
                  );
                })}
              </ul>

              {/* 語源解析は手入力と同じ設定を共有する（コイン消費があるので見える所に置く） */}
              <button
                type="button"
                onClick={() => onMorphologyEnabledChange(!morphologyEnabled)}
                disabled={adding}
                className="mt-3 flex items-center gap-2 text-left disabled:opacity-60"
              >
                <span
                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
                  style={{
                    border: `1.25px solid ${morphologyEnabled ? 'var(--color-accent)' : 'var(--color-border)'}`,
                    background: morphologyEnabled ? 'var(--color-accent)' : 'var(--color-surface)',
                  }}
                >
                  {morphologyEnabled && <Icon name="check" size={11} className="text-white" />}
                </span>
                <span className="text-[11px] font-bold text-[var(--solid-ink)]">語源解析</span>
                <span className="font-mono text-[8px] font-bold tracking-[0.04em] text-[var(--color-accent)]">+1コイン/語</span>
              </button>
            </div>
          )}

          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={adding}
              className="flex-1 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--color-surface)] px-3 py-2.5 text-[13px] font-bold text-[var(--solid-ink)] disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => void onAdd(addable)}
              disabled={addable.length === 0 || busy || recording}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-[10px] border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-3 py-2.5 text-[13px] font-bold text-[var(--color-on-ink)] disabled:opacity-50"
            >
              {adding && <Icon name="progress_activity" size={14} className="animate-spin" />}
              {adding ? (addingMessage ?? '追加中...') : `${addable.length}語を追加`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
