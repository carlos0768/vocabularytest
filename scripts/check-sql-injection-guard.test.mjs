import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { runGuard } from './check-sql-injection-guard.mjs';

async function writeFileRecursive(baseDir, relativePath, content) {
  const absolutePath = path.join(baseDir, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content);
}

async function createTempRepo({ files, allowlist }) {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'sql-guard-test-'));

  for (const [relativePath, content] of Object.entries(files)) {
    await writeFileRecursive(repoRoot, relativePath, content);
  }

  const allowlistDoc = allowlist ?? { entries: [] };
  await writeFileRecursive(
    repoRoot,
    'security/sql-allowlist.json',
    JSON.stringify(allowlistDoc, null, 2),
  );

  return repoRoot;
}

test('passes with safe query-builder style code', async (t) => {
  const repoRoot = await createTempRepo({
    files: {
      'src/safe.ts': `
        export async function loadProjects(supabase, userId) {
          return supabase.from('projects').select('*').eq('user_id', userId);
        }
      `,
    },
  });
  t.after(async () => {
    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  const result = await runGuard({ repoRoot });

  assert.equal(result.configErrors.length, 0);
  assert.equal(result.findings.length, 0);
});

test('detects SQL001, SQL002 and SQL004', async (t) => {
  const repoRoot = await createTempRepo({
    files: {
      'src/unsafe.ts': `
        export function run(db, prisma, id) {
          db.query(\`SELECT * FROM users WHERE id = \${id}\`);
          prisma.$queryRawUnsafe("SELECT * FROM users");
        }
      `,
    },
  });
  t.after(async () => {
    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  const result = await runGuard({ repoRoot });
  const rules = new Set(result.findings.map((finding) => finding.rule));

  assert.equal(result.configErrors.length, 0);
  assert.equal(rules.has('SQL001'), true);
  assert.equal(rules.has('SQL002'), true);
  assert.equal(rules.has('SQL004'), true);
});

test('detects SQL003 for SQL string concatenation', async (t) => {
  const repoRoot = await createTempRepo({
    files: {
      'src/concat.ts': `
        export function build(id) {
          const sql = "SELECT * FROM users WHERE id = " + id;
          return sql;
        }
      `,
    },
  });
  t.after(async () => {
    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  const result = await runGuard({ repoRoot });
  const rules = new Set(result.findings.map((finding) => finding.rule));

  assert.equal(result.configErrors.length, 0);
  assert.equal(rules.has('SQL003'), true);
});

test('allowlist suppresses matching path+rule findings', async (t) => {
  const repoRoot = await createTempRepo({
    files: {
      'src/allowed.ts': `
        export function run(prisma) {
          return prisma.$queryRawUnsafe("SELECT 1");
        }
      `,
    },
    allowlist: {
      entries: [
        {
          path: 'src/allowed.ts',
          rule: 'SQL001',
          reason: 'legacy temporary exception',
          expires_on: '2099-12-31',
        },
      ],
    },
  });
  t.after(async () => {
    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  const result = await runGuard({ repoRoot });
  assert.equal(result.configErrors.length, 0);
  assert.equal(result.findings.length, 0);
  assert.equal(result.suppressedCount, 1);
});

test('does not flag non-SQL template strings with words like select/update', async (t) => {
  const repoRoot = await createTempRepo({
    files: {
      'src/ui.tsx': `
        export function Ui({ value }) {
          return \`select-none transition-all update-state \${value}\`;
        }
      `,
    },
  });
  t.after(async () => {
    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  const result = await runGuard({ repoRoot });
  assert.equal(result.configErrors.length, 0);
  assert.equal(result.findings.length, 0);
});

test('expired allowlist entry fails closed', async (t) => {
  const repoRoot = await createTempRepo({
    files: {
      'src/safe.ts': 'export const value = 1;',
    },
    allowlist: {
      entries: [
        {
          path: 'src/any.ts',
          rule: 'SQL001',
          reason: 'expired exception',
          expires_on: '2000-01-01',
        },
      ],
    },
  });
  t.after(async () => {
    await fs.rm(repoRoot, { recursive: true, force: true });
  });

  const result = await runGuard({ repoRoot, today: new Date('2026-02-14T00:00:00Z') });
  assert.equal(result.findings.length, 0);
  assert.equal(result.configErrors.length, 1);
  assert.match(result.configErrors[0], /expires_on/);
});
