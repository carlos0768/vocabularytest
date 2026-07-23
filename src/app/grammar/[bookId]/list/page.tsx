'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import {
  DesktopGrammarQuestionListView,
  GrammarQuestionDetailBody,
  renderGrammarSentence as renderSentence,
  type GrammarPracticeQuestion as GrammarQuestion,
} from '@/components/desktop/DesktopGrammar';
import { GrammarQuestionFormModal } from '@/components/grammar/GrammarQuestionFormModal';

// 語法問題集の問題一覧。演習前に問題と文法項目をざっと確認する用途。
// 項目をタップすると /project/* の単語詳細と同じフローティング表示で
// 正解と解説を確認できる。デスクトップは DesktopGrammarQuestionListView、
// モバイルは本ファイル内のUIを使う。

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; questions: GrammarQuestion[] }
  | { kind: 'pro-required' }
  | { kind: 'error'; message: string };

export default function GrammarQuestionListPage({ params }: { params: Promise<{ bookId: string }> }) {
  const { bookId } = use(params);
  const router = useRouter();

  // 戻るは来た画面 (ホーム等) に戻す。直接アクセスなど履歴が無いときのみ一覧へフォールバック。
  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push('/grammar');
  };

  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  // 問題追加後に一覧を再取得するためのキー
  const [reloadKey, setReloadKey] = useState(0);
  const reload = useCallback(() => setReloadKey((prev) => prev + 1), []);

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
  }, [bookId, reloadKey]);

  const questions = state.kind === 'ready' ? state.questions : [];
  const selectedQuestion = selectedIndex !== null ? questions[selectedIndex] : undefined;

  const handleNavDetail = (dir: -1 | 1) => {
    setSelectedIndex((prev) => {
      if (prev === null || questions.length === 0) return prev;
      return (prev + dir + questions.length) % questions.length;
    });
  };

  return (
    <>
      <DesktopGrammarQuestionListView
        loadState={state.kind === 'ready' ? { kind: 'ready' } : state}
        bookId={bookId}
        questions={questions}
        selectedIndex={selectedIndex}
        onSelectQuestion={setSelectedIndex}
        onCloseDetail={() => setSelectedIndex(null)}
        onNavDetail={handleNavDetail}
        onAddQuestion={() => setFormOpen(true)}
      />

      {/* 手動で問題を追加 (モバイル/デスクトップ共用) */}
      <GrammarQuestionFormModal
        open={formOpen}
        bookId={bookId}
        onClose={() => setFormOpen(false)}
        onCreated={() => {
          setFormOpen(false);
          reload();
        }}
      />

      <div className="relative mx-auto min-h-screen w-full max-w-[560px] bg-[var(--color-background)] px-[18px] pb-12 pt-3 font-[var(--font-body)] lg:hidden">
      {/* Header */}
      <div className="flex items-center gap-2 pb-3 pt-1">
        <button
          type="button"
          onClick={handleBack}
          className="flex h-[38px] w-[38px] items-center justify-center rounded-[19px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
          aria-label="戻る"
        >
          <Icon name="chevron_left" size={16} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">QUESTION LIST</div>
          <div className="font-display text-[15px] font-extrabold text-[var(--solid-ink)]">問題一覧</div>
        </div>
        <button
          type="button"
          onClick={() => setFormOpen(true)}
          aria-label="問題を手動で追加"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
        >
          <Icon name="add" size={16} />
        </button>
        <Link
          href={`/grammar/${bookId}`}
          className="flex h-9 shrink-0 items-center gap-1.5 rounded-full border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-3.5 text-[12px] font-bold text-white transition-all duration-100 active:translate-x-px active:translate-y-px"
        >
          <Icon name="play_arrow" size={15} />
          演習する
        </Link>
      </div>

      {state.kind === 'loading' && (
        <div className="flex flex-col gap-2.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[76px] animate-pulse rounded-xl border-2 border-[var(--color-border)] bg-white" />
          ))}
        </div>
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

      {state.kind === 'ready' && questions.length > 0 && (
        /* /project/* の単語一覧と同じ枠 (divide-y の枠なしリスト行) */
        <div className="divide-y divide-[var(--color-border)]">
          {questions.map((question, questionIndex) => (
            <button
              key={question.id}
              type="button"
              onClick={() => setSelectedIndex(questionIndex)}
              className="flex w-full items-start gap-2.5 px-1 py-2.5 text-left transition-colors active:bg-[rgba(19,127,236,0.06)]"
            >
              <span className="mt-0.5 shrink-0 font-mono text-[11px] font-bold text-[var(--color-muted)]">
                {String(questionIndex + 1).padStart(2, '0')}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] leading-[1.8] text-[var(--solid-ink)]">
                  {renderSentence(question.sentence)}
                </span>
                {question.grammarPoint && (
                  <span className="mt-1.5 inline-block rounded-[4px] border border-[var(--solid-ink)] bg-[#faf7f1] px-2 py-[3px] font-mono text-[9px] font-bold text-[var(--solid-ink)]">
                    {question.grammarPoint}
                  </span>
                )}
              </span>
              <Icon name="chevron_right" size={14} className="mt-1 shrink-0 text-[var(--color-muted)]" />
            </button>
          ))}
        </div>
      )}

      {/* 問題詳細 (正解・解説) のフローティング表示。/project/* の単語詳細と同じ構成 */}
      {selectedQuestion && selectedIndex !== null && (
        <div className="fixed inset-0 z-[80] lg:hidden" style={{ fontFamily: 'var(--font-body)' }}>
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(26,26,26,0.45)', backdropFilter: 'blur(3px)' }}
            onClick={() => setSelectedIndex(null)}
          />
          <div className="absolute inset-0 flex items-center justify-center px-4 py-10" onClick={() => setSelectedIndex(null)}>
            <div
              className="w-full overflow-y-auto overscroll-contain"
              onClick={(e) => e.stopPropagation()}
              style={{
                maxWidth: 480,
                maxHeight: '80dvh',
                background: '#fff',
                border: '2px solid var(--solid-ink)',
                borderRadius: 20,
              }}
            >
              <div className="sticky top-0 z-[2] flex items-center justify-between border-b border-[var(--color-border)] bg-white px-4 py-3">
                <span className="font-mono text-[10.5px] font-bold tracking-[0.06em] text-[var(--color-muted)]">
                  問題 {selectedIndex + 1} / {questions.length}
                </span>
                <div className="flex gap-1">
                  {questions.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleNavDetail(-1)}
                        aria-label="前の問題"
                        className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-[var(--color-border)] bg-white text-[var(--color-secondary-text)]"
                      >
                        <Icon name="chevron_left" size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleNavDetail(1)}
                        aria-label="次の問題"
                        className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-[var(--color-border)] bg-white text-[var(--color-secondary-text)]"
                      >
                        <Icon name="chevron_right" size={16} />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setSelectedIndex(null)}
                    aria-label="閉じる"
                    className="flex h-8 w-8 items-center justify-center rounded-[9px] border border-[var(--color-border)] bg-white text-[var(--color-secondary-text)]"
                  >
                    <Icon name="close" size={16} />
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-4 p-5">
                <GrammarQuestionDetailBody question={selectedQuestion} />
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </>
  );
}
