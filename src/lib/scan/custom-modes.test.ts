import test from 'node:test';
import assert from 'node:assert/strict';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  MAX_CUSTOM_SCAN_MODE_NAME_LENGTH,
  MAX_CUSTOM_SCAN_MODE_PROMPT_LENGTH,
  mapCustomScanModeRow,
  normalizeCustomScanModeName,
  normalizeCustomScanModePrompt,
  resolveCustomExtractionPrompt,
} from '@/lib/scan/custom-modes';

test('normalizeCustomScanModeName trims, collapses whitespace, and rejects invalid values', () => {
  assert.equal(normalizeCustomScanModeName('  赤ペンの   単語 '), '赤ペンの 単語');
  assert.equal(normalizeCustomScanModeName('改行\nあり'), '改行 あり');
  assert.equal(normalizeCustomScanModeName(''), null);
  assert.equal(normalizeCustomScanModeName('   '), null);
  assert.equal(normalizeCustomScanModeName(42), null);
  assert.equal(normalizeCustomScanModeName('あ'.repeat(MAX_CUSTOM_SCAN_MODE_NAME_LENGTH)), 'あ'.repeat(MAX_CUSTOM_SCAN_MODE_NAME_LENGTH));
  assert.equal(normalizeCustomScanModeName('あ'.repeat(MAX_CUSTOM_SCAN_MODE_NAME_LENGTH + 1)), null);
});

test('normalizeCustomScanModePrompt keeps newlines but drops control characters', () => {
  assert.equal(
    normalizeCustomScanModePrompt('赤字の単語だけ\n\n\n黒字は除外  '),
    '赤字の単語だけ\n\n黒字は除外',
  );
  // 制御文字（ベル \u0007）は空白に置き換える
  assert.equal(normalizeCustomScanModePrompt('制御\u0007文字'), '制御 文字');
  assert.equal(normalizeCustomScanModePrompt('  '), null);
  assert.equal(normalizeCustomScanModePrompt(null), null);
  assert.equal(normalizeCustomScanModePrompt('あ'.repeat(MAX_CUSTOM_SCAN_MODE_PROMPT_LENGTH + 1)), null);
});

test('mapCustomScanModeRow rejects rows whose name or prompt is unusable', () => {
  const valid = mapCustomScanModeRow({
    id: 'a3f1c8de-0000-4000-8000-000000000000',
    name: ' 赤ペン ',
    prompt: ' 赤字だけ抽出 ',
    created_at: '2026-07-26T00:00:00Z',
    updated_at: '2026-07-26T00:00:00Z',
  });
  assert.deepEqual(valid, {
    id: 'a3f1c8de-0000-4000-8000-000000000000',
    name: '赤ペン',
    prompt: '赤字だけ抽出',
    createdAt: '2026-07-26T00:00:00Z',
    updatedAt: '2026-07-26T00:00:00Z',
  });

  assert.equal(
    mapCustomScanModeRow({ id: 'x', name: '', prompt: 'p', created_at: '', updated_at: '' }),
    null,
  );
  assert.equal(
    mapCustomScanModeRow({ id: 42, name: 'n', prompt: 'p', created_at: '', updated_at: '' }),
    null,
  );
});

function stubSupabase(row: { prompt: unknown } | null, error: { message: string } | null = null) {
  const filters: Record<string, unknown> = {};
  const builder = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filters[column] = value;
      return builder;
    },
    maybeSingle: async () => ({ data: row, error }),
  };

  return {
    client: { from: () => builder } as unknown as SupabaseClient,
    filters,
  };
}

test('resolveCustomExtractionPrompt ignores prompts when the scan is not a custom mode', async () => {
  const { client } = stubSupabase({ prompt: '保存済み' });
  const resolved = await resolveCustomExtractionPrompt(client, 'user-1', {
    isCustomMode: false,
    customModeId: 'a3f1c8de-0000-4000-8000-000000000000',
    customPrompt: 'その場入力',
  });

  assert.deepEqual(resolved, { ok: true, prompt: null });
});

test('resolveCustomExtractionPrompt prefers the saved mode and scopes the lookup to the user', async () => {
  const { client, filters } = stubSupabase({ prompt: ' 保存済みプロンプト ' });
  const resolved = await resolveCustomExtractionPrompt(client, 'user-1', {
    isCustomMode: true,
    customModeId: 'a3f1c8de-0000-4000-8000-000000000000',
    // 保存済みモードを指定した場合、クライアント入力は使わない
    customPrompt: 'クライアントが差し込んだ別プロンプト',
  });

  assert.deepEqual(resolved, { ok: true, prompt: '保存済みプロンプト' });
  assert.equal(filters.id, 'a3f1c8de-0000-4000-8000-000000000000');
  assert.equal(filters.user_id, 'user-1');
});

test('resolveCustomExtractionPrompt fails when the saved mode belongs to nobody', async () => {
  const { client } = stubSupabase(null);
  const resolved = await resolveCustomExtractionPrompt(client, 'user-1', {
    isCustomMode: true,
    customModeId: 'a3f1c8de-0000-4000-8000-000000000000',
  });

  assert.equal(resolved.ok, false);
  if (!resolved.ok) {
    assert.match(resolved.error, /見つかりません/);
  }
});

test('resolveCustomExtractionPrompt falls back to an inline prompt and rejects empty input', async () => {
  const { client } = stubSupabase(null);

  const inline = await resolveCustomExtractionPrompt(client, 'user-1', {
    isCustomMode: true,
    customPrompt: ' 動詞だけ抽出して ',
  });
  assert.deepEqual(inline, { ok: true, prompt: '動詞だけ抽出して' });

  const empty = await resolveCustomExtractionPrompt(client, 'user-1', {
    isCustomMode: true,
    customPrompt: '   ',
  });
  assert.equal(empty.ok, false);
});
