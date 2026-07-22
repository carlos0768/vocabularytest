'use client';

import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';

// ChatGPT連携(Custom GPT経由の単語追加)のユーザー向け使い方ガイド。
// お知らせフィードからの導線先として使う静的ページ。ログイン不要で閲覧可能。
// 公式GPTのURLは NEXT_PUBLIC_CHATGPT_GPT_URL で注入する(未設定ならボタン非表示)。

const GPT_URL = process.env.NEXT_PUBLIC_CHATGPT_GPT_URL ?? '';

const FEATURES = [
  {
    icon: 'chat',
    title: '会話からそのまま追加',
    description: 'ChatGPTとの会話中に「この単語MERKENに追加して」と頼むだけで、あなたの単語帳に登録されます。',
  },
  {
    icon: 'auto_awesome',
    title: '訳・例文・クイズまでセット',
    description: '日本語訳・例文・4択クイズ用の選択肢もChatGPTが用意した状態で保存されます。',
  },
  {
    icon: 'sync',
    title: 'アプリに自動で反映',
    description: '追加した単語は、次にMERKENを開いたとき(または画面の再読み込み時)に単語帳へ同期されます。',
  },
];

const STEPS = [
  {
    title: 'Proプランに加入する',
    description: 'ChatGPT連携での単語追加はPro限定機能です。Freeプランの方は先にアップグレードしてください。',
  },
  {
    title: 'MERKEN公式GPTを開く',
    description: 'ChatGPTアプリ(iPhone / Android / Web)で、下のボタンからMERKEN公式GPTを開きます。ChatGPTのアカウントが必要です。',
  },
  {
    title: 'MERKENアカウントで接続する',
    description: '初回に単語追加を頼むと「Sign in to www.merken.jp」ボタンが表示されます。タップしてMERKENにログインし、同意画面で「許可する」を選ぶと接続完了です。',
  },
  {
    title: '会話の中で追加を頼む',
    description: 'あとは普通に会話するだけ。気になった単語が出てきたら、その場で追加を頼めます。',
  },
];

const EXAMPLE_PHRASES = [
  '「resilientをMERKENに追加して」',
  '「今の会話に出てきた単語を全部追加して」',
  '「この記事の重要単語を10個選んで単語帳に入れて」',
];

const FAQS = [
  {
    q: '追加した単語がアプリに表示されません',
    a: 'アプリを開き直すか、画面を再読み込みすると同期されます。それでも表示されない場合は、ChatGPT側でどの単語帳に追加したかを確認してください。',
  },
  {
    q: 'Freeプランでも使えますか？',
    a: '接続まではできますが、単語の追加はPro限定です。追加時にアップグレードのご案内が表示されます。',
  },
  {
    q: '接続を解除したいときは？',
    a: 'ChatGPT側の設定(GPTのプロフィール → プライバシー設定)からいつでも接続を解除できます。',
  },
  {
    q: 'どんな権限を渡すことになりますか？',
    a: '接続すると、ChatGPTはあなたのMERKENアカウントに「ログイン中のあなたと同等」のアクセス権を持ちます。詳しくは接続時の同意画面をご確認ください。',
  },
];

export default function ChatGptTipsPage() {
  const router = useRouter();

  return (
    <div className="relative mx-auto min-h-screen w-full max-w-[560px] bg-[var(--color-background)] px-[18px] pb-12 pt-[calc(env(safe-area-inset-top,0px)+12px)] font-[var(--font-body)]">
      {/* Header */}
      <div className="pb-3.5 pt-1">
        <div className="mb-0.5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-[38px] w-[38px] items-center justify-center rounded-[19px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
            aria-label="戻る"
          >
            <Icon name="chevron_left" size={16} />
          </button>
          <div className="font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">TIPS / CHATGPT</div>
        </div>
        <div className="mt-1.5 font-display text-2xl font-extrabold leading-[1.15] tracking-[-0.02em] text-[var(--solid-ink)]">
          ChatGPT連携の使い方
        </div>
        <div className="mt-1.5 font-mono text-[10px] tracking-[0.02em] text-[var(--color-muted)]">
          CHATGPT INTEGRATION · 会話から単語帳に追加
        </div>
      </div>

      {/* Intro */}
      <div className="pb-4">
        <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-[#faf7f1] p-[12px_14px]">
          <p className="m-0 text-[12px] leading-[1.8] text-[var(--solid-ink)]">
            ChatGPTとの会話に出てきた英単語を、そのままMERKENの単語帳に追加できます。
            調べものや英語の質問のついでに、気になった単語をためていきましょう。
          </p>
        </div>
      </div>

      {/* できること */}
      <div className="pb-4">
        <div className="mb-2 font-display text-base font-extrabold text-[var(--solid-ink)]">できること</div>
        <div className="flex flex-col gap-2.5">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="flex items-start gap-3 rounded-xl border-2 border-[var(--solid-ink)] bg-white p-[12px_14px]">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border-2 border-[var(--solid-ink)] bg-[#faf7f1] text-[var(--solid-ink)]">
                <Icon name={feature.icon} size={18} />
              </span>
              <div>
                <div className="text-[13px] font-bold text-[var(--solid-ink)]">{feature.title}</div>
                <p className="m-0 mt-1 text-[11.5px] leading-[1.7] text-[var(--solid-ink)]">{feature.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* はじめかた */}
      <div className="pb-4">
        <div className="mb-2 font-display text-base font-extrabold text-[var(--solid-ink)]">はじめかた</div>
        <div className="flex flex-col gap-2.5">
          {STEPS.map((step, index) => (
            <div key={step.title} className="flex items-start gap-3 rounded-xl border-2 border-[var(--solid-ink)] bg-white p-[12px_14px]">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] font-mono text-[12px] font-bold text-white">
                {index + 1}
              </span>
              <div>
                <div className="text-[13px] font-bold text-[var(--solid-ink)]">{step.title}</div>
                <p className="m-0 mt-1 text-[11.5px] leading-[1.7] text-[var(--solid-ink)]">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 頼み方の例 */}
      <div className="pb-4">
        <div className="mb-2 font-display text-base font-extrabold text-[var(--solid-ink)]">頼み方の例</div>
        <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white p-[12px_14px]">
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {EXAMPLE_PHRASES.map((phrase) => (
              <li key={phrase} className="flex items-start gap-2 text-[12px] leading-[1.7] text-[var(--solid-ink)]">
                <span className="mt-[7px] inline-block h-[6px] w-[6px] shrink-0 bg-[var(--color-accent)]" />
                {phrase}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* よくある質問 */}
      <div className="pb-6">
        <div className="mb-2 font-display text-base font-extrabold text-[var(--solid-ink)]">よくある質問</div>
        <div className="flex flex-col gap-2.5">
          {FAQS.map((faq) => (
            <div key={faq.q} className="rounded-xl border-2 border-[var(--solid-ink)] bg-white p-[12px_14px]">
              <div className="text-[12.5px] font-bold text-[var(--solid-ink)]">Q. {faq.q}</div>
              <p className="m-0 mt-1.5 text-[11.5px] leading-[1.7] text-[var(--solid-ink)]">A. {faq.a}</p>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="flex flex-col gap-3">
        {GPT_URL ? (
          <a
            href={GPT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-12 items-center justify-center rounded-xl border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] font-bold text-white transition-all duration-100 active:translate-x-px active:translate-y-px"
          >
            MERKEN公式GPTを開く
          </a>
        ) : null}
        <a
          href="/subscription"
          className="flex h-12 items-center justify-center rounded-xl border-2 border-[var(--solid-ink)] bg-white font-bold text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
        >
          Proプランを見る
        </a>
      </div>
    </div>
  );
}
