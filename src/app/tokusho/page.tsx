'use client';

import { useRouter } from 'next/navigation';
import { DesktopTokushoView } from '@/components/desktop/DesktopSupport';
import { SupportMobileFrame, TokushoBody, type TokushoSection } from '@/components/support/SupportDoc';

const TOKUSHO_UPDATED = '2026年4月13日';

const TOKUSHO_SECTIONS: TokushoSection[] = [
  {
    label: '販売事業者',
    rows: [
      { label: '販売事業者名', value: '原田浩司' },
      { label: '運営統括責任者', value: '原田浩司' },
      { label: 'サービス名', value: 'MERKEN' },
      {
        label: '所在地',
        value: (
          <>
            〒810-0001<br />
            福岡県福岡市中央区天神2丁目2番12号<br />
            T&Jビルディング7F
          </>
        ),
      },
      {
        label: '電話番号',
        value: (
          <>
            090-1077-1208<br />
            受付時間: 9:00–20:00
          </>
        ),
      },
      {
        label: 'メールアドレス',
        value: <a href="mailto:support@merken.jp" className="font-mono text-[var(--color-accent)]">support@merken.jp</a>,
      },
    ],
  },
  {
    label: '販売価格',
    rows: [
      { label: '無料プラン', value: '¥0' },
      { label: 'Pro（月額）', value: '¥300（税込）／ 月' },
    ],
  },
  {
    label: '支払いと提供時期',
    rows: [
      { label: '支払方法', value: 'クレジットカード決済（Stripe / Visa, Mastercard 等）' },
      { label: '商品代金以外の料金', value: 'インターネット接続に必要な通信料等はお客様のご負担となります。' },
      { label: '支払時期', value: '有料プランの申込時に初回決済が行われ、以後は毎月の更新日に自動で課金されます。' },
      { label: '提供時期', value: '決済完了後、直ちにご利用いただけます。' },
    ],
  },
  {
    label: 'その他',
    rows: [
      { label: '返品・返金', value: 'デジタルサービスの性質上、決済完了後の返品・返金は原則としてお受けしておりません。' },
      { label: '解約方法', value: 'アプリ内の設定画面から期間末解約の手続きが可能です。解約後も契約期間終了日まではご利用いただけます。' },
      { label: '動作環境', value: 'iOS 16.0 以降 / Android 10 以降 / 主要モダンブラウザ' },
    ],
  },
];

export default function TokushoPage() {
  const router = useRouter();

  return (
    <>
      <DesktopTokushoView onBack={() => router.back()} sections={TOKUSHO_SECTIONS} updated={TOKUSHO_UPDATED} />
      <SupportMobileFrame
        title="特定商取引法に基づく表記"
        eyebrow="SPECIFIED COMMERCIAL TRANSACTIONS ACT"
        onBack={() => router.back()}
      >
        <TokushoBody sections={TOKUSHO_SECTIONS} updated={TOKUSHO_UPDATED} />
      </SupportMobileFrame>
    </>
  );
}
