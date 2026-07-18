'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { DesktopButton, DesktopTopbar } from '@/components/desktop/DesktopChrome';
import { isBillingEnabled } from '@/lib/billing/feature';
import { useCoins } from '@/hooks/use-coins';

export function DesktopSettingsView({
  email,
  username,
  accountId,
  isPro,
  onSignOut,
  onUsernameChange,
  usernameSaving,
  usernameError,
}: {
  email?: string | null;
  username?: string | null;
  accountId?: string | null;
  isPro: boolean;
  onSignOut: () => void;
  onUsernameChange?: (newUsername: string) => Promise<boolean>;
  usernameSaving?: boolean;
  usernameError?: string | null;
}) {
  const billingEnabled = isBillingEnabled();
  const [isEditing, setIsEditing] = useState(false);
  const [editInput, setEditInput] = useState('');

  const startEditing = () => {
    setEditInput(username ?? '');
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setEditInput('');
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (usernameSaving || !editInput.trim() || !onUsernameChange) return;
    const success = await onUsernameChange(editInput);
    if (success) setIsEditing(false);
  };

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
              <Link
                href="/profile"
                style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}
              >
                <div className="ds-avatar" style={{ width: 44, height: 44, borderRadius: 12, fontSize: 18 }}>
                  {(username ?? email ?? 'G').charAt(0).toUpperCase()}
                </div>
                <div className="lab">
                  <div className="t">{username ?? 'ユーザー名未設定'}</div>
                  <div className="d">{email ?? 'ゲスト'}</div>
                  {accountId && <div className="d mono">@{accountId}</div>}
                </div>
              </Link>
              <span className="ds-pro-badge">
                <Icon name={isPro ? 'bolt' : 'person'} filled style={{ fontSize: 13 }} />
                {isPro ? 'PRO' : 'FREE'}
              </span>
              {email && !isEditing && onUsernameChange && (
                <button
                  type="button"
                  onClick={startEditing}
                  className="ds-set-row-action"
                  style={{ marginLeft: 8, background: 'none', border: '1px solid var(--color-border)', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 600, color: 'var(--color-secondary-text)' }}
                >
                  <Icon name="edit" style={{ fontSize: 15 }} />
                  変更
                </button>
              )}
            </div>
            {isEditing && (
              <div className="ds-set-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 10, padding: '14px 16px' }}>
                <label htmlFor="desktop-username" style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-muted)', letterSpacing: '0.05em' }}>
                  ユーザー名
                </label>
                <input
                  id="desktop-username"
                  type="text"
                  value={editInput}
                  onChange={(e) => setEditInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); void handleSave(); }
                    if (e.key === 'Escape') cancelEditing();
                  }}
                  maxLength={20}
                  autoFocus
                  placeholder="ユーザー名を入力"
                  style={{ width: '100%', padding: '8px 12px', border: '1px solid var(--color-border)', borderRadius: 8, fontSize: 14, outline: 'none' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--color-muted)' }}>
                  <span>1〜20文字</span>
                  <span>{editInput.length}/20</span>
                </div>
                {usernameError && (
                  <p style={{ margin: 0, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-error)', background: 'rgba(239,68,68,0.08)', fontSize: 12, fontWeight: 600, color: 'var(--color-error)' }}>
                    {usernameError}
                  </p>
                )}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={usernameSaving || !editInput.trim()}
                    style={{ flex: 1, padding: '8px 0', border: 'none', borderRadius: 8, background: 'var(--color-foreground, #111)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: (usernameSaving || !editInput.trim()) ? 0.5 : 1 }}
                  >
                    {usernameSaving ? '保存中...' : '保存'}
                  </button>
                  <button
                    type="button"
                    onClick={cancelEditing}
                    disabled={usernameSaving}
                    style={{ flex: 1, padding: '8px 0', border: '1px solid var(--color-border)', borderRadius: 8, background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                  >
                    キャンセル
                  </button>
                </div>
              </div>
            )}
            {email && (
              <button type="button" className="ds-set-row" style={{ width: '100%', cursor: 'pointer', background: '#fff', borderLeft: 0, borderRight: 0, borderBottom: 0, textAlign: 'left' }} onClick={onSignOut}>
                <div className="ic" style={{ background: 'var(--color-error-light)' }}><Icon name="logout" style={{ color: 'var(--color-error)' }} /></div>
                <div className="lab"><div className="t" style={{ color: 'var(--color-error)' }}>ログアウト</div></div>
              </button>
            )}
          </div>

          <div className="ds-set-group">
            <div className="gh">カスタマイズ</div>
            <SettingsLink icon="tune" label="通知・パーソナライズ" description="学習リマインダー、例文ジャンル" href="/settings/customize" />
          </div>

          <div className="ds-set-group">
            <div className="gh">豆知識</div>
            <SettingsLink icon="text_fields" label="接頭語（プレフィックス）" description="un- / re- / pre- など、頭に付くパーツの意味と例" href="/tips/prefixes" />
            <SettingsLink icon="text_fields" label="接尾語（サフィックス）" description="-tion / -ous / -able など、品詞を決めるパーツ" href="/tips/suffixes" />
            <SettingsLink icon="text_fields" label="接中語（インフィックス）" description="therm-o-meter の -o- など、語根をつなぐパーツ" href="/tips/infixes" />
          </div>

          <div className="ds-set-group">
            <div className="gh">サポート</div>
            <SettingsLink icon="mail" label="お問い合わせ" description="不具合の報告・ご要望はこちら" href="/contact" />
            <SettingsLink icon="description" label="利用規約" href="/terms" />
            <SettingsLink icon="shield" label="プライバシーポリシー" href="/privacy" />
            <SettingsLink icon="storefront" label="特定商取引法に基づく表記" href="/tokusho" />
          </div>

          {email && (
            <div className="ds-set-group">
              <div className="gh">データ</div>
              <SettingsLink
                icon="delete"
                label="アカウント削除"
                description="ログイン情報・クラウド上の学習データを完全に削除します"
                href="/settings/account/delete"
                tone="danger"
              />
            </div>
          )}

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
  const { enabled: coinsEnabled, balance: coinBalance } = useCoins();
  const features: Array<[string, string | boolean, string | boolean]> = [
    ['AIスキャン', false, '無制限'],
    ['共有単語帳のインポート', true, true],
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

          {coinsEnabled && isPro && (
            <div className="ds-card" style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--color-accent-light)', border: '2px solid var(--solid-ink)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon name="toll" filled style={{ fontSize: 22, color: 'var(--color-accent-ink)' }} />
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20 }}>
                    コイン残り {coinBalance.totalRemaining}枚
                  </div>
                  <div className="muted" style={{ fontSize: 12.5 }}>
                    今月分 {coinBalance.monthlyRemaining} / 購入分 {coinBalance.purchasedRemaining}（毎月300枚付与・繰り越しなし）
                  </div>
                </div>
              </div>
              <DesktopButton href="/coins" variant="dark" icon="toll">コインを購入</DesktopButton>
            </div>
          )}

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

function SettingsLink({
  icon,
  label,
  description,
  href,
  tone = 'default',
}: {
  icon: string;
  label: string;
  description?: string;
  href: string;
  tone?: 'default' | 'danger';
}) {
  const danger = tone === 'danger';
  return (
    <Link href={href} className="ds-set-row" style={{ color: 'inherit', textDecoration: 'none' }}>
      <div className="ic" style={danger ? { background: 'var(--color-error-light)' } : undefined}>
        <Icon name={icon} style={danger ? { color: 'var(--color-error)' } : undefined} />
      </div>
      <div className="lab">
        <div className="t" style={danger ? { color: 'var(--color-error)' } : undefined}>{label}</div>
        {description && <div className="d">{description}</div>}
      </div>
      <Icon name="chevron_right" style={{ color: 'var(--color-muted)' }} />
    </Link>
  );
}
