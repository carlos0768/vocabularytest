'use client';

import { useRouter } from 'next/navigation';
import { DesktopLegalDocView } from '@/components/desktop/DesktopSupport';
import { LegalDocBody, SupportMobileFrame } from '@/components/support/SupportDoc';

const UPDATED = '2026年2月24日';

const INTRO =
  'MERKEN（以下「本サービス」）は、ユーザーのプライバシーを尊重し、個人情報の保護に努めます。本ポリシーは、本サービスにおける個人情報の取り扱いについて定めます。';

const ARTICLES = [
  { h: '収集する情報', p: ['本サービスの提供にあたり、以下の情報を取得します。'], list: ['アカウント情報（メールアドレス、パスワード〈暗号化済み〉）', '学習データ（作成した単語帳、クイズの回答履歴、学習進捗）', 'アップロード画像（単語抽出のために送信された画像。処理後、サーバーには保存しません）', '決済情報（有料プラン利用時。Stripeが処理し、本サービスではカード情報等を保持しません）'] },
  { h: '利用目的', p: ['取得した情報は、以下の目的のために利用します。'], list: ['サービスの提供・運営・改善', 'ユーザーの学習データの保存・同期', 'お問い合わせへの対応', '利用規約違反への対応', '統計データの作成（個人を特定できない形に加工）'] },
  { h: '第三者サービス', p: ['本サービスでは、認証・データベース・AI抽出・決済・ホスティング・広告配信のため第三者サービスを利用します。各サービスのプライバシーポリシーについては、各社のサイトをご確認ください。'], list: ['Supabase — 認証・データベース', 'Google (Gemini 2.5 Flash) — 画像OCR・単語抽出', 'OpenAI — クイズ生成・例文生成', 'Stripe — 決済処理', 'Vercel — ホスティング', 'Google AdSense — 広告配信'] },
  { h: '画像データの取り扱い', p: ['ユーザーがアップロードした画像は、単語抽出処理のためにGoogle Gemini APIに送信されます。処理完了後、画像データは本サービスのサーバーには保存されません。'] },
  { h: 'データの保存', list: ['無料プラン: データはユーザーのブラウザ（IndexedDB）にローカル保存されます。サーバーには送信されません。', 'Proプラン: データはSupabase（クラウド）に保存され、デバイス間で同期されます。'] },
  { h: 'Cookie・類似技術', p: [
    '本サービスでは、ログイン状態の維持や利用状況の分析のためCookieおよびローカルストレージを使用します。ブラウザの設定によりこれらを無効化できますが、一部機能が利用できなくなる場合があります。',
    '本サービスでは、Googleを含む第三者配信事業者による広告を掲載することがあります。第三者配信事業者は、Cookieを使用して、ユーザーの本サイトや他のウェブサイトへの過去のアクセス情報に基づいた広告を配信します。',
    'ユーザーは、Googleの広告設定（https://adssettings.google.com/）でパーソナライズ広告を無効にできます。また、www.aboutads.info にアクセスすると、パーソナライズ広告に使用される第三者配信事業者のCookieを無効にできます。',
  ] },
  { h: 'データの削除', p: ['ユーザーはいつでも自身のデータを削除できます。アカウント削除をご希望の場合は、お問い合わせください。アカウント削除時にはすべての関連データを削除します。'] },
  { h: 'セキュリティ', p: ['本サービスは、個人情報の漏洩・紛失を防ぐために適切なセキュリティ対策を講じています。通信はすべてSSL/TLSにより暗号化されています。'] },
  { h: 'ポリシーの変更', p: ['本ポリシーは必要に応じて改定することがあります。重要な変更がある場合は、サービス内で通知します。'] },
  { h: 'お問い合わせ', p: ['本ポリシーに関するお問い合わせは support@merken.jp までご連絡ください。'] },
];

export default function PrivacyPage() {
  const router = useRouter();

  return (
    <>
      <DesktopLegalDocView
        title="プライバシーポリシー"
        updated={UPDATED}
        intro={INTRO}
        articles={ARTICLES}
        onBack={() => router.back()}
      />
      <SupportMobileFrame title="プライバシーポリシー" eyebrow="PRIVACY POLICY" onBack={() => router.back()}>
        <LegalDocBody intro={INTRO} articles={ARTICLES} updated={UPDATED} />
      </SupportMobileFrame>
    </>
  );
}
