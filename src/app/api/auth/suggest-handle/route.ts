import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getFriendSchemaIssue } from '@/lib/friends/server';
import { buildHandleCandidates } from '@/lib/auth/handle-suggestions';

const DEFAULT_COUNT = 3;
const MAX_COUNT = 5;
/** Over-generate so taken candidates can be dropped without a second round. */
const POOL_MULTIPLIER = 6;

type SuggestHandleDeps = {
  getAdmin?: typeof getSupabaseAdmin;
  random?: () => number;
};

function parseCount(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(parsed)) return DEFAULT_COUNT;
  return Math.min(MAX_COUNT, Math.max(1, parsed));
}

async function selectTakenHandles(
  admin: ReturnType<typeof getSupabaseAdmin>,
  column: 'user_handle' | 'account_id',
  pool: string[],
): Promise<{ taken: Set<string> } | { missingColumn: true } | { failed: true }> {
  const result = await admin.from('profiles').select(column).in(column, pool);

  if (!result.error) {
    const rows = (result.data ?? []) as Array<Record<string, string | null>>;
    return {
      taken: new Set(rows.map((row) => row[column]).filter((value): value is string => Boolean(value))),
    };
  }

  const issue = getFriendSchemaIssue(result.error);
  if (issue === `profiles_${column}`) return { missingColumn: true };
  return { failed: true };
}

export async function handleSuggestHandleGet(
  request: NextRequest,
  deps: SuggestHandleDeps = {},
) {
  const params = request.nextUrl.searchParams;
  const count = parseCount(params.get('count'));
  const pool = buildHandleCandidates({
    displayName: params.get('name') ?? '',
    handle: params.get('handle') ?? '',
    count: count * POOL_MULTIPLIER,
    random: deps.random,
  });

  if (pool.length === 0) {
    return NextResponse.json({ suggestions: [] });
  }

  const admin = (deps.getAdmin ?? getSupabaseAdmin)();
  const handleResult = await selectTakenHandles(admin, 'user_handle', pool);

  // The handle column is optional in older deployments; fall back to the
  // legacy account_id column, and if neither exists nothing can be taken.
  const resolved = 'missingColumn' in handleResult
    ? await selectTakenHandles(admin, 'account_id', pool)
    : handleResult;

  if ('failed' in resolved) {
    return NextResponse.json({ suggestions: [], error: '候補の取得に失敗しました' }, { status: 500 });
  }

  const taken = 'taken' in resolved ? resolved.taken : new Set<string>();
  const suggestions = pool.filter((candidate) => !taken.has(candidate)).slice(0, count);

  return NextResponse.json({ suggestions });
}

export async function GET(request: NextRequest) {
  return handleSuggestHandleGet(request);
}
