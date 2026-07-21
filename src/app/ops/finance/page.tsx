'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, Icon } from '@/components/ui';
import {
  BILLING_CYCLES,
  BILLING_CYCLE_LABELS,
  FIXED_COST_CATEGORIES,
  FIXED_COST_CATEGORY_LABELS,
  monthlyAmountJpy,
  type FixedCost,
} from '@/lib/finance/fixed-costs';
import type { FinanceDashboardSummary } from '@/lib/finance/summary';
import { useAdminSecret } from '../use-admin-secret';
import {
  formatAccounting,
  formatMonthLabel,
  formatNumber,
  formatPercent,
  formatYen,
  shortMonthLabel,
} from './format';
import { MonthlyPnlChart } from './monthly-pnl-chart';

// 財務担当向けダッシュボード。売上(サブスク実績+コインパック)・変動費(AI API原価・
// 決済手数料試算)・固定費(finance_fixed_costs)を月次で突き合わせ、
// 限界利益・営業損益・損益分岐点まで一画面で追えるようにする。

const WARNING_MESSAGES: Record<string, string> = {
  stripe_unavailable:
    'Stripeに接続できないため、サブスク売上は「当月のみ会員数×月額の推定値」です(過去月は「—」表示)。',
  stripe_refunds_unavailable: 'Stripeの返金データを取得できなかったため、返金は0円として表示しています。',
  stripe_non_jpy_invoice_skipped: '円建て以外のStripe請求書があったため、その分は集計から除外しています。',
  fixed_costs_table_missing:
    '固定費テーブルが未作成です(管理者向け: マイグレーション 20260721090000 を適用してください)。',
  ai_rpc_missing:
    'AIコスト集計関数が未作成のため、AI原価が0表示です(管理者向け: マイグレーション 20260721090000 を適用してください)。',
  coin_rpc_missing:
    'コインパック集計関数が未作成のため、コイン売上が0表示です(管理者向け: マイグレーション 20260721090000 を適用してください)。',
};

// ============================================
// KPIカード
// ============================================

function KpiCard({
  label,
  value,
  subLines = [],
  tone = 'default',
}: {
  label: string;
  value: string;
  subLines?: string[];
  tone?: 'default' | 'error';
}) {
  return (
    <div className="rounded-2xl border-2 border-b-4 border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="text-xs text-[var(--color-muted)]">{label}</div>
      <div
        className={`mt-1 text-2xl font-bold ${
          tone === 'error' ? 'text-[var(--color-error)]' : 'text-[var(--color-foreground)]'
        }`}
      >
        {value}
      </div>
      {subLines.map((line) => (
        <div key={line} className="mt-0.5 text-xs text-[var(--color-muted)]">
          {line}
        </div>
      ))}
    </div>
  );
}

// ============================================
// 固定費フォーム
// ============================================

type FixedCostFormState = {
  name: string;
  category: string;
  vendor: string;
  amountJpy: string;
  billingCycle: string;
  startsOn: string;
  endsOn: string;
  notes: string;
};

function emptyFixedCostForm(): FixedCostFormState {
  return {
    name: '',
    category: 'database',
    vendor: '',
    amountJpy: '',
    billingCycle: 'monthly',
    startsOn: new Date().toISOString().slice(0, 10),
    endsOn: '',
    notes: '',
  };
}

function formFromFixedCost(cost: FixedCost): FixedCostFormState {
  return {
    name: cost.name,
    category: cost.category,
    vendor: cost.vendor ?? '',
    amountJpy: String(cost.amountJpy),
    billingCycle: cost.billingCycle,
    startsOn: cost.startsOn,
    endsOn: cost.endsOn ?? '',
    notes: cost.notes ?? '',
  };
}

// ============================================
// ページ本体
// ============================================

export default function FinanceDashboardPage() {
  const [adminSecret, setAdminSecret] = useAdminSecret();
  const [months, setMonths] = useState('6');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<FinanceDashboardSummary | null>(null);
  const [fixedCosts, setFixedCosts] = useState<FixedCost[]>([]);

  const [form, setForm] = useState<FixedCostFormState>(emptyFixedCostForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const headers = useMemo(
    () => ({ 'x-admin-secret': adminSecret, 'Content-Type': 'application/json' }),
    [adminSecret],
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, costsRes] = await Promise.all([
        fetch(`/api/ops/finance?months=${months}`, { headers: { 'x-admin-secret': adminSecret } }),
        fetch('/api/ops/finance/fixed-costs', { headers: { 'x-admin-secret': adminSecret } }),
      ]);
      const summaryJson = await summaryRes.json().catch(() => ({}));
      if (!summaryRes.ok || !summaryJson?.success) {
        throw new Error(summaryJson?.error ?? '集計の取得に失敗しました');
      }
      const costsJson = await costsRes.json().catch(() => ({}));
      if (!costsRes.ok || !costsJson?.success) {
        throw new Error(costsJson?.error ?? '固定費の取得に失敗しました');
      }
      setSummary(summaryJson.summary as FinanceDashboardSummary);
      setFixedCosts(costsJson.fixedCosts as FixedCost[]);
    } catch (loadError) {
      setSummary(null);
      setError(loadError instanceof Error ? loadError.message : '読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, [adminSecret, months]);

  const handleSaveFixedCost = async () => {
    setSaving(true);
    setFormError(null);
    try {
      const amount = Number(form.amountJpy);
      if (!form.name.trim()) throw new Error('費目名を入力してください');
      if (!Number.isFinite(amount) || amount < 0) throw new Error('金額を正しく入力してください');
      if (!form.startsOn) throw new Error('開始日を入力してください');

      const payload = {
        name: form.name.trim(),
        category: form.category,
        vendor: form.vendor.trim() === '' ? null : form.vendor.trim(),
        amountJpy: amount,
        billingCycle: form.billingCycle,
        startsOn: form.startsOn,
        endsOn: form.endsOn === '' ? null : form.endsOn,
        notes: form.notes.trim() === '' ? null : form.notes.trim(),
      };

      const response = await fetch(
        editingId ? `/api/ops/finance/fixed-costs/${editingId}` : '/api/ops/finance/fixed-costs',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers,
          body: JSON.stringify(payload),
        },
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(result?.error ?? '保存に失敗しました');
      }

      setForm(emptyFixedCostForm());
      setEditingId(null);
      setFormOpen(false);
      await loadAll();
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFixedCost = async (cost: FixedCost) => {
    if (!window.confirm(`固定費「${cost.name}」を削除しますか?(過去月の表示からも消えます)`)) {
      return;
    }
    try {
      const response = await fetch(`/api/ops/finance/fixed-costs/${cost.id}`, {
        method: 'DELETE',
        headers: { 'x-admin-secret': adminSecret },
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.success) {
        throw new Error(result?.error ?? '削除に失敗しました');
      }
      await loadAll();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '削除に失敗しました');
    }
  };

  const kpis = summary?.kpis ?? null;
  const currentMonthKey = summary?.currentMonthKey ?? '';
  const hasEstimatedSubscription = summary?.monthly.some(
    (row) => row.revenue.subscriptionSource === 'estimate',
  );
  const warningMessages = Array.from(new Set(summary?.warnings ?? [])).map(
    (code) => WARNING_MESSAGES[code] ?? code,
  );

  return (
    <div className="finance-viz min-h-screen bg-[var(--color-background)] pb-16">
      {/* チャート系列色(検証済みパレット: ライト/ダーク両モード) */}
      <style>{`
        .finance-viz {
          --fin-revenue: #2a78d6;
          --fin-cost: #eb6834;
          --fin-profit: #1baf7a;
        }
        .dark .finance-viz {
          --fin-revenue: #3987e5;
          --fin-cost: #d95926;
          --fin-profit: #199e70;
        }
      `}</style>

      <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-background)]/95 px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider text-[var(--color-muted)]">Ops / Finance</p>
            <h1 className="text-xl font-bold text-[var(--color-foreground)]">財務ダッシュボード</h1>
          </div>
          <Link href="/ops">
            <Button size="sm" variant="secondary">
              <Icon name="arrow_back" size={16} />
              管理トップ
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-6">
        {/* 認証+期間 */}
        <section className="rounded-2xl border-2 border-b-4 border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr_auto]">
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
            <label className="flex flex-col gap-1">
              <span className="text-xs text-[var(--color-muted)]">対象期間</span>
              <select
                value={months}
                onChange={(event) => setMonths(event.target.value)}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-[var(--color-foreground)]"
              >
                <option value="3">直近3ヶ月</option>
                <option value="6">直近6ヶ月</option>
                <option value="12">直近12ヶ月</option>
              </select>
            </label>
            <div className="flex items-end">
              <Button onClick={() => void loadAll()} disabled={loading || adminSecret.trim() === ''} className="w-full md:w-auto">
                {loading ? '読み込み中...' : '読み込む'}
              </Button>
            </div>
          </div>
          {error && (
            <p className="mt-3 rounded-xl border border-[var(--color-error)]/30 bg-[var(--color-error-light)] p-3 text-sm font-bold text-[var(--color-error)]">
              {error}
            </p>
          )}
        </section>

        {!summary && !loading && !error && (
          <section className="rounded-2xl border-2 border-b-4 border-[var(--color-border)] bg-[var(--color-surface)] p-8 text-center">
            <p className="text-[var(--color-muted)]">シークレットを入力して集計を読み込んでください。</p>
          </section>
        )}

        {summary && kpis && (
          <>
            {warningMessages.length > 0 && (
              <section className="rounded-2xl border-2 border-[var(--color-border)] bg-[var(--color-surface-secondary)] p-4 text-sm text-[var(--color-foreground)]">
                <div className="mb-1 flex items-center gap-1.5 font-bold">
                  <Icon name="info" size={18} />
                  データに関する注意
                </div>
                <ul className="list-disc space-y-0.5 pl-5">
                  {warningMessages.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </section>
            )}

            {/* KPI */}
            <section className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              <KpiCard
                label="MRR(月間経常収益)"
                value={formatYen(kpis.mrr.totalJpy)}
                subLines={[
                  `Stripe ${formatYen(kpis.mrr.billingJpy)} / App Store ${formatYen(kpis.mrr.appstoreJpy)}(推定)`,
                ]}
              />
              <KpiCard
                label="有料会員数"
                value={`${formatNumber(kpis.members.activeProBilling + kpis.members.activeProAppstore)}名`}
                subLines={[
                  `課金${formatNumber(kpis.members.activeProBilling)} / App Store ${formatNumber(kpis.members.activeProAppstore)} / テストPro ${formatNumber(kpis.members.activeProTest)}(売上なし)`,
                  `解約予約 ${formatNumber(kpis.members.pendingCancellations)}名・支払遅延 ${formatNumber(kpis.members.pastDue)}名`,
                ]}
              />
              <KpiCard
                label={`当月純売上高(${formatMonthLabel(currentMonthKey)})`}
                value={formatYen(
                  summary.monthly.find((row) => row.monthKey === currentMonthKey)?.revenue.netJpy ?? 0,
                )}
                subLines={[`ARPPU ${kpis.arppuJpy === null ? '—' : formatYen(kpis.arppuJpy)}`]}
              />
              <KpiCard
                label="当月営業損益"
                value={`${formatAccounting(
                  summary.monthly.find((row) => row.monthKey === currentMonthKey)?.profit.operatingJpy ?? 0,
                )}円`}
                tone={
                  (summary.monthly.find((row) => row.monthKey === currentMonthKey)?.profit.operatingJpy ?? 0) < 0
                    ? 'error'
                    : 'default'
                }
                subLines={[
                  `営業利益率 ${formatPercent(
                    summary.monthly.find((row) => row.monthKey === currentMonthKey)?.profit.operatingRate ?? null,
                  )}`,
                ]}
              />
              <KpiCard
                label="損益分岐点(必要有料会員数)"
                value={
                  kpis.breakeven.requiredProMembers === null
                    ? '—'
                    : `${formatNumber(kpis.breakeven.requiredProMembers)}名`
                }
                subLines={
                  kpis.breakeven.requiredProMembers === null
                    ? ['会員あたり貢献利益がマイナスのため算出不可(AI原価が単価を超過)']
                    : [
                        `月間固定費 ${formatYen(kpis.breakeven.monthlyFixedJpy)} ÷ 会員あたり貢献利益 ${formatYen(kpis.breakeven.contributionPerMemberJpy)}`,
                      ]
                }
              />
              <KpiCard
                label="当月AI原価"
                value={formatYen(
                  summary.monthly.find((row) => row.monthKey === currentMonthKey)?.costs.aiJpy ?? 0,
                )}
                subLines={[
                  `月末ペース予測 ${
                    kpis.currentMonthAiForecastJpy === null ? '—' : formatYen(kpis.currentMonthAiForecastJpy)
                  }`,
                ]}
              />
            </section>

            {/* 月次推移チャート */}
            <section className="rounded-2xl border-2 border-b-4 border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <h2 className="mb-3 font-bold text-[var(--color-foreground)]">月次推移(単位: 円)</h2>
              <MonthlyPnlChart monthly={summary.monthly} />
            </section>

            {/* 月次損益計算書 */}
            <section className="rounded-2xl border-2 border-b-4 border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-bold text-[var(--color-foreground)]">月次損益計算書(単位: 円)</h2>
                <p className="text-xs text-[var(--color-muted)]">現金主義(入金日/発生日ベース)・負値は▲表記</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)] text-xs text-[var(--color-muted)]">
                      <th className="py-2 pr-3 font-semibold">科目</th>
                      {summary.monthly.map((row) => (
                        <th key={row.monthKey} className="py-2 pr-3 text-right font-semibold">
                          {shortMonthLabel(row.monthKey, 0)}
                        </th>
                      ))}
                      <th className="py-2 text-right font-semibold">期間合計</th>
                    </tr>
                  </thead>
                  <tbody className="[&_td]:py-1.5 [&_td]:pr-3">
                    <PnlRow
                      label="売上高(サブスク)"
                      cells={summary.monthly.map((row) =>
                        row.revenue.subscriptionSource === 'unavailable'
                          ? '—'
                          : `${formatAccounting(row.revenue.subscriptionJpy)}${row.revenue.subscriptionSource === 'estimate' ? '※' : ''}`,
                      )}
                      total={formatAccounting(
                        summary.monthly.reduce((acc, row) => acc + row.revenue.subscriptionJpy, 0),
                      )}
                    />
                    <PnlRow
                      label="売上高(コインパック)"
                      cells={summary.monthly.map((row) => formatAccounting(row.revenue.coinPackJpy))}
                      total={formatAccounting(
                        summary.monthly.reduce((acc, row) => acc + row.revenue.coinPackJpy, 0),
                      )}
                    />
                    <PnlRow
                      label="返金"
                      cells={summary.monthly.map((row) => formatAccounting(-row.revenue.refundJpy))}
                      total={formatAccounting(
                        -summary.monthly.reduce((acc, row) => acc + row.revenue.refundJpy, 0),
                      )}
                    />
                    <PnlRow
                      label="純売上高"
                      emphasis
                      cells={summary.monthly.map((row) => formatAccounting(row.revenue.netJpy))}
                      total={formatAccounting(summary.totals.revenueNetJpy)}
                    />
                    <PnlRow
                      label="AI API原価"
                      cells={summary.monthly.map((row) => formatAccounting(-row.costs.aiJpy))}
                      total={formatAccounting(-summary.totals.aiJpy)}
                    />
                    <PnlRow
                      label="決済手数料(試算)"
                      cells={summary.monthly.map((row) => formatAccounting(-row.costs.paymentFeeJpy))}
                      total={formatAccounting(-summary.totals.paymentFeeJpy)}
                    />
                    <PnlRow
                      label="限界利益"
                      emphasis
                      cells={summary.monthly.map((row) => formatAccounting(row.profit.marginalJpy))}
                      total={formatAccounting(
                        summary.monthly.reduce((acc, row) => acc + row.profit.marginalJpy, 0),
                      )}
                    />
                    <PnlRow
                      label="(限界利益率)"
                      muted
                      cells={summary.monthly.map((row) => formatPercent(row.profit.marginalRate))}
                      total=""
                    />
                    <PnlRow
                      label="固定費"
                      cells={summary.monthly.map((row) => formatAccounting(-row.costs.fixedJpy))}
                      total={formatAccounting(-summary.totals.fixedJpy)}
                    />
                    <PnlRow
                      label="営業損益"
                      emphasis
                      cells={summary.monthly.map((row) => formatAccounting(row.profit.operatingJpy))}
                      total={formatAccounting(summary.totals.operatingJpy)}
                      negativeInRed
                      rawValues={summary.monthly.map((row) => row.profit.operatingJpy)}
                    />
                    <PnlRow
                      label="(営業利益率)"
                      muted
                      cells={summary.monthly.map((row) => formatPercent(row.profit.operatingRate))}
                      total=""
                    />
                  </tbody>
                </table>
              </div>
              {hasEstimatedSubscription && (
                <p className="mt-2 text-xs text-[var(--color-muted)]">
                  ※ Stripe未接続のため当月会員数×月額{formatYen(summary.assumptions.proPriceJpy)}の推定値
                </p>
              )}
            </section>

            {/* 固定費管理 */}
            <section className="rounded-2xl border-2 border-b-4 border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="font-bold text-[var(--color-foreground)]">固定費管理</h2>
                  <p className="text-xs text-[var(--color-muted)]">
                    DB・ホスティング等の静的費用を登録すると損益計算に自動反映されます(年額は1/12按分)
                  </p>
                </div>
                <Button
                  size="sm"
                  onClick={() => {
                    setFormOpen((open) => !open);
                    setEditingId(null);
                    setForm(emptyFixedCostForm());
                    setFormError(null);
                  }}
                >
                  <Icon name={formOpen ? 'close' : 'add'} size={16} />
                  {formOpen ? '閉じる' : '固定費を追加'}
                </Button>
              </div>

              {formOpen && (
                <div className="mb-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-[var(--color-muted)]">費目名 *</span>
                      <input
                        value={form.name}
                        onChange={(event) => setForm({ ...form, name: event.target.value })}
                        placeholder="例: Supabase Pro"
                        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-foreground)]"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-[var(--color-muted)]">カテゴリ</span>
                      <select
                        value={form.category}
                        onChange={(event) => setForm({ ...form, category: event.target.value })}
                        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-foreground)]"
                      >
                        {FIXED_COST_CATEGORIES.map((category) => (
                          <option key={category} value={category}>
                            {FIXED_COST_CATEGORY_LABELS[category]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-[var(--color-muted)]">支払先</span>
                      <input
                        value={form.vendor}
                        onChange={(event) => setForm({ ...form, vendor: event.target.value })}
                        placeholder="例: Supabase"
                        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-foreground)]"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-[var(--color-muted)]">金額(円) *</span>
                      <input
                        type="number"
                        min={0}
                        value={form.amountJpy}
                        onChange={(event) => setForm({ ...form, amountJpy: event.target.value })}
                        placeholder="3750"
                        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-foreground)]"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-[var(--color-muted)]">請求サイクル</span>
                      <select
                        value={form.billingCycle}
                        onChange={(event) => setForm({ ...form, billingCycle: event.target.value })}
                        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-foreground)]"
                      >
                        {BILLING_CYCLES.map((cycle) => (
                          <option key={cycle} value={cycle}>
                            {BILLING_CYCLE_LABELS[cycle]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-[var(--color-muted)]">開始日 *</span>
                      <input
                        type="date"
                        value={form.startsOn}
                        onChange={(event) => setForm({ ...form, startsOn: event.target.value })}
                        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-foreground)]"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-[var(--color-muted)]">終了日(任意)</span>
                      <input
                        type="date"
                        value={form.endsOn}
                        onChange={(event) => setForm({ ...form, endsOn: event.target.value })}
                        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-foreground)]"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs text-[var(--color-muted)]">メモ(任意)</span>
                      <input
                        value={form.notes}
                        onChange={(event) => setForm({ ...form, notes: event.target.value })}
                        placeholder="例: 2026年4月にプラン変更"
                        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-foreground)]"
                      />
                    </label>
                  </div>
                  {formError && (
                    <p className="mt-3 text-sm font-bold text-[var(--color-error)]">{formError}</p>
                  )}
                  <div className="mt-3 flex justify-end">
                    <Button size="sm" onClick={() => void handleSaveFixedCost()} disabled={saving}>
                      {saving ? '保存中...' : editingId ? '更新する' : '登録する'}
                    </Button>
                  </div>
                </div>
              )}

              {fixedCosts.length === 0 ? (
                <p className="text-sm text-[var(--color-muted)]">
                  固定費がまだ登録されていません。「固定費を追加」から登録してください。
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border)] text-xs text-[var(--color-muted)]">
                        <th className="py-2 pr-3 font-semibold">費目</th>
                        <th className="py-2 pr-3 font-semibold">カテゴリ</th>
                        <th className="py-2 pr-3 font-semibold">支払先</th>
                        <th className="py-2 pr-3 font-semibold">サイクル</th>
                        <th className="py-2 pr-3 text-right font-semibold">金額</th>
                        <th className="py-2 pr-3 text-right font-semibold">当月計上額</th>
                        <th className="py-2 pr-3 font-semibold">適用期間</th>
                        <th className="py-2 font-semibold">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fixedCosts.map((cost) => (
                        <tr key={cost.id} className="border-b border-[var(--color-border)]/60">
                          <td className="py-2 pr-3 font-bold text-[var(--color-foreground)]" title={cost.notes ?? undefined}>
                            {cost.name}
                          </td>
                          <td className="py-2 pr-3 text-[var(--color-foreground)]">
                            {FIXED_COST_CATEGORY_LABELS[cost.category]}
                          </td>
                          <td className="py-2 pr-3 text-[var(--color-foreground)]">{cost.vendor ?? '—'}</td>
                          <td className="py-2 pr-3 text-[var(--color-foreground)]">
                            {BILLING_CYCLE_LABELS[cost.billingCycle]}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono tabular-nums text-[var(--color-foreground)]">
                            {formatYen(cost.amountJpy)}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono tabular-nums text-[var(--color-foreground)]">
                            {formatYen(monthlyAmountJpy(cost, currentMonthKey))}
                          </td>
                          <td className="py-2 pr-3 text-xs text-[var(--color-muted)]">
                            {cost.startsOn} 〜 {cost.endsOn ?? ''}
                          </td>
                          <td className="py-2">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className="text-xs font-bold text-[var(--color-muted)] underline"
                                onClick={() => {
                                  setEditingId(cost.id);
                                  setForm(formFromFixedCost(cost));
                                  setFormOpen(true);
                                  setFormError(null);
                                }}
                              >
                                編集
                              </button>
                              <button
                                type="button"
                                className="text-xs font-bold text-[var(--color-error)] underline"
                                onClick={() => void handleDeleteFixedCost(cost)}
                              >
                                削除
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* AI原価内訳 */}
            <section className="rounded-2xl border-2 border-b-4 border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-bold text-[var(--color-foreground)]">AI API原価の内訳(期間合計)</h2>
                <p className="text-xs text-[var(--color-muted)]">
                  使用量に応じて自動集計。詳細は <Link href="/ops/api-costs" className="underline">APIコスト詳細</Link> へ
                </p>
              </div>
              {summary.aiBreakdown.length === 0 ? (
                <p className="text-sm text-[var(--color-muted)]">対象期間のAI利用記録はありません。</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border)] text-xs text-[var(--color-muted)]">
                        <th className="py-2 pr-3 font-semibold">提供元 / モデル</th>
                        <th className="py-2 pr-3 text-right font-semibold">呼出回数</th>
                        <th className="py-2 pr-3 text-right font-semibold">トークン</th>
                        <th className="py-2 text-right font-semibold">推定原価</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.aiBreakdown.map((row) => (
                        <tr key={`${row.provider}:${row.model}`} className="border-b border-[var(--color-border)]/60">
                          <td className="py-2 pr-3 text-[var(--color-foreground)]">
                            {row.provider} / {row.model}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono tabular-nums text-[var(--color-foreground)]">
                            {formatNumber(row.calls)}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono tabular-nums text-[var(--color-foreground)]">
                            {formatNumber(row.totalTokens)}
                          </td>
                          <td className="py-2 text-right font-mono tabular-nums text-[var(--color-foreground)]">
                            {formatYen(row.costJpy)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* コインパック販売 */}
            <section className="rounded-2xl border-2 border-b-4 border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <h2 className="mb-3 font-bold text-[var(--color-foreground)]">コインパック販売実績(期間合計)</h2>
              {summary.coinPackSummary.length === 0 ? (
                <p className="text-sm text-[var(--color-muted)]">対象期間のコインパック購入はありません。</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border)] text-xs text-[var(--color-muted)]">
                        <th className="py-2 pr-3 font-semibold">パック</th>
                        <th className="py-2 pr-3 text-right font-semibold">単価</th>
                        <th className="py-2 pr-3 text-right font-semibold">販売数</th>
                        <th className="py-2 pr-3 text-right font-semibold">付与コイン</th>
                        <th className="py-2 text-right font-semibold">売上</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.coinPackSummary.map((pack) => (
                        <tr key={pack.packId} className="border-b border-[var(--color-border)]/60">
                          <td className="py-2 pr-3 text-[var(--color-foreground)]">{pack.name}</td>
                          <td className="py-2 pr-3 text-right font-mono tabular-nums text-[var(--color-foreground)]">
                            {formatYen(pack.unitPriceJpy)}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono tabular-nums text-[var(--color-foreground)]">
                            {formatNumber(pack.purchases)}
                          </td>
                          <td className="py-2 pr-3 text-right font-mono tabular-nums text-[var(--color-foreground)]">
                            {formatNumber(pack.coins)}
                          </td>
                          <td className="py-2 text-right font-mono tabular-nums text-[var(--color-foreground)]">
                            {formatYen(pack.revenueJpy)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* 前提・計算方法 */}
            <section className="rounded-2xl border-2 border-b-4 border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-xs leading-relaxed text-[var(--color-muted)]">
              <h2 className="mb-2 text-sm font-bold text-[var(--color-foreground)]">前提・計算方法</h2>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  サブスク売上はStripeの支払済み請求書(入金実績)をJST月で集計。App Store課金は金額連携が
                  ないため売上には含めず、会員数とMRR推定(月額{formatYen(summary.assumptions.proPriceJpy)}
                  換算・Apple手数料控除前)のみ表示しています。
                </li>
                <li>コインパック売上は購入記録×税込販売価格で集計(PayPay等の決済手段もStripe経由で捕捉)。</li>
                <li>
                  AI API原価は利用の都度記録される推定額(モデル別トークン単価表・想定レート $1=¥150)の集計値で、
                  使用量に応じて日々変動します。請求確定額はGoogle / OpenAIの請求書をご確認ください。
                </li>
                <li>
                  決済手数料はStripe標準料率{(summary.assumptions.stripeFeeRate * 100).toFixed(1)}%による試算です。
                  実額はStripeダッシュボードの残高明細をご確認ください。
                </li>
                <li>固定費は登録内容に基づく計上(年額は1/12按分、単発は開始月に全額)。消費税の区分経理は未対応です。</li>
                <li>限界利益 = 純売上高 − AI原価 − 決済手数料。営業損益 = 限界利益 − 固定費。</li>
              </ul>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function PnlRow({
  label,
  cells,
  total,
  emphasis = false,
  muted = false,
  negativeInRed = false,
  rawValues,
}: {
  label: string;
  cells: string[];
  total: string;
  emphasis?: boolean;
  muted?: boolean;
  negativeInRed?: boolean;
  rawValues?: number[];
}) {
  const baseText = muted
    ? 'text-xs text-[var(--color-muted)]'
    : 'text-[var(--color-foreground)]';
  return (
    <tr className={`border-b border-[var(--color-border)]/50 ${emphasis ? 'font-bold' : ''}`}>
      <td className={`whitespace-nowrap ${baseText}`}>{label}</td>
      {cells.map((cell, index) => (
        <td
          key={index}
          className={`text-right font-mono tabular-nums ${
            negativeInRed && rawValues && rawValues[index] < 0
              ? 'text-[var(--color-error)]'
              : baseText
          }`}
        >
          {cell}
        </td>
      ))}
      <td className={`text-right font-mono tabular-nums ${baseText}`}>{total}</td>
    </tr>
  );
}
