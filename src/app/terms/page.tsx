'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <header className="sticky top-0 bg-[var(--color-background)]/95 z-40 px-6 py-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Link href="/settings" className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
            <Icon name="arrow_back" size={20} className="text-[var(--color-foreground)]" />
          </Link>
          <h1 className="text-xl font-bold text-[var(--color-foreground)]">利用規約</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-6 py-8">
        <div className="card p-6 space-y-8 text-[var(--color-foreground)] leading-relaxed">
          <p className="text-sm text-[var(--color-muted)]">最終更新日: 2025年1月29日</p>

          <section className="space-y-3">
            <h2 className="text-lg font-bold">第1条（適用）</h2>
            <p>
              本規約は、MERKEN（以下「本サービス」）の利用に関する条件を定めるものです。ユーザーは本規約に同意の上、本サービスを利用するものとします。
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold">第2条（サービス内容）</h2>
            <p>
              本サービスは、画像から英単語を抽出し、日本語訳とクイズを自動生成する学習支援サービスです。AI技術を利用しているため、抽出結果や翻訳の正確性を完全に保証するものではありません。
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold">第3条（アカウント）</h2>
            <ol className="list-decimal list-inside space-y-2">
              <li>ユーザーは正確な情報を登録するものとします。</li>
              <li>アカウントの管理はユーザーの責任とします。</li>
              <li>アカウントの第三者への譲渡・貸与は禁止します。</li>
            </ol>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold">第4条（有料プラン）</h2>
            <ol className="list-decimal list-inside space-y-2">
              <li>有料プラン（Proプラン）は月額課金制です。</li>
              <li>支払いはKOMOJUを通じて処理されます。</li>
              <li>解約はいつでも可能です。解約後も当月末まで利用できます。</li>
              <li>返金は原則として行いません。</li>
            </ol>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold">第5条（禁止事項）</h2>
            <p>以下の行為を禁止します。</p>
            <ul className="list-disc list-inside space-y-2">
              <li>法令または公序良俗に違反する行為</li>
              <li>サービスの運営を妨害する行為</li>
              <li>不正アクセスまたはそれを試みる行為</li>
              <li>他のユーザーに迷惑をかける行為</li>
              <li>本サービスを商業目的で無断利用する行為</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold">第6条（知的財産権）</h2>
            <p>
              本サービスに関する知的財産権は運営者に帰属します。ユーザーがアップロードした画像・データの権利はユーザーに帰属します。
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold">第7条（免責事項）</h2>
            <ol className="list-decimal list-inside space-y-2">
              <li>AI による抽出・翻訳結果の正確性は保証しません。</li>
              <li>サービスの中断・停止による損害について責任を負いません。</li>
              <li>ユーザー間または第三者とのトラブルについて責任を負いません。</li>
            </ol>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold">第8条（サービスの変更・終了）</h2>
            <p>
              運営者は、事前の通知なくサービス内容の変更または終了を行うことがあります。
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold">第9条（準拠法・管轄）</h2>
            <p>
              本規約は日本法に準拠し、紛争が生じた場合は東京地方裁判所を第一審の専属的合意管轄裁判所とします。
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold">第10条（お問い合わせ）</h2>
            <p>
              本規約に関するお問い合わせは、
              <a href="mailto:support@scanvocab.app" className="text-[var(--color-primary)] font-medium">
                support@scanvocab.app
              </a>
              までご連絡ください。
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
