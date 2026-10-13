#!/usr/bin/env node
// Runs every co-located unit test (`*.test.ts` / `*.test.tsx`) under src/ and
// shared/ with the Node.js test runner via tsx.
//
// Tests used to be listed by hand in package.json, so a new test file that
// nobody remembered to add there silently never ran. Discovering them here
// removes that step.
//
// Route security tests (`*.security.test.ts`) are excluded: they run in
// `npm run test:security`.
//
// Usage:
//   node scripts/run-unit-tests.mjs                 # all unit tests
//   node scripts/run-unit-tests.mjs src/lib/quiz    # only tests under a path
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';

const ROOTS = ['src', 'shared'];
const EXCLUDED_SUFFIXES = ['.security.test.ts'];

const filters = process.argv.slice(2).map((arg) => path.normalize(arg));

const isTestFile = (file) => file.endsWith('.test.ts') || file.endsWith('.test.tsx');

// readdirSync({ recursive }) instead of fs.globSync: CI runs Node 20, which has no globSync.
const files = ROOTS.flatMap((root) =>
  readdirSync(root, { recursive: true, encoding: 'utf8' }).map((file) => path.join(root, file)),
)
  .filter(isTestFile)
  .filter((file) => !EXCLUDED_SUFFIXES.some((suffix) => file.endsWith(suffix)))
  .filter((file) => filters.length === 0 || filters.some((filter) => file.startsWith(filter)))
  .sort();

if (files.length === 0) {
  console.error('No unit test files matched.');
  process.exit(1);
}

const result = spawnSync('npx', ['tsx', '--test', ...files], { stdio: 'inherit' });
process.exit(result.status ?? 1);
