import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  BILLING_CYCLES,
  FIXED_COST_CATEGORIES,
  fixedCostRowToDomain,
} from '@/lib/finance/fixed-costs';
import { requireAdminSecret } from '@/lib/ops/admin-auth';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// 固定費(finance_fixed_costs)の更新・削除API。

export const dynamic = 'force-dynamic';

const idSchema = z.string().uuid();
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD形式で指定してください');

const updateSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    category: z.enum(FIXED_COST_CATEGORIES).optional(),
    vendor: z.string().trim().max(100).nullable().optional(),
    amountJpy: z.number().min(0).max(100_000_000).optional(),
    billingCycle: z.enum(BILLING_CYCLES).optional(),
    startsOn: dateSchema.optional(),
    endsOn: dateSchema.nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, { message: 'empty update' });

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: 'Invalid fixed cost payload', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const updates: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.category !== undefined) updates.category = parsed.data.category;
    if (parsed.data.vendor !== undefined) updates.vendor = parsed.data.vendor;
    if (parsed.data.amountJpy !== undefined) updates.amount_jpy = parsed.data.amountJpy;
    if (parsed.data.billingCycle !== undefined) updates.billing_cycle = parsed.data.billingCycle;
    if (parsed.data.startsOn !== undefined) updates.starts_on = parsed.data.startsOn;
    if (parsed.data.endsOn !== undefined) updates.ends_on = parsed.data.endsOn;
    if (parsed.data.notes !== undefined) updates.notes = parsed.data.notes;

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('finance_fixed_costs')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();
    if (error) {
      // ends_on >= starts_on のCHECK違反は入力エラーとして返す
      if (error.message.includes('finance_fixed_costs_ends_on_check') || error.code === '23514') {
        return NextResponse.json(
          { success: false, error: '終了日は開始日以降にしてください' },
          { status: 400 },
        );
      }
      throw new Error(error.message);
    }

    return NextResponse.json({ success: true, fixedCost: fixedCostRowToDomain(data) });
  } catch (error) {
    console.error('[OpsFinance] failed to update fixed cost:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to update fixed cost' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = requireAdminSecret(request);
  if (denied) return denied;

  try {
    const { id } = await params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ success: false, error: 'Invalid id' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('finance_fixed_costs').delete().eq('id', id);
    if (error) throw new Error(error.message);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[OpsFinance] failed to delete fixed cost:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete fixed cost' },
      { status: 500 },
    );
  }
}
