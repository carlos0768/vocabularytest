'use client';

import { use, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import { DSQuizOption } from '@/components/quiz/DSQuizOption';
import {
  DesktopGrammarPracticeView,
  GRAMMAR_CHOICE_LABELS as CHOICE_LABELS,
  buildGrammarChatGptPrompt,
  renderGrammarSentence as renderSentence,
  type GrammarPracticeQuestion as GrammarQuestion,
} from '@/components/desktop/DesktopGrammar';

// 語法問題集の演習画面 (Vintage型)。
// 1問ずつ出題 → 選択 → 正誤 + 解説表示 → 次へ、最後に正答率と
// 間違えた文法項目のまとめを表示する。
// 問題取得は Pro ゲート付き /api/chatgpt/grammar-questions を cookie セッションで利用。
// デスクトップは DesktopGrammarPracticeView、モバイルは本ファイル内のUIを使う。
//
// bookId が "review" のときは語法復習モード: 間違えた問題
// (/api/chatgpt/grammar-misses) を出題し、正解したらミスを解消して
// 復習対象から外す。

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; questions: GrammarQuestion[] }
  | { kind: 'pro-required' }
  | { kind: 'error'; message: string };

export default function GrammarPracticePage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = use(params);
  const isReview = bookId === 'review';
  const router = useRouter();

  // 戻るは来た画面 (ホーム等) に戻す。直接アクセスなど履歴が無いときのみ一覧へフォールバック。
  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push('/grammar');
  };

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [wrongQuestions, setWrongQuestions] = useState<GrammarQuestion[]>([]);
  const [skippedCount, setSkippedCount] = useState(0);
  const [finished, setFinished] = useState(false);
  const [chatGptCopied, setChatGptCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch(
          isReview
            ? '/api/chatgpt/grammar-misses?limit=50'
            : `/api/chatgpt/grammar-questions?bookId=${encodeURIComponent(bookId)}&limit=100`,
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
  }, [bookId, isReview]);

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
    const isCorrect = choiceIndex === question.correctIndex;
    if (!isCorrect) {
      setWrongQuestions((prev) => [...prev, question]);
    }
    // 習得度を記録する(不正解時はサーバー側で誤答ログも残すので、
    // 別途 grammar-misses への直接POSTは不要)。復習モードでは所属問題集ID
    // (question.bookId) を使う。best-effort: 失敗しても演習は続行する。
    const effectiveBookId = isReview ? question.bookId : bookId;
    if (effectiveBookId) {
      void fetch('/api/grammar/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionId: question.id, bookId: effectiveBookId, result: isCorrect ? 'correct' : 'wrong' }),
      }).catch(() => {});
    }
    // 復習モードで正解できた問題はミスを解消し、次回の復習対象から外す
    if (isCorrect && isReview) {
      void fetch(`/api/chatgpt/grammar-misses?questionId=${encodeURIComponent(question.id)}`, {
        method: 'DELETE',
      }).catch(() => {});
    }
  };

  const handleNext = () => {
    setChatGptCopied(false);
    if (index + 1 >= questions.length) {
      setFinished(true);
      return;
    }
    setIndex((prev) => prev + 1);
    setSelected(null);
  };

  // 問題・選択肢・正解 (誤答時は自分の答えも) を含むChatGPT向けの質問文をコピーする
  const handleAskChatGpt = () => {
    if (!question) return;
    void navigator.clipboard
      .writeText(buildGrammarChatGptPrompt(question, selected))
      .then(() => setChatGptCopied(true))
      .catch(() => {});
  };

  // スキップは正解にも不正解にもカウントせず次の問題へ進む (モバイル/デスクトップ共用)。
  const handleSkip = () => {
    if (answered || !question) return;
    setSkippedCount((prev) => prev + 1);
    handleNext();
  };

  const handleRetry = () => {
    setIndex(0);
    setSelected(null);
    setWrongQuestions([]);
    setSkippedCount(0);
    setFinished(false);
    setChatGptCopied(false);
  };

  // 正解数 = 回答済み(スキップを除く)- 不正解数
  const correctCount = Math.max(
    0,
    (finished ? questions.length - skippedCount : index + (answered ? 1 : 0) - skippedCount) - wrongQuestions.length,
  );

  return (
    <>
      <DesktopGrammarPracticeView
        loadState={state.kind === 'ready' ? { kind: 'ready' } : state}
        totalQuestions={questions.length}
        index={index}
        question={question}
        selected={selected}
        finished={finished}
        correctCount={correctCount}
        wrongGrammarPoints={wrongGrammarPoints}
        chatGptCopied={chatGptCopied}
        title={isReview ? '語法復習' : '語法演習'}
        emptyMessage={isReview ? '復習する問題はありません。間違えた問題がここに溜まります。' : undefined}
        onSelect={handleSelect}
        onNext={handleNext}
        onSkip={handleSkip}
        onRetry={handleRetry}
        onAskChatGpt={handleAskChatGpt}
      />

      {/* 単語帳クイズと同じ固定ビューポート構成: 内容が収まる限りスクロールしない */}
      <div className="fixed inset-0 z-30 flex flex-col overflow-hidden bg-[var(--color-background)] font-[var(--font-body)] lg:hidden">
      <div className="mx-auto flex h-full w-full max-w-[560px] flex-col">
      {/* Header (固定ビューポートの上段。ノッチ帯は全体共通の StatusBarCover が覆う) */}
      <header
        className="flex shrink-0 items-center gap-2 border-b-2 border-[var(--color-border)] px-[18px] pb-2.5"
        style={{ paddingTop: 'max(10px, calc(env(safe-area-inset-top) + 10px))' }}
      >
        <button
          type="button"
          onClick={handleBack}
          className="flex h-[38px] w-[38px] items-center justify-center rounded-[19px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
          aria-label="戻る"
        >
          <Icon name="chevron_left" size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">
            {isReview ? 'GRAMMAR REVIEW' : 'GRAMMAR PRACTICE'}
          </div>
          {state.kind === 'ready' && questions.length > 0 && !finished && (
            <div className="font-display text-[15px] font-extrabold text-[var(--solid-ink)]">
              {index + 1} / {questions.length}
            </div>
          )}
        </div>
      </header>

      {/* body: 内容が収まる限りスクロールしない。例文などで溢れるときだけ縦スクロール */}
      <div className="min-h-0 flex-1 overflow-y-auto px-[18px] py-3.5">

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
            {isReview
              ? '復習する問題はありません。間違えた問題がここに溜まります。'
              : 'この問題集にはまだ問題がありません。ChatGPTで問題を追加してください。'}
          </p>
        </div>
      )}

      {/* 結果画面 */}
      {state.kind === 'ready' && finished && (
        <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white p-6">
          <div className="font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">RESULT</div>
          <div className="mt-2 font-display text-3xl font-extrabold text-[var(--solid-ink)]">
            {correctCount} / {questions.length} 問正解
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
          {correctCount === questions.length && (
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
            {question.sentenceJa && (answered || question.showTranslation) && (
              <p className="m-0 mt-2 text-[11.5px] leading-[1.7] text-[var(--color-muted)]">{question.sentenceJa}</p>
            )}
          </div>

          {/* 選択肢は単語帳クイズと同じ DSQuizOption を共用 */}
          <div className="mt-3.5 flex flex-col gap-2.5">
            {question.choices.map((choice, choiceIndex) => (
              <DSQuizOption
                key={choiceIndex}
                label={choice}
                index={choiceIndex}
                isSelected={selected === choiceIndex}
                isCorrect={choiceIndex === question.correctIndex}
                isRevealed={answered}
                onSelect={() => handleSelect(choiceIndex)}
                disabled={answered}
              />
            ))}
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
              <button
                type="button"
                onClick={handleAskChatGpt}
                className="mt-3 flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--solid-ink)] bg-white text-[12.5px] font-bold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
              >
                <Icon name={chatGptCopied ? 'check' : 'smart_toy'} size={16} />
                {chatGptCopied ? 'コピーしました！ChatGPTに貼り付けて質問できます' : 'ChatGPTに質問する'}
              </button>
            </div>
          )}
        </>
      )}
      </div>

      {/* ボトムバー: スキップ / 次へ。固定ビューポートの最下段に配置 (回答前はスキップ、回答後は次へ) */}
      {state.kind === 'ready' && question && !finished && (
        <div
          className="shrink-0 border-t-2 border-[var(--solid-ink)] bg-[var(--color-background)] px-[18px] pt-3"
          style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
        >
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={handleSkip}
              disabled={answered}
              className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--solid-ink)] bg-white font-bold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-40 disabled:active:translate-x-0 disabled:active:translate-y-0"
            >
              <Icon name="skip_next" size={18} />
              スキップ
            </button>
            <button
              type="button"
              onClick={handleNext}
              disabled={!answered}
              className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] font-bold text-white transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-40 disabled:active:translate-x-0 disabled:active:translate-y-0"
            >
              {index + 1 >= questions.length ? '結果を見る' : '次の問題へ'}
              <Icon name="arrow_forward" size={18} />
            </button>
          </div>
        </div>
      )}
      </div>
      </div>
    </>
  );
}
