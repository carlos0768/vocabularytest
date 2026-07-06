import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  normalizeLegacyScanJobClientPlatform,
  resolveScanJobSaveMode,
  type ScanJobClientPlatform,
  type ScanJobSaveMode,
} from '@/lib/scan/job-create-contract';

const createRouteSource = readFileSync(
  fileURLToPath(new URL('./route.ts', import.meta.url)),
  'utf8',
);

const legacyRouteSource = readFileSync(
  fileURLToPath(new URL('../route.ts', import.meta.url)),
  'utf8',
);

function assertSourceOrder(source: string, fragments: string[]) {
  let cursor = -1;

  for (const fragment of fragments) {
    const index = source.indexOf(fragment, cursor + 1);
    assert.ok(index > cursor, `missing or out-of-order fragment: ${fragment}`);
    cursor = index;
  }
}

test('scan job save mode matrix matches current platform and Pro contract', () => {
  const cases: Array<{
    clientPlatform: ScanJobClientPlatform;
    isProUser: boolean;
    expected: ScanJobSaveMode;
  }> = [
    { clientPlatform: 'web', isProUser: false, expected: 'server_cloud' },
    { clientPlatform: 'web', isProUser: true, expected: 'server_cloud' },
    { clientPlatform: 'ios', isProUser: false, expected: 'client_local' },
    { clientPlatform: 'ios', isProUser: true, expected: 'server_cloud' },
    { clientPlatform: 'android', isProUser: false, expected: 'client_local' },
    { clientPlatform: 'android', isProUser: true, expected: 'server_cloud' },
  ];

  for (const { clientPlatform, isProUser, expected } of cases) {
    assert.equal(
      resolveScanJobSaveMode({ clientPlatform, isProUser }),
      expected,
      `${clientPlatform} isPro=${isProUser}`,
    );
  }
});

test('legacy scan job route keeps existing clientPlatform normalization', () => {
  const cases: Array<[string | null | undefined, ScanJobClientPlatform]> = [
    ['ios', 'ios'],
    [' IOS ', 'ios'],
    ['android', 'android'],
    ['ANDROID', 'android'],
    ['web', 'web'],
    ['unknown', 'web'],
    ['', 'web'],
    [null, 'web'],
    [undefined, 'web'],
  ];

  for (const [value, expected] of cases) {
    assert.equal(normalizeLegacyScanJobClientPlatform(value), expected);
  }
});

test('scan job create route keeps uploaded-image existence check before coin consumption', () => {
  assertSourceOrder(createRouteSource, [
    "getSupabaseAdmin().storage\n        .from('scan-images')",
    'return NextResponse.json({ error: `Image not found: ${fileName}` }, { status: 400 });',
    'const gate = await consumeScanGate(supabase, {',
  ]);
});

test('scan job create route consumes via the shared scan gate with a pre-generated job id', () => {
  assertSourceOrder(createRouteSource, [
    'const jobId = randomUUID();',
    'const gate = await consumeScanGate(supabase, {',
    'imageCount: imagePaths.length,',
    'scanJobId: jobId,',
    'if (!gate.ok) {',
    'return NextResponse.json(gate.body, { status: gate.status });',
  ]);
});

test('scan job create route refunds coins when the job row cannot be persisted', () => {
  assertSourceOrder(createRouteSource, [
    'const { data: job, error: insertError, usedLegacyColumns } = await insertScanJobWithCompat',
    'id: jobId,',
    'await refundScanCoinsForJob(jobId, getSupabaseAdmin());',
  ]);
});

test('scan job creation routes use shared save mode contract and direct after processing', () => {
  for (const source of [createRouteSource, legacyRouteSource]) {
    assert.ok(source.includes('resolveScanJobSaveMode({ clientPlatform, isProUser })'));
    assert.ok(source.includes('after(async () =>'));
    assert.ok(source.includes('await processJobById(jobId, { scanModesOverride });'));
    assert.equal(source.includes('/api/scan-jobs/process'), false);
  }

  assert.ok(legacyRouteSource.includes('normalizeLegacyScanJobClientPlatform'));

  assertSourceOrder(createRouteSource, [
    'const { data: job, error: insertError, usedLegacyColumns } = await insertScanJobWithCompat',
    'scheduleScanJobProcessing(String(job.id), scanModes);',
  ]);
});

test('scan job create route refunds on target-project-404 and hoists a catch-all refund', () => {
  assertSourceOrder(createRouteSource, [
    'let consumedJobId: string | null = null;',
    'consumedJobId = jobId;',
    "return NextResponse.json({ error: '指定した単語帳が見つかりません。' }, { status: 400 });",
    'consumedJobId = null;',
    'if (consumedJobId) {',
    'await refundScanCoinsForJob(consumedJobId, getSupabaseAdmin());',
  ]);

  // target-404 の直前に返還があること
  const notFoundIdx = createRouteSource.indexOf("指定した単語帳が見つかりません");
  const refundBefore = createRouteSource.lastIndexOf('await refundScanCoinsForJob(jobId, getSupabaseAdmin());', notFoundIdx);
  assert.ok(refundBefore >= 0 && notFoundIdx - refundBefore < 300, 'refund must precede target-404 return');
});

test('scan job create route omits coinInfo when the coin system is off (flag-off byte compatibility)', () => {
  assert.ok(createRouteSource.includes('...(gate.coinInfo ? { coinInfo: gate.coinInfo } : {})'));
  assert.equal(createRouteSource.includes('coinInfo: gate.coinInfo,'), false);
});

test('legacy scan job route refunds on target-404, upload failure, catch-all, and timeout sweep', () => {
  assertSourceOrder(legacyRouteSource, [
    'let consumedJobId: string | null = null;',
    'consumedJobId = jobId;',
    "return NextResponse.json({ error: '指定した単語帳が見つかりません。' }, { status: 400 });",
    "return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 });",
    'consumedJobId = null;',
    'if (consumedJobId) {',
    'await refundScanCoinsForJob(consumedJobId, getSupabaseAdmin());',
  ]);

  // タイムアウト安全網: 実際に failed に遷移した行だけ返還する
  assertSourceOrder(legacyRouteSource, [
    ".in('status', ['pending', 'processing'])",
    ".select('id')",
    'for (const row of timedOutRows ?? []) {',
    'await refundScanCoinsForJob(String((row as { id: string }).id), getSupabaseAdmin());',
  ]);
});
