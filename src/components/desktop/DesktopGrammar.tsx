'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { DesktopButton, DesktopTopbar } from '@/components/desktop/DesktopChrome';
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
