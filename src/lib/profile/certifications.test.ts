import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  MAX_PROFILE_CERTIFICATIONS,
  certificationListSchema,
  certificationSchema,
  formatCertification,
  parseStoredCertifications,
  removeCertification,
  upsertCertification,
  type ProfileCertification,
} from './certifications';

const ok = (value: unknown) => certificationSchema.safeParse(value).success;

test('eiken accepts every grade including 準2級プラス and an optional CSE score', () => {
  for (const grade of ['5', '4', '3', 'pre2', 'pre2plus', '2', 'pre1', '1']) {
    assert.ok(ok({ type: 'eiken', grade }), grade);
  }
  assert.ok(ok({ type: 'eiken', grade: 'pre1', cse: 2400 }));
  assert.ok(ok({ type: 'eiken', grade: 'pre1', cse: null }));
  assert.equal(ok({ type: 'eiken', grade: 'pre3' }), false);
  assert.equal(ok({ type: 'eiken', grade: '1', cse: 3401 }), false);
  assert.equal(ok({ type: 'eiken', grade: '1', cse: 2400.5 }), false);
});

test('eiken without CSE is normalized to cse: null', () => {
  assert.deepEqual(certificationSchema.parse({ type: 'eiken', grade: '2' }), { type: 'eiken', grade: '2', cse: null });
});

test('TOEFL iBT is 0-120 integers and the new band scale is 1.0-6.0 in 0.5 steps', () => {
  assert.ok(ok({ type: 'toefl', scale: 'ibt', score: 0 }));
  assert.ok(ok({ type: 'toefl', scale: 'ibt', score: 120 }));
  assert.equal(ok({ type: 'toefl', scale: 'ibt', score: 121 }), false);
  assert.equal(ok({ type: 'toefl', scale: 'ibt', score: 95.5 }), false);

  assert.ok(ok({ type: 'toefl', scale: 'band', score: 1 }));
  assert.ok(ok({ type: 'toefl', scale: 'band', score: 4.5 }));
  assert.ok(ok({ type: 'toefl', scale: 'band', score: 6 }));
  assert.equal(ok({ type: 'toefl', scale: 'band', score: 4.3 }), false);
  assert.equal(ok({ type: 'toefl', scale: 'band', score: 0.5 }), false);
  assert.equal(ok({ type: 'toefl', scale: 'band', score: 6.5 }), false);
});

test('TOEIC L&R is 10-990 in 5s and S&W is 0-400 in 10s', () => {
  assert.ok(ok({ type: 'toeic', test: 'lr', score: 10 }));
  assert.ok(ok({ type: 'toeic', test: 'lr', score: 855 }));
  assert.ok(ok({ type: 'toeic', test: 'lr', score: 990 }));
  assert.equal(ok({ type: 'toeic', test: 'lr', score: 852 }), false);
  assert.equal(ok({ type: 'toeic', test: 'lr', score: 995 }), false);
  assert.equal(ok({ type: 'toeic', test: 'lr', score: 5 }), false);

  assert.ok(ok({ type: 'toeic', test: 'sw', score: 0 }));
  assert.ok(ok({ type: 'toeic', test: 'sw', score: 310 }));
  assert.equal(ok({ type: 'toeic', test: 'sw', score: 315 }), false);
  assert.equal(ok({ type: 'toeic', test: 'sw', score: 410 }), false);
});

test('unknown fields and unknown types are rejected', () => {
  assert.equal(ok({ type: 'ielts', score: 7 }), false);
  assert.equal(ok({ type: 'toeic', test: 'lr', score: 800, note: '<script>' }), false);
});

test('list schema keeps one entry per kind (last wins) in display order', () => {
  const parsed = certificationListSchema.parse([
    { type: 'toeic', test: 'lr', score: 700 },
    { type: 'eiken', grade: '2' },
    { type: 'toeic', test: 'lr', score: 850 },
    { type: 'toefl', scale: 'ibt', score: 90 },
  ]);
  assert.deepEqual(parsed, [
    { type: 'eiken', grade: '2', cse: null },
    { type: 'toefl', scale: 'ibt', score: 90 },
    { type: 'toeic', test: 'lr', score: 850 },
  ]);
});

test('upsert replaces the same kind and keeps others; remove drops by key', () => {
  const base: ProfileCertification[] = [
    { type: 'eiken', grade: '2', cse: null },
    { type: 'toeic', test: 'lr', score: 700 },
  ];
  const next = upsertCertification(base, { type: 'eiken', grade: 'pre1', cse: 2400 });
  assert.deepEqual(next, [
    { type: 'eiken', grade: 'pre1', cse: 2400 },
    { type: 'toeic', test: 'lr', score: 700 },
  ]);
  const withSw = upsertCertification(next, { type: 'toeic', test: 'sw', score: 300 });
  assert.equal(withSw.length, 3);
  assert.deepEqual(removeCertification(withSw, 'toeic:lr').map((c) => c.type), ['eiken', 'toeic']);
});

test('parseStoredCertifications drops broken entries instead of failing', () => {
  assert.deepEqual(parseStoredCertifications(null), []);
  assert.deepEqual(parseStoredCertifications('nope'), []);
  assert.deepEqual(
    parseStoredCertifications([{ type: 'toeic', test: 'lr', score: 3 }, { type: 'eiken', grade: '3' }]),
    [{ type: 'eiken', grade: '3', cse: null }],
  );
});

test('formatCertification renders readable labels', () => {
  assert.deepEqual(formatCertification({ type: 'eiken', grade: 'pre2plus', cse: null }), { label: '英検', detail: '準2級プラス' });
  assert.deepEqual(formatCertification({ type: 'eiken', grade: 'pre1', cse: 2400 }), { label: '英検', detail: '準1級 · CSE 2400' });
  assert.deepEqual(formatCertification({ type: 'toefl', scale: 'ibt', score: 95 }), { label: 'TOEFL iBT', detail: '95' });
  assert.deepEqual(formatCertification({ type: 'toefl', scale: 'band', score: 5 }), { label: 'TOEFL', detail: '5.0' });
  assert.deepEqual(formatCertification({ type: 'toeic', test: 'lr', score: 850 }), { label: 'TOEIC L&R', detail: '850' });
});

test('MAX_PROFILE_CERTIFICATIONS matches the migration CHECK constraint', () => {
  const sql = readFileSync('supabase/migrations/20261002130000_add_profile_certifications.sql', 'utf8');
  assert.match(sql, new RegExp(`jsonb_array_length\\(certifications\\) <= ${MAX_PROFILE_CERTIFICATIONS}\\b`));
});
