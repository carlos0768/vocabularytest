import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

import { runGuard } from './check-secrets-guard.mjs';

function runGit(repoRoot, args) {
  execFileSync('git', args, {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function writeFileRecursive(repoRoot, relativePath, content) {
  const absolutePath = path.join(repoRoot, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content);
}

async function createTempRepo({ files, allowlist }) {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'secrets-guard-test-'));
  runGit(repoRoot, ['init']);

  for (const [relativePath, content] of Object.entries(files)) {
    await writeFileRecursive(repoRoot, relativePath, content);
  }

  const allowlistDoc = allowlist ?? { entries: [] };
  await writeFileRecursive(
    repoRoot,
    'security/secrets-allowlist.json',
    JSON.stringify(allowlistDoc, null, 2),
  );

  runGit(repoRoot, ['add', '.']);
  return repoRoot;
}

test('passes for placeholder values in .env.example', async (t) => {
  const repoRoot = await createTempRepo({
    files: {
      '.env.example': 'OPENAI_API_KEY=sk-your-api-key-here\nRESEND_API_KEY=re_your-resend-api-key\n',
      'src/index.ts': 'export const ok = true;\n',
    },
  });
  t.after(async () => fs.rm(repoRoot, { recursive: true, force: true }));

  const result = await runGuard({ repoRoot });
  assert.equal(result.configErrors.length, 0);
  assert.equal(result.findings.length, 0);
});

test('detects SECRET001 api key literals', async (t) => {
  const repoRoot = await createTempRepo({
    files: {
      'src/leak.ts': "export const key = 'sk-1234567890abcdefghijklmnopqrstuv';\n",
    },
  });
  t.after(async () => fs.rm(repoRoot, { recursive: true, force: true }));

  const result = await runGuard({ repoRoot });
  const rules = new Set(result.findings.map((finding) => finding.rule));
  assert.equal(result.configErrors.length, 0);
  assert.equal(rules.has('SECRET001'), true);
});

test('detects SECRET003 private key blocks', async (t) => {
  const repoRoot = await createTempRepo({
    files: {
      'src/key.pem': '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n',
    },
  });
  t.after(async () => fs.rm(repoRoot, { recursive: true, force: true }));

  const result = await runGuard({ repoRoot });
  const rules = new Set(result.findings.map((finding) => finding.rule));
  assert.equal(result.configErrors.length, 0);
  assert.equal(rules.has('SECRET003'), true);
});

test('allowlist suppresses matching path+rule findings', async (t) => {
  const repoRoot = await createTempRepo({
    files: {
      'src/leak.ts': "export const value = 'sk-1234567890abcdefghijklmnopqrstuv';\n",
    },
    allowlist: {
      entries: [
        {
          path: 'src/leak.ts',
          rule: 'SECRET001',
          reason: 'temporary test exception',
          expires_on: '2099-12-31',
        },
      ],
    },
  });
  t.after(async () => fs.rm(repoRoot, { recursive: true, force: true }));

  const result = await runGuard({ repoRoot });
  assert.equal(result.configErrors.length, 0);
  assert.equal(result.findings.length, 0);
  assert.equal(result.suppressedCount, 1);
});

test('expired allowlist entry fails closed', async (t) => {
  const repoRoot = await createTempRepo({
    files: {
      'src/index.ts': 'export const ok = true;\n',
    },
    allowlist: {
      entries: [
        {
          path: 'src/any.ts',
          rule: 'SECRET001',
          reason: 'expired exception',
          expires_on: '2000-01-01',
        },
      ],
    },
  });
  t.after(async () => fs.rm(repoRoot, { recursive: true, force: true }));

  const result = await runGuard({ repoRoot, today: new Date('2026-02-14T00:00:00Z') });
  assert.equal(result.findings.length, 0);
  assert.equal(result.configErrors.length, 1);
  assert.match(result.configErrors[0], /expires_on/);
});
