'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui';
import { useAdminSecret } from './use-admin-secret';

// 管理ダッシュボードのハブ。ADMIN_SECRET を入力すると、その日のスキャン状況・
// ユーザー数・直近のAPIコスト/スキャン毎トークン消費を1画面で確認でき、
// お知らせ管理(/ops/announcements)・APIコスト詳細(/ops/api-costs)へ遷移できる。

type OpsDashboard = {
  scansToday: { total: number; failed: number };
  users: { total: number; newToday: number };
  apiCosts: {
    days: number;
    totals: {
      calls: number;
      failedCalls: number;
      totalTokens: number;
      costJpy: number;
    };
    scans: {
      count: number;
      recent: Array<{
        scanId: string;
        source: string | null;
        modes: string[];
        calls: number;
        failedCalls: number;
        totalTokens: number;
        costJpy: number;
        startedAt: string;
      }>;
    };
  };
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ja-JP').format(value);
}

function formatYen(value: number): string {
  return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 2 }).format(value);
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export default function OpsHubPage() {
  const [adminSecret, setAdminSecret] = useAdminSecret();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<OpsDashboard | null>(null);

  const handleLoad = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/ops/dashboard', {
        headers: { 'x-admin-secret': adminSecret },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(result?.error ?? 'Failed to load dashboard');
      }
      setDashboard(result.dashboard as OpsDashboard);
    } catch (loadError) {
      setDashboard(null);
      setError(loadError instanceof Error ? loadError.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-background)] pb-16">
      <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-background)]/95 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-[var(--color-muted)]">Ops</p>
            <h1 className="text-xl font-bold text-[var(--color-foreground)]">管理ダッシュボード</h1>
          </div>
          <Link href="/" className="text-sm font-bold text-[var(--color-muted)]">
            アプリに戻る
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-6">
        {/* 認証 */}
        <section className="rounded-2xl border-2 border-b-4 border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_auto]">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--color-muted)]">ADMIN_SECRET</span>
              <input
                type="password"
                value={adminSecret}
                onChange={(event) => setAdminSecret(event.target.value)}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[var(--color-foreground)]"
                placeholder="x-admin-secret"
              />
            </label>
            <button
              type="button"
              onClick={() => void handleLoad()}
              disabled={loading || !adminSecret}
              className="self-end rounded-xl border-2 border-[var(--solid-ink)] bg-[var(--solid-ink)] px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
            >
              {loading ? '読み込み中...' : '読み込む'}
            </button>
          </div>
          {error && <p className="mt-2 text-sm font-bold text-[var(--color-error)]">{error}</p>}
        </section>

        {/* ナビゲーション */}
        <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <Link href="/ops/announcements" className="block rounded-2xl border-2 border-b-4 border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-colors hover:border-[var(--color-accent)]">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--color-accent)] text-white">
                <Icon name="campaign" size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-[var(--color-foreground)]">お知らせ管理</div>
                <div className="text-xs text-[var(--color-muted)]">お知らせの作成・プレビュー・公開</div>
              </div>
              <Icon name="chevron_right" size={18} className="text-[var(--color-muted)]" />
            </div>
          </Link>
          <Link href="/ops/api-costs" className="block rounded-2xl border-2 border-b-4 border-[var(--color-border)] bg-[var(--color-surface)] p-4 transition-colors hover:border-[var(--color-accent)]">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--solid-ink)] text-white">
                <Icon name="payments" size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-[var(--color-foreground)]">APIコスト詳細</div>
                <div className="text-xs text-[var(--color-muted)]">モデル別・日別の詳細ダッシュボード</div>
              </div>
              <Icon name="chevron_right" size={18} className="text-[var(--color-muted)]" />
            </div>
          </Link>
        </section>

        {dashboard && (
          <>
            {/* 統計カード */}
            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label="本日のスキャン"
                value={formatNumber(dashboard.scansToday.total)}
                sub="件(JST)"
              />
              <StatCard
                label="本日のスキャン失敗"
                value={formatNumber(dashboard.scansToday.failed)}
                sub="件"
                tone={dashboard.scansToday.failed > 0 ? 'error' : 'default'}
              />
              <StatCard
                label="ユーザー数"
                value={formatNumber(dashboard.users.total)}
                sub={`本日 +${formatNumber(dashboard.users.newToday)}`}
              />
              <StatCard
                label={`APIコスト(直近${dashboard.apiCosts.days}日)`}
                value={formatYen(dashboard.apiCosts.totals.costJpy)}
                sub={`${formatNumber(dashboard.apiCosts.totals.totalTokens)} tokens / 失敗${formatNumber(dashboard.apiCosts.totals.failedCalls)}件`}
              />
            </section>

            {/* スキャン毎のトークン消費 */}
            <section className="rounded-2xl border-2 border-b-4 border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <h2 className="mb-3 font-bold text-[var(--color-foreground)]">
                最近のスキャン(トークン消費)
              </h2>
              {dashboard.apiCosts.scans.recent.length === 0 ? (
                <p className="text-sm text-[var(--color-muted)]">直近{dashboard.apiCosts.days}日のスキャンはありません。</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border)] text-xs text-[var(--color-muted)]">
                        <th className="py-2 pr-3 font-semibold">日時</th>
                        <th className="py-2 pr-3 font-semibold">モード</th>
                        <th className="py-2 pr-3 font-semibold">呼出</th>
                        <th className="py-2 pr-3 font-semibold">失敗</th>
                        <th className="py-2 pr-3 font-semibold">トークン</th>
                        <th className="py-2 font-semibold">コスト</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboard.apiCosts.scans.recent.slice(0, 20).map((scan) => (
                        <tr key={scan.scanId} className="border-b border-[var(--color-border)]/60">
                          <td className="py-2 pr-3 font-mono text-xs text-[var(--color-muted)]">{formatTime(scan.startedAt)}</td>
                          <td className="py-2 pr-3">{scan.modes.length > 0 ? scan.modes.join(', ') : scan.source ?? '-'}</td>
                          <td className="py-2 pr-3 tabular-nums">{scan.calls}</td>
                          <td className={`py-2 pr-3 tabular-nums ${scan.failedCalls > 0 ? 'font-bold text-[var(--color-error)]' : ''}`}>
                            {scan.failedCalls}
                          </td>
                          <td className="py-2 pr-3 font-mono tabular-nums">{formatNumber(scan.totalTokens)}</td>
                          <td className="py-2 font-mono tabular-nums">{formatYen(scan.costJpy)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  tone = 'default',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'default' | 'error';
}) {
  return (
    <div className="rounded-2xl border-2 border-b-4 border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="text-xs text-[var(--color-muted)]">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${tone === 'error' ? 'text-[var(--color-error)]' : 'text-[var(--color-foreground)]'}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-[var(--color-muted)]">{sub}</div>}
    </div>
  );
}
