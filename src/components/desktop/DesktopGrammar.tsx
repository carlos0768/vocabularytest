'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { DesktopButton, DesktopDonut, DesktopSearchBox, DesktopTopbar } from '@/components/desktop/DesktopChrome';
import { desktopUpdatedLabel } from '@/components/desktop/desktop-data';

// 語法問題集(Vintage型)一覧のデスクトップビュー。
// DesktopProjectsView と同じ ds-card / ds-table ベースの構成。

export type GrammarBook = {
  id: string;
  title: string;
  updatedAt: string;
  isFavorite: boolean;
  questionCount: number;
  masteredCount: number;
};

// 習得度(%): 習得済み問題 / 全問題
export function grammarMasteryPercent(book: Pick<GrammarBook, 'questionCount' | 'masteredCount'>): number {
  return book.questionCount > 0 ? Math.round((book.masteredCount / book.questionCount) * 100) : 0;
}

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
  /** 復習モード (grammar-misses 由来) のときのみ入る所属問題集ID */
  bookId?: string;
};

export const GRAMMAR_CHOICE_LABELS = ['A', 'B', 'C', 'D'] as const;

// ChatGPTに貼り付けて質問するための文章を組み立てる (モバイル/デスクトップ共用)。
// 回答後に使う想定なので正解と (誤答時は) 自分の答えも含める。
export function buildGrammarChatGptPrompt(
  question: GrammarPracticeQuestion,
  selectedIndex: number | null,
): string {
  const lines = [
    '以下の英語の語法問題について解説してください。',
    '',
    '【問題】',
    question.sentence,
    '',
    '【選択肢】',
    ...question.choices.map((choice, index) => `${GRAMMAR_CHOICE_LABELS[index]}. ${choice}`),
    '',
    `【正解】${GRAMMAR_CHOICE_LABELS[question.correctIndex]}. ${question.choices[question.correctIndex]}`,
  ];
  if (selectedIndex !== null && selectedIndex !== question.correctIndex) {
    lines.push(`【自分の答え】${GRAMMAR_CHOICE_LABELS[selectedIndex]}. ${question.choices[selectedIndex]}`);
  }
  if (question.grammarPoint) {
    lines.push(`【文法項目】${question.grammarPoint}`);
  }
  lines.push(
    '',
    '正解になる理由と、他の選択肢が不正解になる理由をわかりやすく教えてください。',
  );
  return lines.join('\n');
}

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

// 単語帳一覧(DesktopProjectsView)と同じ ds-table + 右サマリーの2カラム構成。
export function DesktopGrammarBooksView({
  state,
  gptUrl,
  query,
  filter,
  sharingBookId,
  sharedBookId,
  onQueryChange,
  onFilterChange,
  onShare,
  onToggleFavorite,
  onCreateManual,
}: {
  state: GrammarBooksLoadState;
  gptUrl: string;
  query: string;
  filter: 'all' | 'fav';
  sharingBookId: string | null;
  sharedBookId: string | null;
  onQueryChange: (value: string) => void;
  onFilterChange: (value: 'all' | 'fav') => void;
  onShare: (bookId: string) => void;
  onToggleFavorite: (bookId: string, next: boolean) => void;
  onCreateManual: () => void;
}) {
  const allBooks = state.kind === 'ready' ? state.books : [];
  const normalizedQuery = query.trim().toLowerCase();
  const rows = allBooks
    .filter((book) => (filter === 'fav' ? book.isFavorite : true))
    .filter((book) => (normalizedQuery ? book.title.toLowerCase().includes(normalizedQuery) : true));
  const totalQuestions = allBooks.reduce((sum, book) => sum + book.questionCount, 0);
  const totalMastered = allBooks.reduce((sum, book) => sum + book.masteredCount, 0);
  const overallPct = totalQuestions > 0 ? Math.round((totalMastered / totalQuestions) * 100) : 0;

  return (
    <div className="hidden h-full min-h-0 flex-col lg:flex">
      <DesktopTopbar title="語法問題集" crumb="文法・語法 / 空欄補充・英語4択">
        <DesktopSearchBox
          placeholder="問題集を検索"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        <DesktopButton icon="edit" onClick={onCreateManual} title="手動で問題集を作る">
          手動で作成
        </DesktopButton>
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

      <div className="ds-scroll" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 24, alignItems: 'start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <button type="button" className={'ds-chip' + (filter === 'all' ? ' active' : '')} onClick={() => onFilterChange('all')}>
              すべて <span className="tnum" style={{ opacity: 0.7 }}>{allBooks.length}</span>
            </button>
            <button type="button" className={'ds-chip' + (filter === 'fav' ? ' active' : '')} onClick={() => onFilterChange('fav')}>
              <Icon name="bookmark" filled style={{ fontSize: 15 }} />保存
            </button>
            <div style={{ flex: 1 }} />
            <span className="mono muted" style={{ fontSize: 12 }}>合計 {totalQuestions} 問</span>
          </div>

          {state.kind === 'loading' && (
            <div className="ds-card muted" style={{ padding: 50, textAlign: 'center', fontSize: 13 }}>
              <Icon name="progress_activity" className="animate-spin" style={{ marginRight: 8 }} />
              読み込み中...
            </div>
          )}

          {state.kind === 'pro-required' && (
            <div className="ds-card" style={{ padding: 24 }}>
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

          {state.kind === 'ready' && (
            <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="ds-table">
                <thead>
                  <tr>
                    <th style={{ width: 42 }} />
                    <th>問題集</th>
                    <th style={{ width: 80 }}>問題数</th>
                    <th style={{ width: 200 }}>習得度</th>
                    <th style={{ width: 90 }}>更新</th>
                    <th style={{ width: 90 }}>共有</th>
                    <th style={{ width: 110 }} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((book) => {
                    const pct = grammarMasteryPercent(book);
                    return (
                      <tr key={book.id}>
                        <td className="star">
                          <button
                            type="button"
                            onClick={() => onToggleFavorite(book.id, !book.isFavorite)}
                            aria-label={book.isFavorite ? '保存を解除' : '保存する'}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 0 }}
                          >
                            <Icon
                              name="bookmark"
                              filled={book.isFavorite}
                              style={book.isFavorite ? { color: 'var(--color-accent)' } : { color: 'var(--color-muted)' }}
                            />
                          </button>
                        </td>
                        <td>
                          {/* 行タップは問題一覧へ (演習は右の「演習する」から) */}
                          <Link href={`/grammar/${book.id}/list`} style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}>
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
                        <td className="tnum" style={{ fontWeight: 700 }}>{book.questionCount}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <div className="ds-prog" style={{ flex: 1 }}>
                              <div className="fi" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="mono tnum" style={{ fontSize: 11, fontWeight: 700, width: 30 }}>{pct}%</span>
                          </div>
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
                    );
                  })}
                </tbody>
              </table>
              {rows.length === 0 && (
                <div className="muted" style={{ textAlign: 'center', padding: 50, fontSize: 13 }}>
                  {allBooks.length === 0
                    ? 'ChatGPTで「仮定法の語法問題を10問作って」のように頼むと、ここに問題集が保存されます。'
                    : filter === 'fav'
                      ? '保存した問題集はありません'
                      : '一致する問題集がありません'}
                </div>
              )}
            </div>
          )}
          {sharedBookId && (
            <p className="mono" style={{ fontSize: 11.5, color: 'var(--color-accent)', fontWeight: 700, marginTop: 10 }}>
              共有リンクをコピーしました
            </p>
          )}
        </div>

        <aside className="ds-card" style={{ padding: 20 }}>
          <div className="mono muted" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.08em' }}>MASTERY</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 12 }}>
            <DesktopDonut mastered={totalMastered} review={totalQuestions - totalMastered} total={totalQuestions} percent={overallPct} size={92} stroke={13} />
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20 }}>{totalMastered} / {totalQuestions}</div>
              <div className="muted" style={{ fontSize: 12 }}>習得済み問題</div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, fontSize: 12.5 }}>
            <span>問題集</span>
            <span className="tnum" style={{ fontWeight: 700 }}>{allBooks.length}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12.5 }}>
            <span>保存</span>
            <span className="tnum" style={{ fontWeight: 700 }}>{allBooks.filter((book) => book.isFavorite).length}</span>
          </div>
        </aside>
      </div>
    </div>
  );
}

// 語法演習のデスクトップビュー。問題は中央1カラム、下部にスキップ/次への
// ボトムバー。ヘッダ左端に戻る(左矢印のみ)を置く。
export function DesktopGrammarPracticeView({
  loadState,
  totalQuestions,
  index,
  question,
  selected,
  finished,
  correctCount,
  wrongGrammarPoints,
  chatGptCopied,
  title = '語法演習',
  emptyMessage,
  onSelect,
  onNext,
  onSkip,
  onRetry,
  onAskChatGpt,
}: {
  loadState: { kind: 'loading' } | { kind: 'pro-required' } | { kind: 'error'; message: string } | { kind: 'ready' };
  title?: string;
  emptyMessage?: string;
  totalQuestions: number;
  index: number;
  question: GrammarPracticeQuestion | undefined;
  selected: number | null;
  finished: boolean;
  correctCount: number;
  wrongGrammarPoints: string[];
  chatGptCopied: boolean;
  onSelect: (choiceIndex: number) => void;
  onNext: () => void;
  onSkip: () => void;
  onRetry: () => void;
  onAskChatGpt: () => void;
}) {
  const answered = selected !== null;
  const correct = answered && question ? selected === question.correctIndex : false;
  const showBottomBar = loadState.kind === 'ready' && totalQuestions > 0 && !finished && !!question;

  return (
    <div className="hidden h-full min-h-0 flex-col lg:flex">
      {/* ヘッダ: 左端に戻る(左矢印のみ)、中央にタイトルと進捗 */}
      <div className="ds-top">
        <Link href="/grammar" className="ds-btn ghost ds-btn--icon" title="一覧へ戻る" aria-label="一覧へ戻る">
          <Icon name="arrow_back" />
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="crumb">
            {title}{totalQuestions > 0 && !finished ? ` / ${Math.min(index + 1, totalQuestions)} of ${totalQuestions}` : ''}
          </div>
          <h1>{question?.grammarPoint && !finished ? question.grammarPoint : title}</h1>
        </div>
      </div>

      <div className="ds-scroll" style={{ flex: 1, minHeight: 0 }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          {loadState.kind === 'loading' && (
            <div className="ds-card muted" style={{ padding: 50, textAlign: 'center', fontSize: 13 }}>
              <Icon name="progress_activity" className="animate-spin" style={{ marginRight: 8 }} />
              読み込み中...
            </div>
          )}

          {loadState.kind === 'pro-required' && (
            <div className="ds-card" style={{ padding: 24 }}>
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
            <div className="ds-card" style={{ padding: 24, color: 'var(--color-error)', borderColor: 'var(--color-error)', fontSize: 13 }}>
              {loadState.message}
            </div>
          )}

          {loadState.kind === 'ready' && totalQuestions === 0 && (
            <div className="ds-card" style={{ padding: 40, textAlign: 'center' }}>
              <p className="muted" style={{ fontSize: 13, lineHeight: 1.8, margin: 0 }}>
                {emptyMessage ?? 'この問題集にはまだ問題がありません。ChatGPTで問題を追加してください。'}
              </p>
            </div>
          )}

          {loadState.kind === 'ready' && finished && (
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
          )}

          {loadState.kind === 'ready' && !finished && question && (
            <>
              <div className="ds-card" style={{ padding: '26px 30px' }}>
                <p style={{ margin: 0, fontSize: 19, lineHeight: 2.1, textAlign: 'center' }}>{renderGrammarSentence(question.sentence)}</p>
                {question.sentenceJa && answered && (
                  <p className="muted" style={{ margin: '10px 0 0', fontSize: 13, lineHeight: 1.8, textAlign: 'center' }}>{question.sentenceJa}</p>
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
                  <div style={{ marginTop: 14 }}>
                    <DesktopButton
                      icon={chatGptCopied ? 'check' : 'smart_toy'}
                      onClick={onAskChatGpt}
                      title="この問題についてChatGPTに質問する文章をコピー"
                    >
                      {chatGptCopied ? 'コピーしました！ChatGPTに貼り付けて質問できます' : 'ChatGPTに質問する'}
                    </DesktopButton>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ボトムバー: スキップ / 次へ を並列で配置 */}
      {showBottomBar && (
        <div
          style={{
            borderTop: '1px solid var(--color-border)',
            background: 'var(--color-surface, #fff)',
            padding: '14px 24px',
          }}
        >
          <div style={{ display: 'flex', gap: 12, maxWidth: 680, margin: '0 auto' }}>
            <button
              type="button"
              className="ds-btn ghost"
              onClick={onSkip}
              disabled={answered}
              style={{ flex: 1, justifyContent: 'center', opacity: answered ? 0.4 : 1, cursor: answered ? 'not-allowed' : 'pointer' }}
            >
              <Icon name="skip_next" />
              スキップ
            </button>
            <button
              type="button"
              className="ds-btn dark"
              onClick={onNext}
              disabled={!answered}
              style={{ flex: 1, justifyContent: 'center', opacity: answered ? 1 : 0.4, cursor: answered ? 'pointer' : 'not-allowed' }}
            >
              {index + 1 >= totalQuestions ? '結果を見る' : '次へ'}
              <Icon name="arrow_forward" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// 問題一覧のデスクトップビュー。問題文と文法項目を一覧表示し、
// 行クリックで単語詳細と同じフローティングモーダルに正解・解説を出す。
export function DesktopGrammarQuestionListView({
  loadState,
  bookId,
  questions,
  selectedIndex,
  onSelectQuestion,
  onCloseDetail,
  onNavDetail,
  onAddQuestion,
}: {
  loadState: { kind: 'loading' } | { kind: 'pro-required' } | { kind: 'error'; message: string } | { kind: 'ready' };
  bookId: string;
  questions: GrammarPracticeQuestion[];
  selectedIndex: number | null;
  onSelectQuestion: (index: number) => void;
  onCloseDetail: () => void;
  onNavDetail: (dir: -1 | 1) => void;
  onAddQuestion?: () => void;
}) {
  const selectedQuestion = selectedIndex !== null ? questions[selectedIndex] : undefined;

  return (
    <div className="hidden h-full min-h-0 flex-col lg:flex">
      <DesktopTopbar
        title="問題一覧"
        crumb="文法・語法 / 問題リスト"
        leading={
          <DesktopButton variant="ghost" icon="arrow_back" href="/grammar" title="一覧へ戻る">
            {''}
          </DesktopButton>
        }
      >
        {onAddQuestion && (
          <DesktopButton icon="add" onClick={onAddQuestion} title="問題を手動で追加">
            問題を追加
          </DesktopButton>
        )}
        <DesktopButton variant="dark" icon="play_arrow" href={`/grammar/${bookId}`}>
          演習する
        </DesktopButton>
      </DesktopTopbar>

      <div className="ds-scroll">
        {loadState.kind === 'loading' && (
          <div className="ds-card muted" style={{ padding: 50, textAlign: 'center', fontSize: 13, maxWidth: 760, margin: '0 auto' }}>
            <Icon name="progress_activity" className="animate-spin" style={{ marginRight: 8 }} />
            読み込み中...
          </div>
        )}

        {loadState.kind === 'pro-required' && (
          <div className="ds-card" style={{ padding: 24, maxWidth: 560, margin: '0 auto' }}>
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
          <div className="ds-card" style={{ padding: 24, maxWidth: 560, margin: '0 auto', color: 'var(--color-error)', borderColor: 'var(--color-error)', fontSize: 13 }}>
            {loadState.message}
          </div>
        )}

        {loadState.kind === 'ready' && questions.length === 0 && (
          <div className="ds-card" style={{ padding: 40, textAlign: 'center', maxWidth: 760, margin: '0 auto' }}>
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.8, margin: 0 }}>
              この問題集にはまだ問題がありません。ChatGPTで問題を追加してください。
            </p>
          </div>
        )}

        {loadState.kind === 'ready' && questions.length > 0 && (
          <div style={{ maxWidth: 760, margin: '0 auto' }}>
            <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="ds-table">
                <thead>
                  <tr>
                    <th style={{ width: 52 }}>#</th>
                    <th>問題</th>
                    <th style={{ width: 170 }}>Grammar Point</th>
                  </tr>
                </thead>
                <tbody>
                  {questions.map((question, questionIndex) => (
                    <tr
                      key={question.id}
                      onClick={() => onSelectQuestion(questionIndex)}
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="mono" style={{ fontSize: 12, color: 'var(--color-muted)' }}>{questionIndex + 1}</td>
                      <td style={{ fontSize: 14, lineHeight: 1.9 }}>{renderGrammarSentence(question.sentence)}</td>
                      <td>
                        {question.grammarPoint ? (
                          <span className="ds-chip" style={{ cursor: 'pointer' }}>{question.grammarPoint}</span>
                        ) : (
                          <span className="muted" style={{ fontSize: 12 }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {selectedQuestion && selectedIndex !== null && (
        <div className="ds-overlay" onClick={onCloseDetail}>
          <div className="ds-modal" onClick={(event) => event.stopPropagation()}>
            <div className="ds-modal-head">
              <div className="lab">問題 {selectedIndex + 1} / {questions.length}</div>
              <div className="nav">
                {questions.length > 1 && (
                  <>
                    <button type="button" className="ds-iconbtn" onClick={() => onNavDetail(-1)} aria-label="前の問題">
                      <Icon name="chevron_left" />
                    </button>
                    <button type="button" className="ds-iconbtn" onClick={() => onNavDetail(1)} aria-label="次の問題">
                      <Icon name="chevron_right" />
                    </button>
                  </>
                )}
                <button type="button" className="ds-iconbtn" onClick={onCloseDetail} aria-label="閉じる">
                  <Icon name="close" />
                </button>
              </div>
            </div>
            <div className="ds-modal-body">
              <GrammarQuestionDetailBody question={selectedQuestion} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 問題詳細 (正解・解説) の本文。デスクトップのモーダルとモバイルの
// フローティングカードの両方から使う。
export function GrammarQuestionDetailBody({ question }: { question: GrammarPracticeQuestion }) {
  return (
    <>
      <div>
        <p style={{ margin: 0, fontSize: 16.5, lineHeight: 2 }}>{renderGrammarSentence(question.sentence)}</p>
        {question.sentenceJa && (
          <p className="muted" style={{ margin: '8px 0 0', fontSize: 12.5, lineHeight: 1.8 }}>{question.sentenceJa}</p>
        )}
        {question.grammarPoint && (
          <div style={{ marginTop: 10 }}>
            <span className="ds-chip" style={{ cursor: 'default' }}>{question.grammarPoint}</span>
          </div>
        )}
      </div>

      {/* 4択は出さず正解だけ表示する (一覧は答えの確認用) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 14px',
          borderRadius: 12,
          border: '2px solid var(--color-accent)',
          background: 'var(--color-accent-light, #e8f5ec)',
        }}
      >
        <span className="mono" style={{ flexShrink: 0, fontSize: 10.5, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--color-accent)' }}>
          正解
        </span>
        <span style={{ fontWeight: 700, fontSize: 15, minWidth: 0, color: 'var(--solid-ink)' }}>
          {question.choices[question.correctIndex]}
        </span>
        <Icon name="check_circle" style={{ marginLeft: 'auto', color: 'var(--color-accent)' }} />
      </div>

      <div style={{ borderRadius: 12, border: '2px solid var(--solid-ink)', background: '#faf7f1', padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="school" style={{ fontSize: 16 }} />
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 13 }}>解説</span>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 13, lineHeight: 1.9 }}>{question.explanation}</p>
      </div>
    </>
  );
}
