import { NextRequest, NextResponse } from 'next/server';
import { getFinanceDashboardSummary } from '@/lib/finance/summary';
import { requireAdminSecret } from '@/lib/ops/admin-auth';

// /ops/finance 財務ダッシュボードの月次集計API。
// 売上(Stripe請求書実績+コインパック)・AI原価・固定費按分・KPIを返す。

export const dynamic = 'force-dynamic';

function parseMonths(value: string | null): number {
  const parsed = Number(value ?? '6');
  if (!Number.isFinite(parsed)) return 6;
  return Math.max(1, Math.min(12, Math.round(parsed)));
}

export async function GET(request: NextRequest) {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const months = parseMonths(request.nextUrl.searchParams.get('months'));
    const summary = await getFinanceDashboardSummary(months);
    return NextResponse.json({ success: true, summary });
  } catch (error) {
    console.error('[OpsFinance] failed to load summary:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load finance summary' },
      { status: 500 },
    );
  }
}
