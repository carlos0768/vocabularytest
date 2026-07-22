'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { usePageBackground } from '@/hooks/use-page-background';

/**
 * ChatGPT Custom GPT (GPT Actions) 向け OAuth 同意画面。
 * 未ログイン時は middleware が /login?redirect=... へ誘導する。
 * 承認/拒否の判断はサーバー側 (/api/oauth/authorize) で redirect_uri を
 * 許可リスト検証したうえでリダイレクト先 URL を受け取り遷移する。
 */

const PERMISSIONS = [
  '単語帳の一覧の取得と作成',
  '会話に出てきた単語の単語帳への追加',
];

function AuthorizeForm() {
  usePageBackground('#f3f0e9');

  const searchParams = useSearchParams();
  const clientId = searchParams.get('client_id') ?? '';
  const redirectUri = searchParams.get('redirect_uri') ?? '';
  const state = searchParams.get('state');
  const scope = searchParams.get('scope');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paramsMissing = clientId.length === 0 || redirectUri.length === 0;

  const submitDecision = async (decision: 'approve' | 'deny') => {
    if (submitting) return;
    setError(null);
    setSubmitting(true);

    try {
      const response = await fetch('/api/oauth/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          redirectUri,
          ...(state ? { state } : {}),
          ...(scope ? { scope } : {}),
          decision,
        }),
      });

      const payload = (await response.json()) as { success?: boolean; error?: string; redirectUrl?: string };
      if (!response.ok || !payload.success || !payload.redirectUrl) {
        setError(payload.error || '認可処理に失敗しました');
        setSubmitting(false);
        return;
      }

      window.location.href = payload.redirectUrl;
    } catch {
      setError('通信に失敗しました。もう一度お試しください。');
      setSubmitting(false);
    }
  };

  return (
    <div className="relative mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-[#f3f0e9] px-6 pt-[calc(env(safe-area-inset-top,0px)+40px)] [background-image:radial-gradient(rgba(26,26,26,0.045)_1px,transparent_1px)] [background-size:22px_22px]">
      <div className="pb-2 text-center">
        <div className="inline-block font-display text-[34px] font-black leading-none tracking-[0.1em] text-[var(--solid-ink)]">
          MERKEN
          <span className="ml-[5px] inline-block h-[7px] w-[7px] -translate-y-3 bg-[var(--color-accent)]" />
        </div>
      </div>

      <div className="mt-6 rounded-2xl border-2 border-[var(--solid-ink)] bg-white p-6">
        <h1 className="font-display text-xl font-extrabold leading-[1.3] text-[var(--solid-ink)]">
          ChatGPTにMERKENへの
          <br />
          アクセスを許可しますか？
        </h1>

        {paramsMissing ? (
          <p className="mt-4 text-sm leading-relaxed text-red-600">
            認可リクエストのパラメータが不足しています。ChatGPTからやり直してください。
          </p>
        ) : (
          <>
            <p className="mt-4 text-sm leading-relaxed text-[var(--solid-ink)]">
              許可すると、ChatGPTの会話からあなたのMERKENアカウントに対して次の操作ができるようになります。
            </p>
            <ul className="mt-3 space-y-2">
              {PERMISSIONS.map((permission) => (
                <li key={permission} className="flex items-start gap-2 text-sm text-[var(--solid-ink)]">
                  <span className="mt-[6px] inline-block h-[6px] w-[6px] shrink-0 bg-[var(--color-accent)]" />
                  {permission}
                </li>
              ))}
            </ul>
            <p className="mt-4 rounded-lg bg-[#f3f0e9] p-3 text-xs leading-relaxed text-[var(--solid-ink)]">
              ChatGPT経由の単語追加はPro限定機能です。Freeプランの場合、接続はできますが単語追加時にアップグレード案内が表示されます。
            </p>

            {error && (
              <p className="mt-4 text-sm text-red-600">{error}</p>
            )}

            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                onClick={() => submitDecision('approve')}
                disabled={submitting}
                className="h-12 rounded-xl border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] font-bold text-white transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-50"
              >
                {submitting ? '処理中...' : '許可する'}
              </button>
              <button
                type="button"
                onClick={() => submitDecision('deny')}
                disabled={submitting}
                className="h-12 rounded-xl border-2 border-[var(--solid-ink)] bg-white font-bold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px disabled:opacity-50"
              >
                許可しない
              </button>
            </div>
          </>
        )}
      </div>

      <p className="mt-4 pb-8 text-center text-xs text-[var(--color-muted,#6b6b6b)]">
        許可はいつでもChatGPT側の設定から取り消せます。
      </p>
    </div>
  );
}

export default function OAuthAuthorizePage() {
  return (
    <Suspense fallback={null}>
      <AuthorizeForm />
    </Suspense>
  );
}
