'use client';

import { useRouter } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';

export default function PrivacyPage() {
  const router = useRouter();

  return (
    <div className="relative min-h-screen bg-[var(--color-background)] pt-[54px] font-[var(--font-body)]">
      {/* Header */}
      <div className="px-[18px] pb-3.5 pt-1">
        <div className="mb-0.5 flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border-[1.25px] border-[var(--solid-ink)] bg-white text-[var(--solid-ink)]"
          >
            <Icon name="chevron_left" size={14} />
          </button>
          <div className="font-mono text-[10px] font-bold tracking-[0.08em] text-[var(--color-muted)]">ACCOUNT / SUPPORT</div>
        </div>
        <div className="mt-1.5 font-display text-2xl font-extrabold leading-[1.15] tracking-[-0.02em] text-[var(--solid-ink)]">プライバシーポリシー</div>
        <div className="mt-1.5 font-mono text-[10px] tracking-[0.02em] text-[var(--color-muted)]">PRIVACY POLICY · 個人情報の取扱い</div>
      </div>

      {/* Intro */}
      <div className="px-[18px] pb-3.5">
        <div className="rounded-xl border-[1.25px] border-[var(--solid-ink)] bg-[#faf7f1] p-[12px_14px] shadow-[2.5px_2.5px_0_var(--solid-ink)]">
          <p className="m-0 text-[11px] leading-[1.75] text-[var(--solid-ink)]">
            Merken, Inc.（以下「当社」）は、利用者のプライバシーを尊重し、個人情報の保護に関する法律および関連法令を遵守します。本ポリシーは、当社が運営する「Merken」（以下「本サービス」）における情報の取得・利用・管理について定めるものです。
          </p>
        </div>
      </div>

      <Section num="1" label="取得する情報">
        <OL items={[
          'アカウント情報（メールアドレス、表示名、認証プロバイダ ID）',
          '学習データ（登録した単語、復習履歴、解答結果、学習目標）',
          'デバイス情報（OS バージョン、アプリバージョン、言語設定）',
          '利用ログ（画面遷移、機能利用頻度、クラッシュ情報）',
          '決済情報（プラン種別、購読ステータス。クレジットカード番号は当社では保持しません）',
        ]} />
      </Section>

      <Section num="2" label="利用目的">
        <P>取得した情報は、以下の目的のために利用します。</P>
        <OL items={[
          '本サービスの提供・維持・改善',
          '学習進捗の同期・復習アルゴリズムの最適化',
          '不正利用・スパムの防止',
          'お問い合わせへの対応',
          '統計データの作成（個人を特定できない形に加工）',
        ]} />
      </Section>

      <Section num="3" label="第三者提供">
        <P>当社は、利用者の同意なく個人情報を第三者に提供しません。ただし、法令に基づく場合、または以下の業務委託先への提供を除きます。委託先には適切な監督を行います。</P>
        <OL items={[
          'クラウドインフラ事業者（データ保存・配信）',
          '認証プロバイダ（Apple, Google）',
          '決済代行事業者（App Store, Google Play, Stripe 等）',
          '解析・クラッシュ報告ツール（個人を特定しない形）',
        ]} />
      </Section>

      <Section num="4" label="Cookie・類似技術">
        <P>本サービスでは、ログイン状態の維持や利用状況の分析のため Cookie および類似技術（ローカルストレージ、デバイス識別子）を使用します。ブラウザの設定によりこれらを無効化できますが、一部機能が利用できなくなる場合があります。</P>
      </Section>

      <Section num="5" label="データの保存期間">
        <P>利用者がアカウントを削除した日から 30 日以内に、学習データを含む個人情報を削除します。法令に基づき保存が義務付けられる情報については、当該期間を経過するまで保管します。</P>
      </Section>

      <Section num="6" label="利用者の権利">
        <P>利用者は、当社が保有する自己の個人情報について、開示・訂正・利用停止・削除を請求できます。アプリ内「設定 &gt; アカウント」より、または下記の問い合わせ先までご連絡ください。</P>
      </Section>

      <Section num="7" label="お問い合わせ">
        <div className="mt-1 rounded-lg border border-[var(--color-border)] bg-[#faf7f1] px-3 py-2.5">
          <div className="font-mono text-[9px] font-bold tracking-[0.08em] text-[var(--color-muted)]">CONTACT</div>
          <div className="mt-1 font-mono text-xs text-[var(--solid-ink)]">privacy@merken.jp</div>
        </div>
      </Section>

      <Footer updated="2026.01.05" />
    </div>
  );
}

function Section({ num, label, children }: { num: string; label: string; children: React.ReactNode }) {
  return (
    <div className="px-[18px] pb-3">
      <div className="flex items-baseline gap-1.5 pb-1.5 pl-1 font-mono text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--color-muted)]">
        <span className="text-[var(--solid-ink)]">§{num}</span>
        <span>{label}</span>
      </div>
      <div className="rounded-xl border-[1.25px] border-[var(--solid-ink)] bg-white p-[12px_14px] shadow-[2.5px_2.5px_0_var(--solid-ink)]">
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
        最終更新 {updated} · Merken, Inc.
      </div>
    </div>
  );
}
