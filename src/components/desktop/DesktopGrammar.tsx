'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { DesktopButton, DesktopDonut, DesktopTopbar } from '@/components/desktop/DesktopChrome';
import { desktopUpdatedLabel } from '@/components/desktop/desktop-data';

// 語法問題集(Vintage型)一覧のデスクトップビュー。
// DesktopProjectsView と同じ ds-card / ds-table ベースの構成。

export type GrammarBook = {
  id: string;
  title: string;
  updatedAt: string;
};

export type GrammarBooksLoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; books: GrammarBook[] }
  | { kind: 'pro-required' }
  | { kind: 'error'; message: string };

export type GrammarPracticeQuestion = {
  id: string;
  sentence: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
  grammarPoint: string | null;
  sentenceJa: string | null;
};

export const GRAMMAR_CHOICE_LABELS = ['A', 'B', 'C', 'D'] as const;

// 空欄マーカー ___ を強調表示に変換する (モバイル/デスクトップ共用)
export function renderGrammarSentence(sentence: string) {
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

export function DesktopGrammarBooksView({
  state,
  gptUrl,
  sharingBookId,
  sharedBookId,
  onShare,
}: {
  state: GrammarBooksLoadState;
  gptUrl: string;
  sharingBookId: string | null;
  sharedBookId: string | null;
  onShare: (bookId: string) => void;
}) {
  return (
    <div className="hidden h-full min-h-0 flex-col lg:flex">
      <DesktopTopbar title="語法問題集" crumb="文法・語法 / 空欄補充・英語4択">
        {gptUrl ? (
          <DesktopButton
            variant="accent"
            icon="smart_toy"
            onClick={() => window.open(gptUrl, '_blank', 'noopener,noreferrer')}
          >
            ChatGPTで問題を作る
          </DesktopButton>
        ) : (
          <DesktopButton variant="accent" icon="smart_toy" href="/tips/chatgpt">
            ChatGPT連携の使い方
          </DesktopButton>
        )}
      </DesktopTopbar>

      <div className="ds-scroll">
        <div style={{ maxWidth: 980 }}>
          <p className="muted" style={{ fontSize: 12.5, margin: '0 0 16px' }}>
            空欄補充・英語4択・解説つきの語法問題集。問題はChatGPTとの会話で作成し、ここで演習できます。
          </p>

          {state.kind === 'loading' && (
            <div className="ds-card muted" style={{ padding: 50, textAlign: 'center', fontSize: 13 }}>
              <Icon name="progress_activity" className="animate-spin" style={{ marginRight: 8 }} />
              読み込み中...
            </div>
          )}

          {state.kind === 'pro-required' && (
            <div className="ds-card" style={{ padding: 24, maxWidth: 560 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16 }}>Pro限定機能です</div>
              <p className="muted" style={{ fontSize: 13, lineHeight: 1.8, margin: '10px 0 16px' }}>
                語法問題集はProプラン限定です。アップグレードすると、ChatGPTとの会話でVintage風の語法問題を作成・演習できます。
              </p>
              <DesktopButton variant="dark" href="/subscription" icon="workspace_premium">
                Proプランを見る
              </DesktopButton>
            </div>
          )}

          {state.kind === 'error' && (
            <div className="ds-card" style={{ padding: 24, color: 'var(--color-error)', borderColor: 'var(--color-error)', fontSize: 13 }}>
              {state.message}
            </div>
          )}

          {state.kind === 'ready' && state.books.length === 0 && (
            <div className="ds-card" style={{ padding: 40, textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15 }}>まだ問題集がありません</div>
              <p className="muted" style={{ fontSize: 13, lineHeight: 1.8, margin: '10px 0 0' }}>
                ChatGPTのMERKEN GPTに「仮定法の語法問題を10問作って」のように頼むと、ここに問題集が保存されます。
              </p>
            </div>
          )}

          {state.kind === 'ready' && state.books.length > 0 && (
            <>
              <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
                <table className="ds-table">
                  <thead>
                    <tr>
                      <th>問題集</th>
                      <th style={{ width: 110 }}>更新</th>
                      <th style={{ width: 90 }}>共有</th>
                      <th style={{ width: 120 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {state.books.map((book) => (
                      <tr key={book.id}>
                        <td>
                          <Link
                            href={`/grammar/${book.id}`}
                            style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}
                          >
                            <span
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 34,
                                height: 34,
                                borderRadius: 9,
                                border: '2px solid var(--solid-ink)',
                                background: '#faf7f1',
                              }}
                            >
                              <Icon name="menu_book" style={{ fontSize: 18 }} />
                            </span>
                            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15 }}>{book.title}</span>
                          </Link>
                        </td>
                        <td className="mono" style={{ fontSize: 11.5, color: 'var(--color-muted)' }}>
                          {desktopUpdatedLabel(book.updatedAt)}
                        </td>
                        <td>
                          <DesktopButton
                            variant="ghost"
                            icon={sharedBookId === book.id ? 'check' : 'ios_share'}
                            onClick={() => (sharingBookId ? undefined : onShare(book.id))}
                            title="共有リンクをコピー"
                          >
                            {''}
                          </DesktopButton>
                        </td>
                        <td>
                          <DesktopButton variant="dark" icon="play_arrow" href={`/grammar/${book.id}`}>
                            演習する
                          </DesktopButton>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {sharedBookId && (
                <p className="mono" style={{ fontSize: 11.5, color: 'var(--color-accent)', fontWeight: 700, marginTop: 10 }}>
                  共有リンクをコピーしました
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// 語法演習のデスクトップビュー。左に問題カード、右に進捗サイドバーの2カラム。
export function DesktopGrammarPracticeView({
  loadState,
  totalQuestions,
  index,
  question,
  selected,
  finished,
  correctCount,
  wrongGrammarPoints,
  onSelect,
  onNext,
  onRetry,
}: {
  loadState: { kind: 'loading' } | { kind: 'pro-required' } | { kind: 'error'; message: string } | { kind: 'ready' };
  totalQuestions: number;
  index: number;
  question: GrammarPracticeQuestion | undefined;
  selected: number | null;
  finished: boolean;
  correctCount: number;
  wrongGrammarPoints: string[];
  onSelect: (choiceIndex: number) => void;
  onNext: () => void;
  onRetry: () => void;
}) {
  const answered = selected !== null;
  const correct = answered && question ? selected === question.correctIndex : false;
  const answeredCount = finished ? totalQuestions : index + (answered ? 1 : 0);

  return (
    <div className="hidden h-full min-h-0 flex-col lg:flex">
      <DesktopTopbar title="語法演習" crumb="文法・語法 / 空欄補充・英語4択">
        <DesktopButton variant="ghost" icon="arrow_back" href="/grammar">
          一覧へ戻る
        </DesktopButton>
      </DesktopTopbar>

      <div className="ds-scroll">
        {loadState.kind === 'loading' && (
          <div className="ds-card muted" style={{ padding: 50, textAlign: 'center', fontSize: 13, maxWidth: 720 }}>
            <Icon name="progress_activity" className="animate-spin" style={{ marginRight: 8 }} />
            読み込み中...
          </div>
        )}

        {loadState.kind === 'pro-required' && (
          <div className="ds-card" style={{ padding: 24, maxWidth: 560 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16 }}>Pro限定機能です</div>
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.8, margin: '10px 0 16px' }}>
              語法問題集はProプラン限定です。
            </p>
            <DesktopButton variant="dark" href="/subscription" icon="workspace_premium">
              Proプランを見る
            </DesktopButton>
          </div>
        )}

        {loadState.kind === 'error' && (
          <div className="ds-card" style={{ padding: 24, maxWidth: 560, color: 'var(--color-error)', borderColor: 'var(--color-error)', fontSize: 13 }}>
            {loadState.message}
          </div>
        )}

        {loadState.kind === 'ready' && totalQuestions === 0 && (
          <div className="ds-card" style={{ padding: 40, textAlign: 'center', maxWidth: 720 }}>
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.8, margin: 0 }}>
              この問題集にはまだ問題がありません。ChatGPTで問題を追加してください。
            </p>
          </div>
        )}

        {loadState.kind === 'ready' && totalQuestions > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 24, alignItems: 'start', maxWidth: 1100 }}>
            <div>
              {finished ? (
                <div className="ds-card" style={{ padding: 32 }}>
                  <div className="mono muted" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em' }}>RESULT</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 28, marginTop: 18 }}>
                    <DesktopDonut
                      mastered={correctCount}
                      review={totalQuestions - correctCount}
                      total={totalQuestions}
                      percent={Math.round((correctCount / totalQuestions) * 100)}
                    />
                    <div>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28 }}>
                        {correctCount} / {totalQuestions} 問正解
                      </div>
                      {wrongGrammarPoints.length > 0 ? (
                        <div style={{ marginTop: 12 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 700 }}>復習したい文法項目</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                            {wrongGrammarPoints.map((point) => (
                              <span key={point} className="ds-chip" style={{ cursor: 'default' }}>{point}</span>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <p className="muted" style={{ fontSize: 13, margin: '10px 0 0' }}>全問正解です 🎉</p>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
                    <DesktopButton variant="dark" icon="replay" onClick={onRetry}>
                      もう一度解く
                    </DesktopButton>
                    <DesktopButton variant="ghost" icon="list" href="/grammar">
                      問題集一覧へ
                    </DesktopButton>
                  </div>
                </div>
              ) : question ? (
                <>
                  <div className="ds-card" style={{ padding: '26px 30px' }}>
                    <p style={{ margin: 0, fontSize: 19, lineHeight: 2.1 }}>{renderGrammarSentence(question.sentence)}</p>
                    {question.sentenceJa && answered && (
                      <p className="muted" style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.8 }}>{question.sentenceJa}</p>
                    )}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
                    {question.choices.map((choice, choiceIndex) => {
                      const isSelected = selected === choiceIndex;
                      const isCorrectChoice = choiceIndex === question.correctIndex;
                      const showCorrect = answered && isCorrectChoice;
                      const showWrong = answered && isSelected && !isCorrectChoice;
                      return (
                        <button
                          key={choiceIndex}
                          type="button"
                          onClick={() => onSelect(choiceIndex)}
                          disabled={answered}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '14px 18px',
                            borderRadius: 14,
                            border: `2px solid ${showCorrect ? 'var(--color-accent)' : showWrong ? 'var(--color-error, #d33)' : 'var(--solid-ink)'}`,
                            background: showCorrect ? 'var(--color-accent-light, #e8f5ec)' : showWrong ? '#fdeceb' : '#fff',
                            cursor: answered ? 'default' : 'pointer',
                            textAlign: 'left',
                          }}
                        >
                          <span
                            className="mono"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              width: 30,
                              height: 30,
                              flexShrink: 0,
                              borderRadius: '50%',
                              fontWeight: 700,
                              fontSize: 13,
                              border: `2px solid ${showCorrect ? 'var(--color-accent)' : showWrong ? 'var(--color-error, #d33)' : 'var(--solid-ink)'}`,
                              color: showCorrect ? 'var(--color-accent)' : showWrong ? 'var(--color-error, #d33)' : 'var(--solid-ink)',
                            }}
                          >
                            {GRAMMAR_CHOICE_LABELS[choiceIndex]}
                          </span>
                          <span style={{ fontWeight: 700, fontSize: 15, minWidth: 0 }}>{choice}</span>
                          {showCorrect && <Icon name="check_circle" style={{ marginLeft: 'auto', color: 'var(--color-accent)' }} />}
                          {showWrong && <Icon name="cancel" style={{ marginLeft: 'auto', color: '#d33' }} />}
                        </button>
                      );
                    })}
                  </div>

                  {answered && (
                    <div className="ds-card" style={{ padding: '18px 22px', marginTop: 16, background: '#faf7f1' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Icon
                          name={correct ? 'check_circle' : 'school'}
                          style={{ color: correct ? 'var(--color-accent)' : 'var(--solid-ink)' }}
                        />
                        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 14.5 }}>
                          {correct
                            ? '正解！'
                            : `正解は ${GRAMMAR_CHOICE_LABELS[question.correctIndex]} 「${question.choices[question.correctIndex]}」`}
                        </span>
                      </div>
                      <p style={{ margin: '10px 0 0', fontSize: 13.5, lineHeight: 1.9 }}>{question.explanation}</p>
                    </div>
                  )}

                  {answered && (
                    <div style={{ marginTop: 18 }}>
                      <DesktopButton variant="dark" icon="arrow_forward" onClick={onNext}>
                        {index + 1 >= totalQuestions ? '結果を見る' : '次の問題へ'}
                      </DesktopButton>
                    </div>
                  )}
                </>
              ) : null}
            </div>

            <aside className="ds-card" style={{ padding: 20 }}>
              <div className="mono muted" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em' }}>PROGRESS</div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, marginTop: 6 }}>
                {finished ? totalQuestions : Math.min(index + 1, totalQuestions)} / {totalQuestions}
              </div>
              <div className="ds-prog" style={{ marginTop: 10 }}>
                <div className="fi" style={{ width: `${totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0}%` }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, fontSize: 12.5 }}>
                <span>正解</span>
                <span className="tnum" style={{ fontWeight: 700, color: 'var(--color-accent)' }}>{correctCount}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12.5 }}>
                <span>不正解</span>
                <span className="tnum" style={{ fontWeight: 700, color: '#d33' }}>{answeredCount - correctCount}</span>
              </div>
              {!finished && question?.grammarPoint && (
                <div style={{ marginTop: 16 }}>
                  <div className="mono muted" style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em' }}>GRAMMAR POINT</div>
                  <span className="ds-chip" style={{ marginTop: 6, cursor: 'default' }}>{question.grammarPoint}</span>
                </div>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
