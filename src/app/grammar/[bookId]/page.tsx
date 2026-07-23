'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';

// 語法問題集の演習画面 (Vintage型)。
// 1問ずつ出題 → 選択 → 正誤 + 解説表示 → 次へ、最後に正答率と
// 間違えた文法項目のまとめを表示する。
// 問題取得は Pro ゲート付き /api/chatgpt/grammar-questions を cookie セッションで利用。

const CHOICE_LABELS = ['A', 'B', 'C', 'D'] as const;

type GrammarQuestion = {
  id: string;
  sentence: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
  grammarPoint: string | null;
  sentenceJa: string | null;
};

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; questions: GrammarQuestion[] }
  | { kind: 'pro-required' }
  | { kind: 'error'; message: string };

// 空欄マーカーを含む問題文を、空欄を強調したJSXに分解する
function renderSentence(sentence: string) {
  const parts = sentence.split('___');
  return parts.map((part, index) => (
    <span key={index}>
      {part}
      {index < parts.length - 1 && (
        <span className="mx-1 inline-block min-w-[64px] border-b-2 border-[var(--color-accent)] text-center font-bold text-[var(--color-accent)]">
          ___
        </span>
      )}
    </span>
  ));
}

export default function GrammarPracticePage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = use(params);
  const router = useRouter();

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [wrongQuestions, setWrongQuestions] = useState<GrammarQuestion[]>([]);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(
          `/api/chatgpt/grammar-questions?bookId=${encodeURIComponent(bookId)}&limit=100`,
          { cache: 'no-store' },
        );
        const payload = (await response.json().catch(() => ({}))) as {
          success?: boolean;
          questions?: GrammarQuestion[];
          error?: string;
          code?: string;
        };

        if (cancelled) return;

        if (response.status === 403 && payload.code === 'PRO_REQUIRED') {
          setState({ kind: 'pro-required' });
          return;
        }
        if (!response.ok || !payload.success) {
          setState({ kind: 'error', message: payload.error || '問題の取得に失敗しました' });
          return;
        }
        setState({ kind: 'ready', questions: payload.questions ?? [] });
      } catch {
        if (!cancelled) {
          setState({ kind: 'error', message: '通信に失敗しました' });
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const questions = state.kind === 'ready' ? state.questions : [];
  const question = questions[index];
  const answered = selected !== null;
  const correct = answered && question ? selected === question.correctIndex : false;

  const wrongGrammarPoints = useMemo(() => {
    const points = wrongQuestions
      .map((q) => q.grammarPoint)
      .filter((point): point is string => Boolean(point));
    return Array.from(new Set(points));
  }, [wrongQuestions]);

  const handleSelect = (choiceIndex: number) => {
    if (answered || !question) return;
    setSelected(choiceIndex);
    if (choiceIndex !== question.correctIndex) {
      setWrongQuestions((prev) => [...prev, question]);
      // 誤答ログを記録する (ChatGPTの「間違えた問題」復習用)。
      // best-effort: 失敗しても演習は続行する。
      void fetch('/api/chatgpt/grammar-misses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: question.id, bookId }),
      }).catch(() => {});
    }
  };

  const handleNext = () => {
    if (index + 1 >= questions.length) {
      setFinished(true);
      return;
    }
    setIndex((prev) => prev + 1);
    setSelected(null);
  };

  const handleRetry = () => {
    setIndex(0);
    setSelected(null);
    setWrongQuestions([]);
    setFinished(false);
  };

  return (
    <div className="relative mx-auto min-h-screen w-full max-w-[560px] bg-[var(--color-background)] px-[18px] pb-12 pt-[calc(env(safe-area-inset-top,0px)+12px)] font-[var(--font-body)]">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 pt-1">
        <button
          type="button"
          onClick={() => router.push('/grammar')}
          className="flex h-[38px] w-[38px] items-center justify-center rounded-[19px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
          aria-label="一覧に戻る"
        >
          <Icon name="chevron_left" size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">GRAMMAR PRACTICE</div>
          {state.kind === 'ready' && questions.length > 0 && !finished && (
            <div className="font-display text-[15px] font-extrabold text-[var(--solid-ink)]">
              {index + 1} / {questions.length}
            </div>
          )}
        </div>
        {question?.grammarPoint && !finished && (
          <span className="shrink-0 rounded-[4px] border border-[var(--solid-ink)] bg-white px-2 py-[3px] font-mono text-[9px] font-bold text-[var(--solid-ink)]">
            {question.grammarPoint}
          </span>
        )}
      </div>

      {state.kind === 'loading' && (
        <div className="mt-2 h-[300px] animate-pulse rounded-xl border-2 border-[var(--color-border)] bg-white" />
      )}

      {state.kind === 'pro-required' && (
        <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white p-5">
          <p className="m-0 text-[13px] leading-[1.8] text-[var(--solid-ink)]">
            語法問題集はPro限定機能です。
          </p>
          <Link
            href="/subscription"
            className="mt-4 flex h-11 items-center justify-center rounded-xl border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] font-bold text-white"
          >
            Proプランを見る
          </Link>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white p-5 text-center">
          <p className="m-0 text-[13px] text-[var(--solid-ink)]">{state.message}</p>
        </div>
      )}

      {state.kind === 'ready' && questions.length === 0 && (
        <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white p-5">
          <p className="m-0 text-[13px] leading-[1.8] text-[var(--solid-ink)]">
            この問題集にはまだ問題がありません。ChatGPTで問題を追加してください。
          </p>
        </div>
      )}

      {/* 結果画面 */}
      {state.kind === 'ready' && finished && (
        <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white p-6">
          <div className="font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">RESULT</div>
          <div className="mt-2 font-display text-3xl font-extrabold text-[var(--solid-ink)]">
            {questions.length - wrongQuestions.length} / {questions.length} 問正解
          </div>
          {wrongGrammarPoints.length > 0 && (
            <div className="mt-4">
              <div className="text-[12px] font-bold text-[var(--solid-ink)]">復習したい文法項目</div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {wrongGrammarPoints.map((point) => (
                  <span key={point} className="rounded-[4px] border border-[var(--solid-ink)] bg-[#faf7f1] px-2 py-[3px] font-mono text-[10px] font-bold text-[var(--solid-ink)]">
                    {point}
                  </span>
                ))}
              </div>
            </div>
          )}
          {wrongQuestions.length === 0 && (
            <p className="m-0 mt-3 text-[12px] text-[var(--solid-ink)]">全問正解です。この調子で次の問題集にも挑戦しましょう 🎉</p>
          )}
          <div className="mt-5 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={handleRetry}
              className="h-12 rounded-xl border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] font-bold text-white transition-all duration-100 active:translate-x-px active:translate-y-px"
            >
              もう一度解く
            </button>
            <Link
              href="/grammar"
              className="flex h-12 items-center justify-center rounded-xl border-2 border-[var(--solid-ink)] bg-white font-bold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
            >
              問題集一覧へ
            </Link>
          </div>
        </div>
      )}

      {/* 出題画面 */}
      {state.kind === 'ready' && question && !finished && (
        <>
          <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white p-5">
            <p className="m-0 text-[15px] leading-[2] text-[var(--solid-ink)]">{renderSentence(question.sentence)}</p>
            {question.sentenceJa && answered && (
              <p className="m-0 mt-2 text-[11.5px] leading-[1.7] text-[var(--color-muted)]">{question.sentenceJa}</p>
            )}
          </div>

          <div className="mt-3.5 flex flex-col gap-2.5">
            {question.choices.map((choice, choiceIndex) => {
              const isSelected = selected === choiceIndex;
              const isCorrectChoice = choiceIndex === question.correctIndex;
              const showCorrect = answered && isCorrectChoice;
              const showWrong = answered && isSelected && !isCorrectChoice;
              return (
                <button
                  key={choiceIndex}
                  type="button"
                  onClick={() => handleSelect(choiceIndex)}
                  disabled={answered}
                  className="flex items-center gap-3 rounded-xl border-2 bg-white px-4 py-3 text-left transition-all duration-100 active:translate-x-px active:translate-y-px disabled:active:translate-x-0 disabled:active:translate-y-0"
                  style={{
                    borderColor: showCorrect
                      ? 'var(--color-accent)'
                      : showWrong
                        ? 'var(--color-error, #d33)'
                        : 'var(--solid-ink)',
                    background: showCorrect ? 'var(--color-accent-light, #e8f5ec)' : showWrong ? '#fdeceb' : '#fff',
                  }}
                >
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 font-mono text-[12px] font-bold"
                    style={{
                      borderColor: showCorrect ? 'var(--color-accent)' : showWrong ? 'var(--color-error, #d33)' : 'var(--solid-ink)',
                      color: showCorrect ? 'var(--color-accent)' : showWrong ? 'var(--color-error, #d33)' : 'var(--solid-ink)',
                    }}
                  >
                    {CHOICE_LABELS[choiceIndex]}
                  </span>
                  <span className="min-w-0 flex-1 text-[14px] font-bold text-[var(--solid-ink)]">{choice}</span>
                  {showCorrect && <Icon name="check_circle" size={18} className="shrink-0 text-[var(--color-accent)]" />}
                  {showWrong && <Icon name="cancel" size={18} className="shrink-0 text-[#d33]" />}
                </button>
              );
            })}
          </div>

          {/* 解説 (Vintage風: 答え合わせのたびに必ず表示) */}
          {answered && (
            <div className="mt-3.5 rounded-xl border-2 border-[var(--solid-ink)] bg-[#faf7f1] p-4">
              <div className="flex items-center gap-1.5">
                <Icon name={correct ? 'check_circle' : 'school'} size={16} className={correct ? 'text-[var(--color-accent)]' : 'text-[var(--solid-ink)]'} />
                <span className="font-display text-[13px] font-extrabold text-[var(--solid-ink)]">
                  {correct ? '正解！' : `正解は ${CHOICE_LABELS[question.correctIndex]} 「${question.choices[question.correctIndex]}」`}
                </span>
              </div>
              <p className="m-0 mt-2 text-[12.5px] leading-[1.9] text-[var(--solid-ink)]">{question.explanation}</p>
            </div>
          )}

          {answered && (
            <button
              type="button"
              onClick={handleNext}
              className="mt-4 h-12 w-full rounded-xl border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] font-bold text-white transition-all duration-100 active:translate-x-px active:translate-y-px"
            >
              {index + 1 >= questions.length ? '結果を見る' : '次の問題へ'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
