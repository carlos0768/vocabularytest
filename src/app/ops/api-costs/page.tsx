'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AppShell, Button, Icon } from '@/components/ui';

type DashboardSummary = {
  days: number;
  totals: {
    calls: number;
    succeededCalls: number;
    failedCalls: number;
    pricedCalls: number;
    unpricedCalls: number;
    totalTokens: number;
    costUsd: number;
    costJpy: number;
  };
  byDay: Array<{
    day: string;
    calls: number;
    costUsd: number;
    costJpy: number;
    totalTokens: number;
  }>;
  byModel: Array<{
    provider: string;
    model: string;
    calls: number;
    costUsd: number;
    costJpy: number;
    totalTokens: number;
  }>;
  recentEvents: Array<{
    id: string;
    provider: string;
    model: string;
    operation: string;
    status: string;
    total_tokens: number | null;
    estimated_cost_jpy: number | string | null;
    created_at: string;
  }>;
};

function formatYen(value: number): string {
  return new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 2,
  }).format(value);
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 6,
  }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat('ja-JP').format(value);
}

function toNumber(value: number | string | null): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export default function ApiCostDashboardPage() {
  const [adminSecret, setAdminSecret] = useState('');
  const [daysInput, setDaysInput] = useState('30');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);

  const daysValue = useMemo(() => {
    const parsed = Number(daysInput);
    if (!Number.isFinite(parsed)) return 30;
    return Math.max(1, Math.min(365, Math.round(parsed)));
  }, [daysInput]);

  const handleLoad = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/ops/api-costs?days=${daysValue}`, {
        headers: {
          'x-admin-secret': adminSecret,
        },
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(result?.error ?? 'Failed to fetch dashboard');
      }

      setSummary(result.summary as DashboardSummary);
    } catch (loadError) {
      setSummary(null);
      setError(loadError instanceof Error ? loadError.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppShell>
      <div className="min-h-screen pb-24 lg:pb-8">
        <header className="sticky top-0 bg-[var(--color-background)]/95 z-40 px-6 py-4 border-b border-[var(--color-border)]">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-[var(--color-muted)] uppercase tracking-wider">Ops</p>
              <h1 className="text-xl font-bold text-[var(--color-foreground)]">API Cost Dashboard</h1>
            </div>
            <Link href="/settings">
              <Button size="sm" variant="secondary">
                <Icon name="arrow_back" size={16} />
                戻る
              </Button>
            </Link>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-6 py-6 space-y-6">
          <section className="bg-[var(--color-surface)] rounded-2xl border-2 border-[var(--color-border)] border-b-4 p-4">
            <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_auto] gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs text-[var(--color-muted)]">ADMIN_SECRET</span>
                <input
                  type="password"
                  value={adminSecret}
                  onChange={(event) => setAdminSecret(event.target.value)}
                  className="px-3 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-foreground)]"
                  placeholder="x-admin-secret"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs text-[var(--color-muted)]">対象日数 (1-365)</span>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={daysInput}
                  onChange={(event) => setDaysInput(event.target.value)}
                  className="px-3 py-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-foreground)]"
                />
              </label>

              <div className="flex items-end">
                <Button onClick={handleLoad} disabled={loading || adminSecret.trim() === ''} className="w-full md:w-auto">
                  {loading ? '読み込み中...' : '集計を取得'}
                </Button>
              </div>
            </div>

            {error && (
              <div className="mt-3 bg-[var(--color-error-light)] border border-[var(--color-error)]/30 rounded-xl p-3 text-sm text-[var(--color-error)]">
                {error}
              </div>
            )}
          </section>

          {!summary && !loading && !error && (
            <section className="bg-[var(--color-surface)] rounded-2xl border-2 border-[var(--color-border)] border-b-4 p-8 text-center">
              <p className="text-[var(--color-muted)]">シークレットを入力して集計を読み込んでください。</p>
            </section>
          )}

          {summary && (
            <>
              <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-4">
                  <p className="text-xs text-[var(--color-muted)]">推定コスト (JPY / {summary.days}日)</p>
                  <p className="text-xl font-bold text-[var(--color-foreground)]">{formatYen(summary.totals.costJpy)}</p>
                </div>
                <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-4">
                  <p className="text-xs text-[var(--color-muted)]">推定コスト (USD / {summary.days}日)</p>
                  <p className="text-xl font-bold text-[var(--color-foreground)]">{formatUsd(summary.totals.costUsd)}</p>
                </div>
                <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-4">
                  <p className="text-xs text-[var(--color-muted)]">APIコール数</p>
                  <p className="text-xl font-bold text-[var(--color-foreground)]">{formatNumber(summary.totals.calls)}</p>
                  <p className="text-xs text-[var(--color-muted)] mt-1">
                    success {formatNumber(summary.totals.succeededCalls)} / failed {formatNumber(summary.totals.failedCalls)}
                  </p>
                </div>
                <div className="bg-[var(--color-surface)] rounded-2xl border border-[var(--color-border)] p-4">
                  <p className="text-xs text-[var(--color-muted)]">トークン総量</p>
                  <p className="text-xl font-bold text-[var(--color-foreground)]">{formatNumber(summary.totals.totalTokens)}</p>
                  <p className="text-xs text-[var(--color-muted)] mt-1">
                    priced {formatNumber(summary.totals.pricedCalls)} / unpriced {formatNumber(summary.totals.unpricedCalls)}
                  </p>
                </div>
              </section>

              <section className="bg-[var(--color-surface)] rounded-2xl border-2 border-[var(--color-border)] border-b-4 p-4 overflow-x-auto">
                <h2 className="font-semibold text-[var(--color-foreground)] mb-3">日次コスト</h2>
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr className="text-left text-[var(--color-muted)] border-b border-[var(--color-border)]">
                      <th className="py-2 font-medium">日付</th>
                      <th className="py-2 font-medium">Calls</th>
                      <th className="py-2 font-medium">Tokens</th>
                      <th className="py-2 font-medium">USD</th>
                      <th className="py-2 font-medium">JPY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.byDay.map((row) => (
                      <tr key={row.day} className="border-b border-[var(--color-border)]/50">
                        <td className="py-2 text-[var(--color-foreground)]">{row.day}</td>
                        <td className="py-2 text-[var(--color-foreground)]">{formatNumber(row.calls)}</td>
                        <td className="py-2 text-[var(--color-foreground)]">{formatNumber(row.totalTokens)}</td>
                        <td className="py-2 text-[var(--color-foreground)]">{formatUsd(row.costUsd)}</td>
                        <td className="py-2 text-[var(--color-foreground)]">{formatYen(row.costJpy)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="bg-[var(--color-surface)] rounded-2xl border-2 border-[var(--color-border)] border-b-4 p-4 overflow-x-auto">
                <h2 className="font-semibold text-[var(--color-foreground)] mb-3">モデル別</h2>
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="text-left text-[var(--color-muted)] border-b border-[var(--color-border)]">
                      <th className="py-2 font-medium">Provider</th>
                      <th className="py-2 font-medium">Model</th>
                      <th className="py-2 font-medium">Calls</th>
                      <th className="py-2 font-medium">Tokens</th>
                      <th className="py-2 font-medium">JPY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.byModel.map((row) => (
                      <tr key={`${row.provider}:${row.model}`} className="border-b border-[var(--color-border)]/50">
                        <td className="py-2 text-[var(--color-foreground)]">{row.provider}</td>
                        <td className="py-2 text-[var(--color-foreground)]">{row.model}</td>
                        <td className="py-2 text-[var(--color-foreground)]">{formatNumber(row.calls)}</td>
                        <td className="py-2 text-[var(--color-foreground)]">{formatNumber(row.totalTokens)}</td>
                        <td className="py-2 text-[var(--color-foreground)]">{formatYen(row.costJpy)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              <section className="bg-[var(--color-surface)] rounded-2xl border-2 border-[var(--color-border)] border-b-4 p-4 overflow-x-auto">
                <h2 className="font-semibold text-[var(--color-foreground)] mb-3">直近イベント</h2>
                <table className="w-full text-sm min-w-[760px]">
                  <thead>
                    <tr className="text-left text-[var(--color-muted)] border-b border-[var(--color-border)]">
                      <th className="py-2 font-medium">時刻</th>
                      <th className="py-2 font-medium">Operation</th>
                      <th className="py-2 font-medium">Provider/Model</th>
                      <th className="py-2 font-medium">Status</th>
                      <th className="py-2 font-medium">Tokens</th>
                      <th className="py-2 font-medium">JPY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.recentEvents.map((event) => (
                      <tr key={event.id} className="border-b border-[var(--color-border)]/50">
                        <td className="py-2 text-[var(--color-foreground)]">{new Date(event.created_at).toLocaleString('ja-JP')}</td>
                        <td className="py-2 text-[var(--color-foreground)]">{event.operation}</td>
                        <td className="py-2 text-[var(--color-foreground)]">{event.provider} / {event.model}</td>
                        <td className={`py-2 ${event.status === 'failed' ? 'text-[var(--color-error)]' : 'text-[var(--color-foreground)]'}`}>
                          {event.status}
                        </td>
                        <td className="py-2 text-[var(--color-foreground)]">{formatNumber(event.total_tokens ?? 0)}</td>
                        <td className="py-2 text-[var(--color-foreground)]">{formatYen(toNumber(event.estimated_cost_jpy))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </>
          )}
        </main>
      </div>
    </AppShell>
  );
}
