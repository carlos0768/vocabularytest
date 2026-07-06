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
