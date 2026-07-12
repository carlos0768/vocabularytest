import test from 'node:test';
import assert from 'node:assert/strict';

import { announcementBlocksSchema, mapAnnouncementRow } from './blocks';

const VALID_BLOCKS = [
  { type: 'h2', text: '新機能: 語彙力レベル診断' },
  { type: 'p', text: '20問のクイズであなたの語彙レベルを診断できるようになりました。' },
  { type: 'list', items: ['英検5級〜1級で判定', '推定語彙数も表示', '結果をSNSでシェア'] },
  { type: 'callout', tone: 'info', icon: 'info', title: 'ヒント', text: '無料・登録不要で使えます。' },
  { type: 'feature', icon: 'military_tech', title: 'レベル判定', description: '正解するほど難しくなります。' },
  { type: 'button', label: 'いますぐ診断する', href: '/level-test', variant: 'accent' },
  { type: 'image', src: 'https://www.merken.jp/screenshots/level-test.png', alt: '診断画面' },
  { type: 'note', text: '結果は端末にのみ保存されます。' },
];

test('announcementBlocksSchema accepts a full valid document', () => {
  const result = announcementBlocksSchema.safeParse(VALID_BLOCKS);
  assert.equal(result.success, true);
});

test('announcementBlocksSchema rejects unknown block types and extra fields', () => {
  assert.equal(announcementBlocksSchema.safeParse([{ type: 'html', text: '<b>x</b>' }]).success, false);
  assert.equal(
    announcementBlocksSchema.safeParse([{ type: 'p', text: 'ok', onClick: 'alert(1)' }]).success,
    false,
  );
});

test('announcementBlocksSchema rejects empty and oversized documents', () => {
  assert.equal(announcementBlocksSchema.safeParse([]).success, false);
  const oversized = Array.from({ length: 41 }, () => ({ type: 'p', text: 'x' }));
  assert.equal(announcementBlocksSchema.safeParse(oversized).success, false);
});

test('href/src reject javascript: and protocol-relative URLs', () => {
  for (const href of ['javascript:alert(1)', '//evil.example.com', 'http://insecure.example.com', 'data:text/html,x']) {
    assert.equal(
      announcementBlocksSchema.safeParse([{ type: 'button', label: 'x', href }]).success,
      false,
      `should reject ${href}`,
    );
  }
  assert.equal(
    announcementBlocksSchema.safeParse([{ type: 'button', label: 'x', href: '/level-test' }]).success,
    true,
  );
  assert.equal(
    announcementBlocksSchema.safeParse([{ type: 'button', label: 'x', href: 'https://www.merken.jp/' }]).success,
    true,
  );
});

test('mapAnnouncementRow revalidates blocks and status', () => {
  const base = {
    id: 'a-1',
    title: 'テスト',
    body_blocks: [{ type: 'p', text: '本文' }],
    status: 'published',
    published_at: '2026-07-12T00:00:00Z',
    created_at: '2026-07-12T00:00:00Z',
    updated_at: '2026-07-12T00:00:00Z',
  };

  const mapped = mapAnnouncementRow(base);
  assert.ok(mapped);
  assert.equal(mapped!.status, 'published');
  assert.equal(mapped!.bodyBlocks.length, 1);

  assert.equal(mapAnnouncementRow({ ...base, body_blocks: [{ type: 'script', text: 'x' }] }), null);
  assert.equal(mapAnnouncementRow({ ...base, status: 'archived' }), null);
});
