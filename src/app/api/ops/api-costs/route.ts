import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getApiCostDashboardSummary } from '@/lib/api-cost/dashboard';

const adminHeaderSchema = z.object({
  adminSecret: z.string().trim().min(1),
}).strict();

function parseDays(value: string | null): number {
  const parsed = Number(value ?? '30');
  if (!Number.isFinite(parsed)) return 30;
  const rounded = Math.round(parsed);
  return Math.max(1, Math.min(365, rounded));
}

export async function GET(request: NextRequest) {
  try {
    const adminSecret = request.headers.get('x-admin-secret');
    if (adminSecret === null) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const parsedHeader = adminHeaderSchema.safeParse({ adminSecret });
    if (!parsedHeader.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid admin secret header' },
        { status: 400 }
      );
    }

    if (parsedHeader.data.adminSecret !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const days = parseDays(request.nextUrl.searchParams.get('days'));
    const summary = await getApiCostDashboardSummary(days);

    return NextResponse.json({
      success: true,
      summary,
    });
  } catch (error) {
    console.error('[ApiCostDashboard] failed to load summary:', error);
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("Could not find the table 'public.api_cost_events'") ||
      message.includes('relation "public.api_cost_events" does not exist')
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'api_cost_events table not found. Apply latest Supabase migrations first.',
        },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { success: false, error: 'Failed to load API cost summary' },
      { status: 500 }
    );
  }
}
