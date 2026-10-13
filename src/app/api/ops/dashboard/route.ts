import { NextRequest, NextResponse } from 'next/server';
import { getApiCostDashboardSummary } from '@/lib/api-cost/dashboard';
import { requireAdminSecret } from '@/lib/ops/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { jstDayStartIso } from '@/lib/date/jst';

// /ops 管理ダッシュボードの集計API。DB・GCPのコンソールを個別に開かなくても
// 「今日のスキャン数/失敗数」「スキャン毎のトークン消費」「ユーザー数」を
// 1画面で確認できるようにする。

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const supabase = getSupabaseAdmin();
    const todayStart = jstDayStartIso();

    const [scanTotal, scanFailed, usersTotal, usersToday, apiCosts] = await Promise.all([
      supabase
        .from('scan_jobs')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', todayStart),
      supabase
        .from('scan_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'failed')
        .gte('created_at', todayStart),
      supabase.from('profiles').select('id', { count: 'exact', head: true }),
      supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', todayStart),
      getApiCostDashboardSummary(7),
    ]);

    for (const result of [scanTotal, scanFailed, usersTotal, usersToday]) {
      if (result.error) throw new Error(result.error.message);
    }

    return NextResponse.json({
      success: true,
      dashboard: {
        scansToday: {
          total: scanTotal.count ?? 0,
          failed: scanFailed.count ?? 0,
        },
        users: {
          total: usersTotal.count ?? 0,
          newToday: usersToday.count ?? 0,
        },
        // 直近7日のAPIコスト集計。scans.recent に各スキャンのトークン消費が入る。
        apiCosts,
      },
    });
  } catch (error) {
    console.error('[OpsDashboard] failed to load:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to load ops dashboard' },
      { status: 500 },
    );
  }
}
