#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { execFileSync, spawnSync } from 'node:child_process';

const OUTPUT_BASE_RELATIVE = 'coverage/security-observation';

const OBSERVED_COMMANDS = [
  {
    name: 'security:all',
    slug: 'security-all',
    command: ['npm', ['run', 'security:all']],
  },
  {
    name: 'test:security',
    slug: 'test-security',
    command: ['npm', ['run', 'test:security']],
  },
];

function toPosixPath(inputPath) {
  return inputPath.split(path.sep).join('/');
}

function formatUtcDate(date) {
  return date.toISOString().slice(0, 10);
}

function asNumber(value) {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sumAllMatches(text, regex) {
  let total = 0;
  let matched = false;
  for (const match of text.matchAll(regex)) {
    const value = asNumber(match[1]);
    if (value == null) continue;
    total += value;
    matched = true;
  }
  return matched ? total : null;
}

function parseSqlMetrics(text) {
  const passMatch = text.match(/SQL guard passed \(scanned (\d+) files, violations (\d+)\)\./i);
  if (passMatch) {
    return {
      scanned: asNumber(passMatch[1]),
      violations: asNumber(passMatch[2]),
    };
  }

  const violationsMatch = text.match(/Found (\d+) SQL guard violation\(s\)\./i);
  return {
    scanned: null,
    violations: violationsMatch ? asNumber(violationsMatch[1]) : null,
  };
}

function parseSecretsMetrics(text) {
  const passMatch = text.match(/Secrets guard passed \(scanned (\d+) files, violations (\d+)\)\./i);
  if (passMatch) {
    return {
      scanned: asNumber(passMatch[1]),
      violations: asNumber(passMatch[2]),
    };
  }

  const violationsMatch = text.match(/Found (\d+) secrets guard violation\(s\)\./i);
  return {
    scanned: null,
    violations: violationsMatch ? asNumber(violationsMatch[1]) : null,
  };
}

function parseDepsMetrics(text) {
  const match = text.match(/Dependency audit (?:passed|failed): high=(\d+), critical=(\d+)\./i);
  if (!match) {
    return { high: null, critical: null };
  }
  return {
    high: asNumber(match[1]),
    critical: asNumber(match[2]),
  };
}

function parseTestMetrics(text) {
  const total = sumAllMatches(text, /^\s*[\u2139i]?\s*tests\s+(\d+)\s*$/gim);
  const pass = sumAllMatches(text, /^\s*[\u2139i]?\s*pass\s+(\d+)\s*$/gim);
  const fail = sumAllMatches(text, /^\s*[\u2139i]?\s*fail\s+(\d+)\s*$/gim);
  return { pass, fail, total };
}

function getShortGitSha(repoRoot) {
  try {
    const stdout = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

function runObservedCommand(repoRoot, executable, args) {
  const startedAt = Date.now();
  const result = spawnSync(executable, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });
  const finishedAt = Date.now();

  let stdout = result.stdout ?? '';
  let stderr = result.stderr ?? '';

  if (result.error) {
    stderr = `${stderr}\nspawn_error=${result.error.message}`.trim();
  }

  return {
    exitCode: result.status == null ? 1 : result.status,
    durationMs: finishedAt - startedAt,
    stdout,
    stderr,
  };
}

async function ensureDirectory(absPath) {
  await fs.mkdir(absPath, { recursive: true });
}

async function writeTextFile(absPath, content) {
  await ensureDirectory(path.dirname(absPath));
  await fs.writeFile(absPath, content, 'utf8');
}

async function main() {
  const isCiMode = process.argv.includes('--ci');
  const repoRoot = process.cwd();
  const now = new Date();
  const dateString = formatUtcDate(now);

  const outputDirAbs = path.join(repoRoot, OUTPUT_BASE_RELATIVE, dateString);
  await ensureDirectory(outputDirAbs);

  const commandResults = [];
  for (const observedCommand of OBSERVED_COMMANDS) {
    const [executable, args] = observedCommand.command;
    const run = runObservedCommand(repoRoot, executable, args);

    const stdoutRelativePath = toPosixPath(
      path.join(OUTPUT_BASE_RELATIVE, dateString, `${observedCommand.slug}.stdout.log`),
    );
    const stderrRelativePath = toPosixPath(
      path.join(OUTPUT_BASE_RELATIVE, dateString, `${observedCommand.slug}.stderr.log`),
    );

    await writeTextFile(path.join(repoRoot, stdoutRelativePath), run.stdout);
    await writeTextFile(path.join(repoRoot, stderrRelativePath), run.stderr);

    commandResults.push({
      name: observedCommand.name,
      cmd: `${executable} ${args.join(' ')}`,
      exit_code: run.exitCode,
      duration_ms: run.durationMs,
      stdout_path: stdoutRelativePath,
      stderr_path: stderrRelativePath,
      stdout: run.stdout,
      stderr: run.stderr,
    });
  }

  const securityAll = commandResults.find((entry) => entry.name === 'security:all');
  const testSecurity = commandResults.find((entry) => entry.name === 'test:security');
  const securityAllText = `${securityAll?.stdout ?? ''}\n${securityAll?.stderr ?? ''}`;
  const testSecurityText = `${testSecurity?.stdout ?? ''}\n${testSecurity?.stderr ?? ''}`;

  const metrics = {
    sql: parseSqlMetrics(securityAllText),
    secrets: parseSecretsMetrics(securityAllText),
    deps: parseDepsMetrics(securityAllText),
    tests: parseTestMetrics(testSecurityText),
  };

  const normalizedCommands = commandResults.map((entry) => ({
    name: entry.name,
    cmd: entry.cmd,
    exit_code: entry.exit_code,
    duration_ms: entry.duration_ms,
    stdout_path: entry.stdout_path,
    stderr_path: entry.stderr_path,
  }));

  const overallStatus = normalizedCommands.every((entry) => entry.exit_code === 0) ? 'pass' : 'fail';
  const resultDocument = {
    date: dateString,
    git_sha: getShortGitSha(repoRoot),
    node_version: process.version,
    overall_status: overallStatus,
    commands: normalizedCommands,
    metrics,
  };

  const resultRelativePath = toPosixPath(path.join(OUTPUT_BASE_RELATIVE, dateString, 'result.json'));
  await writeTextFile(
    path.join(repoRoot, resultRelativePath),
    `${JSON.stringify(resultDocument, null, 2)}\n`,
  );

  console.log(
    `Security observation (${isCiMode ? 'ci' : 'local'}) saved: ${resultRelativePath} (status=${overallStatus}).`,
  );

  process.exit(overallStatus === 'pass' ? 0 : 1);
}

await main();
