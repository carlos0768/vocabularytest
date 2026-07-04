'use client';

import { useRouter } from 'next/navigation';
import { DesktopLegalDocView } from '@/components/desktop/DesktopSupport';
import { Icon } from '@/components/ui/Icon';

const PRIVACY_ARTICLES = [
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
        updated="2026年2月24日"
        intro="MERKEN（以下「本サービス」）は、ユーザーのプライバシーを尊重し、個人情報の保護に努めます。本ポリシーは、本サービスにおける個人情報の取り扱いについて定めます。"
        toc={PRIVACY_ARTICLES.map((article) => article.h)}
        articles={PRIVACY_ARTICLES}
        onBack={() => router.back()}
      />
      <div className="relative min-h-screen bg-[var(--color-background)] pt-3 font-[var(--font-body)] lg:hidden">
      {/* Header */}
      <div className="px-[18px] pb-3.5 pt-1">
        <div className="mb-0.5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-[38px] w-[38px] items-center justify-center rounded-[19px] border-2 border-[var(--solid-ink)] bg-white text-[var(--solid-ink)] transition-all duration-100 active:translate-x-px active:translate-y-px"
          >
            <Icon name="chevron_left" size={16} />
          </button>
          <div className="font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">ACCOUNT / SUPPORT</div>
        </div>
        <div className="mt-1.5 font-display text-2xl font-extrabold leading-[1.15] tracking-[-0.02em] text-[var(--solid-ink)]">プライバシーポリシー</div>
        <div className="mt-1.5 font-mono text-[10px] tracking-[0.02em] text-[var(--color-muted)]">PRIVACY POLICY · 個人情報の取扱い</div>
      </div>

      {/* Intro */}
      <div className="px-[18px] pb-3.5">
        <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-[#faf7f1] p-[12px_14px]">
          <p className="m-0 text-[11px] leading-[1.75] text-[var(--solid-ink)]">
            MERKEN（以下「本サービス」）は、ユーザーのプライバシーを尊重し、個人情報の保護に努めます。本ポリシーは、本サービスにおける個人情報の取り扱いについて定めます。
          </p>
        </div>
      </div>

      <Section num="1" label="収集する情報">
        <OL items={[
          'アカウント情報（メールアドレス、パスワード〈暗号化済み〉）',
          '学習データ（作成した単語帳、クイズの回答履歴、学習進捗）',
          'アップロード画像（単語抽出のために送信された画像。処理後、サーバーには保存しません）',
          '決済情報（有料プラン利用時。Stripeが処理し、本サービスではカード情報等を保持しません）',
        ]} />
      </Section>

      <Section num="2" label="利用目的">
        <P>取得した情報は、以下の目的のために利用します。</P>
        <OL items={[
          'サービスの提供・運営・改善',
          'ユーザーの学習データの保存・同期',
          'お問い合わせへの対応',
          '利用規約違反への対応',
          '統計データの作成（個人を特定できない形に加工）',
        ]} />
      </Section>

      <Section num="3" label="第三者サービス">
        <P>本サービスでは以下の第三者サービスを利用しています。各サービスのプライバシーポリシーについては、各社のサイトをご確認ください。</P>
        <OL items={[
          'Supabase — 認証・データベース',
          'Google (Gemini 2.5 Flash) — 画像OCR・単語抽出',
          'OpenAI — クイズ生成・例文生成',
          'Stripe — 決済処理',
          'Vercel — ホスティング',
          'Google AdSense — 広告配信',
        ]} />
      </Section>

      <Section num="4" label="画像データの取り扱い">
        <P>ユーザーがアップロードした画像は、単語抽出処理のためにGoogle Gemini APIに送信されます。処理完了後、画像データは本サービスのサーバーには保存されません。</P>
      </Section>

      <Section num="5" label="データの保存">
        <OL items={[
          '無料プラン: データはユーザーのブラウザ（IndexedDB）にローカル保存されます。サーバーには送信されません。',
          'Proプラン: データはSupabase（クラウド）に保存され、デバイス間で同期されます。',
        ]} />
      </Section>

      <Section num="6" label="Cookie・類似技術">
        <P>本サービスでは、ログイン状態の維持や利用状況の分析のためCookieおよびローカルストレージを使用します。ブラウザの設定によりこれらを無効化できますが、一部機能が利用できなくなる場合があります。</P>
        <div className="mt-2" />
        <P>本サービスでは、Googleを含む第三者配信事業者による広告を掲載することがあります。第三者配信事業者は、Cookieを使用して、ユーザーの本サイトや他のウェブサイトへの過去のアクセス情報に基づいた広告を配信します。</P>
        <div className="mt-2" />
        <P>ユーザーは、Googleの広告設定（https://adssettings.google.com/）でパーソナライズ広告を無効にできます。また、www.aboutads.info にアクセスすると、パーソナライズ広告に使用される第三者配信事業者のCookieを無効にできます。</P>
      </Section>

      <Section num="7" label="データの削除">
        <P>ユーザーはいつでも自身のデータを削除できます。アカウント削除をご希望の場合は、お問い合わせください。アカウント削除時にはすべての関連データを削除します。</P>
      </Section>

      <Section num="8" label="セキュリティ">
        <P>本サービスは、個人情報の漏洩・紛失を防ぐために適切なセキュリティ対策を講じています。通信はすべてSSL/TLSにより暗号化されています。</P>
      </Section>

      <Section num="9" label="ポリシーの変更">
        <P>本ポリシーは必要に応じて改定することがあります。重要な変更がある場合は、サービス内で通知します。</P>
      </Section>

      <Section num="10" label="お問い合わせ">
        <div className="mt-1 rounded-lg border border-[var(--color-border)] bg-[#faf7f1] px-3 py-2.5">
          <div className="font-mono text-[9px] font-bold tracking-[0.08em] text-[var(--color-muted)]">CONTACT</div>
          <a href="mailto:support@merken.jp" className="mt-1 block font-mono text-xs text-[var(--color-accent)]">support@merken.jp</a>
        </div>
      </Section>

      <Footer updated="2026年2月24日" />
      </div>
    </>
  );
}

function Section({ num, label, children }: { num: string; label: string; children: React.ReactNode }) {
  return (
    <div className="px-[18px] pb-3">
      <div className="flex items-baseline gap-1.5 pb-1.5 pl-1 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
        <span className="text-[var(--solid-ink)]">§{num}</span>
        <span>{label}</span>
      </div>
      <div className="rounded-xl border-2 border-[var(--solid-ink)] bg-white p-[12px_14px]">
        {children}
      </div>
    </div>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return <p className="m-0 text-[11.5px] leading-[1.75] text-[var(--solid-ink)]">{children}</p>;
}

function OL({ items }: { items: string[] }) {
  return (
    <ol className="mt-1.5 space-y-0.5 pl-[18px]">
      {items.map((t, i) => (
        <li key={i} className="pl-0.5 text-[11.5px] leading-[1.75] text-[var(--solid-ink)]">{t}</li>
      ))}
    </ol>
  );
}

function Footer({ updated }: { updated: string }) {
  return (
    <div className="px-[18px] pb-[110px] pt-1">
      <div className="text-center font-mono text-[9px] tracking-[0.04em] text-[var(--color-muted)]">
        最終更新 {updated} · MERKEN
      </div>
    </div>
  );
}
