import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyAllowlist,
  collectFindings,
  extractAdvisoryId,
  validateAllowlistDocument,
} from './check-deps-audit.mjs';

const TODAY = new Date('2026-07-27T00:00:00Z');

function advisory(url, severity = 'high') {
  return { source: 1, name: 'pkg', severity, title: 'title', url };
}

test('collectFindings keeps only high/critical packages with their GHSA ids', () => {
  const findings = collectFindings({
    vulnerabilities: {
      postcss: {
        severity: 'high',
        range: '<=8.5.17',
        via: [
          advisory('https://github.com/advisories/GHSA-qx2v-qp2m-jg93'),
          advisory('https://github.com/advisories/GHSA-6g55-p6wh-862q'),
        ],
      },
      next: { severity: 'moderate', range: '*', via: ['postcss'] },
      leftpad: {
        severity: 'critical',
        range: '<1.0.0',
        via: [advisory('https://github.com/advisories/GHSA-aaaa-bbbb-cccc', 'critical')],
      },
    },
  });

  assert.deepEqual(
    findings.map((finding) => finding.package),
    ['leftpad', 'postcss'],
  );
  assert.deepEqual(findings[1].advisories, [
    'ghsa-6g55-p6wh-862q',
    'ghsa-qx2v-qp2m-jg93',
  ]);
  assert.equal(findings[1].hasUnknownAdvisory, false);
});

test('collectFindings marks packages vulnerable only through dependencies as unknown', () => {
  const [finding] = collectFindings({
    vulnerabilities: {
      next: { severity: 'high', range: '*', via: ['postcss'] },
    },
  });

  assert.equal(finding.package, 'next');
  assert.deepEqual(finding.advisories, []);
  assert.equal(finding.hasUnknownAdvisory, true);
});

test('collectFindings falls back to the npm v6 advisories shape', () => {
  const findings = collectFindings({
    advisories: {
      1234: {
        severity: 'high',
        module_name: 'postcss',
        vulnerable_versions: '<=8.5.17',
        url: 'https://github.com/advisories/GHSA-qx2v-qp2m-jg93',
      },
      5678: { severity: 'moderate', module_name: 'ignored', url: '' },
    },
  });

  assert.deepEqual(findings.map((finding) => finding.package), ['postcss']);
  assert.deepEqual(findings[0].advisories, ['ghsa-qx2v-qp2m-jg93']);
});

test('extractAdvisoryId returns null for package-name via entries', () => {
  assert.equal(extractAdvisoryId('postcss'), null);
  assert.equal(extractAdvisoryId({ url: 'https://example.com/no-advisory' }), null);
  assert.equal(
    extractAdvisoryId({ url: 'https://github.com/advisories/GHSA-qx2v-qp2m-jg93' }),
    'ghsa-qx2v-qp2m-jg93',
  );
});

test('applyAllowlist suppresses a finding only when every advisory is allowlisted', () => {
  const findings = collectFindings({
    vulnerabilities: {
      postcss: {
        severity: 'high',
        range: '<=8.5.17',
        via: [
          advisory('https://github.com/advisories/GHSA-qx2v-qp2m-jg93'),
          advisory('https://github.com/advisories/GHSA-6g55-p6wh-862q'),
        ],
      },
    },
  });

  const partial = applyAllowlist(findings, [
    { package: 'postcss', advisory: 'ghsa-qx2v-qp2m-jg93' },
  ]);
  assert.deepEqual(partial.blocking.map((finding) => finding.package), ['postcss']);
  assert.deepEqual(partial.suppressed, []);

  const full = applyAllowlist(findings, [
    { package: 'postcss', advisory: 'ghsa-qx2v-qp2m-jg93' },
    { package: 'postcss', advisory: 'ghsa-6g55-p6wh-862q' },
  ]);
  assert.deepEqual(full.blocking, []);
  assert.deepEqual(full.suppressed.map((finding) => finding.package), ['postcss']);
});

test('applyAllowlist never suppresses findings without a known advisory id', () => {
  const findings = collectFindings({
    vulnerabilities: {
      next: { severity: 'high', range: '*', via: ['postcss'] },
    },
  });

  const result = applyAllowlist(findings, [{ package: 'next', advisory: 'ghsa-qx2v-qp2m-jg93' }]);
  assert.deepEqual(result.blocking.map((finding) => finding.package), ['next']);
});

test('applyAllowlist does not leak an allowlisted advisory across packages', () => {
  const findings = collectFindings({
    vulnerabilities: {
      other: {
        severity: 'high',
        range: '*',
        via: [advisory('https://github.com/advisories/GHSA-qx2v-qp2m-jg93')],
      },
    },
  });

  const result = applyAllowlist(findings, [
    { package: 'postcss', advisory: 'ghsa-qx2v-qp2m-jg93' },
  ]);
  assert.deepEqual(result.blocking.map((finding) => finding.package), ['other']);
});

test('validateAllowlistDocument accepts a well-formed entry', () => {
  const result = validateAllowlistDocument(
    {
      entries: [
        {
          package: 'postcss',
          advisory: 'GHSA-qx2v-qp2m-jg93',
          reason: 'next 同梱 / 修正版未リリース',
          expires_on: '2026-10-31',
        },
      ],
    },
    TODAY,
  );

  assert.deepEqual(result.errors, []);
  assert.equal(result.entries[0].advisory, 'ghsa-qx2v-qp2m-jg93');
});

test('validateAllowlistDocument rejects expired, malformed, and incomplete entries', () => {
  const expired = validateAllowlistDocument(
    {
      entries: [
        {
          package: 'postcss',
          advisory: 'GHSA-qx2v-qp2m-jg93',
          reason: 'stale',
          expires_on: '2026-07-26',
        },
      ],
    },
    TODAY,
  );
  assert.equal(expired.errors.length, 1);
  assert.match(expired.errors[0], /expires_on/);

  const malformed = validateAllowlistDocument(
    {
      entries: [
        { package: 'postcss', advisory: 'CVE-2026-1', reason: 'x', expires_on: '2026-10-31' },
      ],
    },
    TODAY,
  );
  assert.equal(malformed.errors.length, 1);
  assert.match(malformed.errors[0], /GHSA/);

  const missingReason = validateAllowlistDocument(
    { entries: [{ package: 'postcss', advisory: 'GHSA-qx2v-qp2m-jg93', expires_on: '2026-10-31' }] },
    TODAY,
  );
  assert.equal(missingReason.errors.length, 1);
  assert.match(missingReason.errors[0], /reason/);

  assert.match(validateAllowlistDocument({}, TODAY).errors[0], /entries/);
  assert.match(validateAllowlistDocument(null, TODAY).errors[0], /entries/);
});
