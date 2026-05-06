import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveAuthenticatedUser } from '@/app/api/share-import/shared';
import { parseJsonWithSchema } from '@/lib/api/validation';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

const onboardingStepSchema = z.enum(['signed_up', 'first_scan_done', 'completed', 'skipped']);
const updateSchema = z.object({
  step: onboardingStepSchema,
}).strict();

export type OnboardingStep = z.infer<typeof onboardingStepSchema>;

type ProfileOnboardingRow = {
  onboarding_step: string | null;
};

type OnboardingRouteDeps = {
  resolveUser?: typeof resolveAuthenticatedUser;
  getAdmin?: typeof getSupabaseAdmin;
};

function normalizeStep(value: unknown): OnboardingStep {
  return onboardingStepSchema.safeParse(value).success ? (value as OnboardingStep) : 'completed';
}

export async function handleOnboardingGet(
  request: NextRequest,
  deps: OnboardingRouteDeps = {},
) {
  try {
    const resolveUser = deps.resolveUser ?? resolveAuthenticatedUser;
    const user = await resolveUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = (deps.getAdmin ?? getSupabaseAdmin)();
    const { data, error } = await admin
      .from('profiles')
      .select('onboarding_step')
      .eq('user_id', user.id)
      .maybeSingle<ProfileOnboardingRow>();

    if (error) {
      console.error('Failed to fetch onboarding profile:', error);
      return NextResponse.json({ error: 'Failed to fetch onboarding step' }, { status: 500 });
    }

    return NextResponse.json({
      step: normalizeStep(data?.onboarding_step ?? null),
    });
  } catch (error) {
    console.error('Onboarding GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function handleOnboardingPatch(
  request: NextRequest,
  deps: OnboardingRouteDeps = {},
) {
  try {
    const resolveUser = deps.resolveUser ?? resolveAuthenticatedUser;
    const user = await resolveUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = await parseJsonWithSchema(request, updateSchema, {
      invalidMessage: 'オンボーディング状態が不正です',
    });
    if (!parsed.ok) {
      return parsed.response;
    }

    const admin = (deps.getAdmin ?? getSupabaseAdmin)();
    const { data, error } = await admin
      .from('profiles')
      .upsert(
        {
          user_id: user.id,
          onboarding_step: parsed.data.step,
        },
        { onConflict: 'user_id' },
      )
      .select('onboarding_step')
      .single<ProfileOnboardingRow>();

    if (error) {
      console.error('Failed to update onboarding profile:', error);
      return NextResponse.json({ error: 'Failed to update onboarding step' }, { status: 500 });
    }

    return NextResponse.json({
      step: normalizeStep(data.onboarding_step),
    });
  } catch (error) {
    console.error('Onboarding PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleOnboardingGet(request);
}

export async function PATCH(request: NextRequest) {
  return handleOnboardingPatch(request);
}
