'use client';

import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { DesktopButton, DesktopTopbar } from '@/components/desktop/DesktopChrome';
import { StudyReminderSettings } from '@/components/settings/StudyReminderSettings';
import { ExampleGenreSettings } from '@/components/settings/ExampleGenreSettings';
import { isBillingEnabled } from '@/lib/billing/feature';

export function DesktopSettingsView({
  email,
  username,
  isPro,
  onSignOut,
}: {
  email?: string | null;
  username?: string | null;
  isPro: boolean;
  onSignOut: () => void;
}) {
  const billingEnabled = isBillingEnabled();

  return (
    <div className="hidden h-full min-h-0 flex-col lg:flex">
      <DesktopTopbar title="設定" crumb="アカウント">
        {billingEnabled && (
          <DesktopButton href="/subscription" variant={isPro ? 'dark' : 'accent'} icon="auto_awesome">
            {isPro ? 'Proプラン' : 'Proを見る'}
          </DesktopButton>
        )}
      </DesktopTopbar>
      <div className="ds-scroll">
        <div style={{ width: 'min(100%, 720px)', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="ds-set-group">
            <div className="gh">アカウント</div>
            <div className="ds-set-row">
              <div className="ds-avatar" style={{ width: 44, height: 44, borderRadius: 12, fontSize: 18 }}>
                {(username ?? email ?? 'G').charAt(0).toUpperCase()}
              </div>
              <div className="lab">
                <div className="t">{username ?? 'ユーザー名未設定'}</div>
                <div className="d">{email ?? 'ゲスト'}</div>
              </div>
              <span className="ds-pro-badge">
                <Icon name={isPro ? 'bolt' : 'person'} filled style={{ fontSize: 13 }} />
                {isPro ? 'PRO' : 'FREE'}
              </span>
            </div>
            {email && (
              <button type="button" className="ds-set-row" style={{ width: '100%', cursor: 'pointer', background: '#fff', borderLeft: 0, borderRight: 0, borderBottom: 0, textAlign: 'left' }} onClick={onSignOut}>
                <div className="ic" style={{ background: 'var(--color-error-light)' }}><Icon name="logout" style={{ color: 'var(--color-error)' }} /></div>
                <div className="lab"><div className="t" style={{ color: 'var(--color-error)' }}>ログアウト</div></div>
              </button>
            )}
          </div>

          <StudyReminderSettings variant="desktop" />

          <ExampleGenreSettings variant="desktop" />

          <div className="ds-set-group">
            <div className="gh">サポート</div>
            <SettingsLink icon="mail" label="お問い合わせ" description="不具合の報告・ご要望はこちら" href="/contact" />
            <SettingsLink icon="description" label="利用規約" href="/terms" />
            <SettingsLink icon="shield" label="プライバシーポリシー" href="/privacy" />
            <SettingsLink icon="storefront" label="特定商取引法に基づく表記" href="/tokusho" />
          </div>

          <div className="mono muted" style={{ fontSize: 11, textAlign: 'center', paddingBottom: 8 }}>Merken for Desktop · バージョン 2.4.0</div>
        </div>
      </div>
    </div>
  );
}

export function DesktopSubscriptionView({
  price,
  processing,
  error,
  isPro,
  userSignedIn,
  onSubscribe,
}: {
  price: number;
  processing: boolean;
  error: string | null;
  isPro: boolean;
  userSignedIn: boolean;
  onSubscribe: () => void;
}) {
  const features: Array<[string, string | boolean, string | boolean]> = [
    ['スキャン回数', '1日 5回まで', '無制限'],
    ['単語帳の数', '3冊まで', '無制限'],
    ['全単語帳の横断学習', false, true],
    ['AI例文・語源の生成', false, true],
    ['クラウド同期', false, true],
    ['広告の非表示', false, true],
  ];

  return (
    <div className="hidden h-full min-h-0 flex-col lg:flex">
      <DesktopTopbar title="Merken Pro" crumb="アカウント / プラン" />
      <div className="ds-scroll">
        <div style={{ maxWidth: 880, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            <span className="ds-pro-badge" style={{ fontSize: 11 }}><Icon name="bolt" filled style={{ fontSize: 14 }} />MERKEN PRO</span>
            <h1 style={{ fontSize: 34, margin: '16px 0 8px' }}>学習の上限を、なくす。</h1>
            <p className="muted" style={{ fontSize: 15, margin: 0 }}>スキャンも単語帳も無制限。AIが例文と語源で記憶を支えます。</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 24 }}>
            <div className="ds-card ds-plan">
              <div className="pn">Free</div>
              <div className="pr"><span className="amt">¥0</span><span className="per">/ 月</span></div>
              <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>まずは試してみる</div>
              <button type="button" className="ds-btn" style={{ width: '100%' }} disabled>現在のプラン</button>
            </div>
            <div className="ds-card pro-card ds-plan">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="pn">Pro</div>
                <span className="ds-pro-badge"><Icon name="bolt" filled style={{ fontSize: 12 }} />おすすめ</span>
              </div>
              <div className="pr"><span className="amt" style={{ color: 'var(--color-accent-ink)' }}>¥{price.toLocaleString()}</span><span className="per">/ 月</span></div>
              <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>本気の学習を上限なしで進める</div>
              {error && <div style={{ color: 'var(--color-error)', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>{error}</div>}
              <button type="button" className="ds-btn accent" style={{ width: '100%' }} disabled={processing || isPro} onClick={onSubscribe}>
                {processing && <Icon name="progress_activity" className="animate-spin" />}
                <Icon name="bolt" filled />
                {isPro ? '現在Proプランです' : userSignedIn ? 'Proにアップグレード' : 'ログインして登録'}
              </button>
            </div>
          </div>

          <div className="ds-card" style={{ padding: 0, overflow: 'hidden' }}>
            <table className="ds-table">
              <thead><tr><th>機能</th><th style={{ width: 180, textAlign: 'center' }}>Free</th><th style={{ width: 180, textAlign: 'center' }}>Pro</th></tr></thead>
              <tbody>
                {features.map(([label, free, pro]) => (
                  <tr key={label}>
                    <td style={{ fontWeight: 600 }}>{label}</td>
                    {[free, pro].map((value, index) => (
                      <td key={index === 0 ? 'free' : 'pro'} style={{ textAlign: 'center' }}>
                        {typeof value === 'boolean'
                          ? <Icon name={value ? 'check_circle' : 'remove'} filled={value} style={{ color: value ? 'var(--color-accent)' : 'var(--color-border)' }} />
                          : <span style={{ fontSize: 13, fontWeight: index === 1 ? 700 : 400, color: index === 1 ? 'var(--color-accent-ink)' : 'var(--color-secondary-text)' }}>{value}</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsLink({ icon, label, description, href }: { icon: string; label: string; description?: string; href: string }) {
  return (
    <Link href={href} className="ds-set-row" style={{ color: 'inherit', textDecoration: 'none' }}>
      <div className="ic"><Icon name={icon} /></div>
      <div className="lab"><div className="t">{label}</div>{description && <div className="d">{description}</div>}</div>
      <Icon name="chevron_right" style={{ color: 'var(--color-muted)' }} />
    </Link>
  );
}
