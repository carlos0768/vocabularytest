'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[var(--color-background)]">
      <header className="sticky top-0 bg-[var(--color-background)]/95 z-40 px-6 py-4">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <Link href="/settings" className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors">
            <Icon name="arrow_back" size={20} className="text-[var(--color-foreground)]" />
          </Link>
          <h1 className="text-xl font-bold text-[var(--color-foreground)]">プライバシーポリシー</h1>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-6 py-8">
        <div className="card p-6 space-y-8 text-[var(--color-foreground)] leading-relaxed">
          <p className="text-sm text-[var(--color-muted)]">最終更新日: 2025年1月29日</p>

          <section className="space-y-3">
            <h2 className="text-lg font-bold">1. はじめに</h2>
            <p>
              MERKEN（以下「本サービス」）は、ユーザーのプライバシーを尊重し、個人情報の保護に努めます。本ポリシーは、本サービスにおける個人情報の取り扱いについて定めます。
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold">2. 収集する情報</h2>
            <p>本サービスでは以下の情報を収集します。</p>
            <ul className="list-disc list-inside space-y-2">
              <li><span className="font-medium">アカウント情報</span>: メールアドレス、パスワード（暗号化済み）</li>
              <li><span className="font-medium">学習データ</span>: 作成した単語帳、クイズの回答履歴、学習進捗</li>
              <li><span className="font-medium">アップロード画像</span>: 単語抽出のために送信された画像（処理後、サーバーには保存しません）</li>
              <li><span className="font-medium">決済情報</span>: 有料プラン利用時の決済情報（KOMOJUが処理し、本サービスではカード情報等を保持しません）</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold">3. 情報の利用目的</h2>
            <p>収集した情報は以下の目的で利用します。</p>
            <ul className="list-disc list-inside space-y-2">
              <li>サービスの提供・運営</li>
              <li>ユーザーの学習データの保存・同期</li>
              <li>サービスの改善・新機能の開発</li>
              <li>お問い合わせへの対応</li>
              <li>利用規約違反への対応</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold">4. 第三者サービス</h2>
            <p>本サービスでは以下の第三者サービスを利用しています。</p>
            <ul className="list-disc list-inside space-y-2">
              <li><span className="font-medium">Supabase</span>: 認証・データベース</li>
              <li><span className="font-medium">OpenAI</span>: 画像解析・単語抽出</li>
              <li><span className="font-medium">KOMOJU</span>: 決済処理</li>
              <li><span className="font-medium">Vercel</span>: ホスティング</li>
            </ul>
            <p>各サービスのプライバシーポリシーについては、各社のサイトをご確認ください。</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold">5. 画像データの取り扱い</h2>
            <p>
              ユーザーがアップロードした画像は、単語抽出処理のためにOpenAI APIに送信されます。処理完了後、画像データは本サービスのサーバーには保存されません。OpenAIのデータ取り扱いについてはOpenAIのプライバシーポリシーをご確認ください。
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold">6. データの保存</h2>
            <ul className="list-disc list-inside space-y-2">
              <li><span className="font-medium">無料プラン</span>: データはユーザーのブラウザ（IndexedDB）にローカル保存されます。サーバーには送信されません。</li>
              <li><span className="font-medium">Proプラン</span>: データはSupabase（クラウド）に保存され、デバイス間で同期されます。</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold">7. データの削除</h2>
            <p>
              ユーザーはいつでも自身のデータを削除できます。アカウント削除をご希望の場合は、お問い合わせください。アカウント削除時にはすべての関連データを削除します。
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold">8. セキュリティ</h2>
            <p>
              本サービスは、個人情報の漏洩・紛失を防ぐために適切なセキュリティ対策を講じています。通信はすべてSSL/TLSにより暗号化されています。
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold">9. ポリシーの変更</h2>
            <p>
              本ポリシーは必要に応じて改定することがあります。重要な変更がある場合は、サービス内で通知します。
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-bold">10. お問い合わせ</h2>
            <p>
              プライバシーに関するお問い合わせは、
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
