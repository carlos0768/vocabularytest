// 固定費(finance_fixed_costs)のドメイン型と月次按分ロジック。
// カテゴリ・請求サイクルのCHECK制約は
// supabase/migrations/20260721090000_create_finance_dashboard.sql と対で管理する。

export const FIXED_COST_CATEGORIES = [
  'infrastructure',
  'database',
  'ai_api',
  'saas',
  'payment',
  'marketing',
  'other',
] as const;

export type FixedCostCategory = (typeof FIXED_COST_CATEGORIES)[number];

export const FIXED_COST_CATEGORY_LABELS: Record<FixedCostCategory, string> = {
  infrastructure: 'インフラ・ホスティング',
  database: 'データベース',
  ai_api: 'AI API(固定枠)',
  saas: 'SaaS・外部サービス',
  payment: '決済関連',
  marketing: 'マーケティング',
  other: 'その他',
};

export const BILLING_CYCLES = ['monthly', 'yearly', 'one_time'] as const;

export type BillingCycle = (typeof BILLING_CYCLES)[number];

export const BILLING_CYCLE_LABELS: Record<BillingCycle, string> = {
  monthly: '月額',
  yearly: '年額(月割按分)',
  one_time: '単発',
};

export interface FixedCost {
  id: string;
  name: string;
  category: FixedCostCategory;
  vendor: string | null;
  amountJpy: number;
  billingCycle: BillingCycle;
  startsOn: string; // 'YYYY-MM-DD'
  endsOn: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

type FixedCostRow = {
  id: string;
  name: string;
  category: string;
  vendor: string | null;
  amount_jpy: number | string;
  billing_cycle: string;
  starts_on: string;
  ends_on: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function toNumber(value: number | string): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function fixedCostRowToDomain(row: FixedCostRow): FixedCost {
  const category = (FIXED_COST_CATEGORIES as readonly string[]).includes(row.category)
    ? (row.category as FixedCostCategory)
    : 'other';
  const billingCycle = (BILLING_CYCLES as readonly string[]).includes(row.billing_cycle)
    ? (row.billing_cycle as BillingCycle)
    : 'monthly';
  return {
    id: row.id,
    name: row.name,
    category,
    vendor: row.vendor,
    amountJpy: toNumber(row.amount_jpy),
    billingCycle,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function monthOf(dateStr: string): string {
  return dateStr.slice(0, 7);
}

// 指定月('YYYY-MM')に計上する金額。
// monthly: 開始月〜終了月(未設定なら無期限)に全額
// yearly:  同上の範囲に 1/12 を月割按分
// one_time: 開始日の属する月にのみ全額
export function monthlyAmountJpy(cost: FixedCost, monthKey: string): number {
  const startMonth = monthOf(cost.startsOn);
  if (cost.billingCycle === 'one_time') {
    return monthKey === startMonth ? cost.amountJpy : 0;
  }
  if (monthKey < startMonth) return 0;
  if (cost.endsOn && monthKey > monthOf(cost.endsOn)) return 0;
  return cost.billingCycle === 'yearly' ? cost.amountJpy / 12 : cost.amountJpy;
}
