import { NextRequest, NextResponse } from 'next/server';
import { getApiCostDashboardSummary } from '@/lib/api-cost/dashboard';
import { requireAdminSecret } from '@/lib/ops/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// /ops 管理ダッシュボードの集計API。DB・GCPのコンソールを個別に開かなくても
// 「今日のスキャン数/失敗数」「スキャン毎のトークン消費」「ユーザー数」を
// 1画面で確認できるようにする。

export const dynamic = 'force-dynamic';

// JSTの「今日」の開始時刻(UTC ISO文字列)
function startOfTodayJstIso(): string {
  const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
  const nowJst = new Date(Date.now() + JST_OFFSET_MS);
  nowJst.setUTCHours(0, 0, 0, 0);
  return new Date(nowJst.getTime() - JST_OFFSET_MS).toISOString();
}

export async function GET(request: NextRequest) {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const supabase = getSupabaseAdmin();
    const todayStart = startOfTodayJstIso();

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
