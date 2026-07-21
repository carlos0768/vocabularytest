import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  BILLING_CYCLES,
  FIXED_COST_CATEGORIES,
  fixedCostRowToDomain,
} from '@/lib/finance/fixed-costs';
import { requireAdminSecret } from '@/lib/ops/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// 固定費(finance_fixed_costs)の一覧取得・登録API。財務担当が /ops/finance から
// DB費用・ホスティング費用などの静的コストを管理するためのもの。

export const dynamic = 'force-dynamic';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD形式で指定してください');

const fixedCostBodySchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    category: z.enum(FIXED_COST_CATEGORIES),
    vendor: z.string().trim().max(100).nullable().optional(),
    amountJpy: z.number().min(0).max(100_000_000),
    billingCycle: z.enum(BILLING_CYCLES),
    startsOn: dateSchema,
    endsOn: dateSchema.nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .refine(
    (value) => !value.endsOn || value.endsOn >= value.startsOn,
    { message: '終了日は開始日以降にしてください' },
  );

export async function GET(request: NextRequest) {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('finance_fixed_costs')
      .select('*')
      .order('category')
      .order('name');
    if (error) throw new Error(error.message);

    return NextResponse.json({
      success: true,
      fixedCosts: (data ?? []).map(fixedCostRowToDomain),
    });
  } catch (error) {
    console.error('[OpsFinance] failed to list fixed costs:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to list fixed costs' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const body = await request.json().catch(() => null);
    const parsed = fixedCostBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid fixed cost payload', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('finance_fixed_costs')
      .insert({
        name: parsed.data.name,
        category: parsed.data.category,
        vendor: parsed.data.vendor ?? null,
        amount_jpy: parsed.data.amountJpy,
        billing_cycle: parsed.data.billingCycle,
        starts_on: parsed.data.startsOn,
        ends_on: parsed.data.endsOn ?? null,
        notes: parsed.data.notes ?? null,
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true, fixedCost: fixedCostRowToDomain(data) });
  } catch (error) {
    console.error('[OpsFinance] failed to create fixed cost:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create fixed cost' },
      { status: 500 },
    );
  }
}
