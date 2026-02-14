#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const INPUT_BASE_RELATIVE = 'coverage/security-observation';
const OUTPUT_REPORT_RELATIVE = 'docs/security/security-observation-week1-report.md';

function asNumberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function percent(value, total) {
  if (total === 0) return '0.0';
  return ((value / total) * 100).toFixed(1);
}

function formatDurationMs(value) {
  if (value == null) return 'N/A';
  const seconds = value / 1000;
  return `${seconds.toFixed(2)}s`;
}

function compareValue(first, last) {
  if (first == null || last == null) return 'N/A';
  const diff = last - first;
  const sign = diff > 0 ? '+' : '';
  return `${first} -> ${last} (${sign}${diff})`;
}

async function readJson(absPath) {
  const raw = await fs.readFile(absPath, 'utf8');
  return JSON.parse(raw);
}

async function loadObservationResults(repoRoot) {
  const inputBaseAbs = path.join(repoRoot, INPUT_BASE_RELATIVE);
  let entries;
  try {
    entries = await fs.readdir(inputBaseAbs, { withFileTypes: true });
  } catch {
    return [];
  }

  const dates = entries
    .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  const results = [];
  for (const date of dates) {
    const resultPath = path.join(inputBaseAbs, date, 'result.json');
    try {
      const result = await readJson(resultPath);
      results.push(result);
    } catch {
      continue;
    }
  }

  return results;
}

function getCommandDurationMs(result, commandName) {
  const command = Array.isArray(result.commands)
    ? result.commands.find((entry) => entry.name === commandName)
    : null;
  return asNumberOrNull(command?.duration_ms);
}

function buildFailureTop(results) {
  const counts = new Map();
  for (const result of results) {
    const commands = Array.isArray(result.commands) ? result.commands : [];
    for (const command of commands) {
      if (command.exit_code === 0) continue;
      const key = command.name ?? 'unknown';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 3);
}

function buildPriorityActions(results) {
  let hasDepsP0 = false;
  let hasSqlP1 = false;
  let hasSecretsP1 = false;
  let hasTestsP2 = false;

  for (const result of results) {
    const deps = result.metrics?.deps ?? {};
    const sql = result.metrics?.sql ?? {};
    const secrets = result.metrics?.secrets ?? {};
    const tests = result.metrics?.tests ?? {};

    if ((asNumberOrNull(deps.high) ?? 0) > 0 || (asNumberOrNull(deps.critical) ?? 0) > 0) {
      hasDepsP0 = true;
    }
    if ((asNumberOrNull(sql.violations) ?? 0) > 0) {
      hasSqlP1 = true;
    }
    if ((asNumberOrNull(secrets.violations) ?? 0) > 0) {
      hasSecretsP1 = true;
    }
    if ((asNumberOrNull(tests.fail) ?? 0) > 0) {
      hasTestsP2 = true;
    }
  }

  const actions = [];
  if (hasDepsP0) {
    actions.push('P0: `security:deps` の High/Critical を即時解消し、同日中に再観測する。');
  }
  if (hasSqlP1 || hasSecretsP1) {
    actions.push(
      'P1: `security:sql` / `security:secrets` の違反発生日を起点に、誤検知か実漏えいかを24時間以内に切り分ける。',
    );
  }
  if (hasTestsP2) {
    actions.push('P2: `test:security` 失敗の再現手順を固定化し、既知フレークと実不具合を分離する。');
  }
  if (actions.length === 0) {
    actions.push('P2: 違反なし。現行ガードを維持し、次週は誤検知の有無だけを継続監視する。');
  }
  return actions;
}

async function writeReport(repoRoot, reportBody) {
  const outputAbs = path.join(repoRoot, OUTPUT_REPORT_RELATIVE);
  await fs.mkdir(path.dirname(outputAbs), { recursive: true });
  await fs.writeFile(outputAbs, reportBody, 'utf8');
}

async function main() {
  const repoRoot = process.cwd();
  const results = await loadObservationResults(repoRoot);
  if (results.length === 0) {
    console.error('No observation data found under coverage/security-observation.');
    process.exit(1);
  }

  const sorted = results
    .slice()
    .sort((a, b) => String(a.date ?? '').localeCompare(String(b.date ?? '')));

  const totalDays = sorted.length;
  const passDays = sorted.filter((result) => result.overall_status === 'pass').length;
  const failDays = totalDays - passDays;
  const failedDates = sorted
    .filter((result) => result.overall_status !== 'pass')
    .map((result) => String(result.date ?? 'unknown'));

  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const failureTop = buildFailureTop(sorted);
  const actions = buildPriorityActions(sorted);

  const firstSecurityDuration = getCommandDurationMs(first, 'security:all');
  const lastSecurityDuration = getCommandDurationMs(last, 'security:all');
  const firstTestDuration = getCommandDurationMs(first, 'test:security');
  const lastTestDuration = getCommandDurationMs(last, 'test:security');

  const reportLines = [
    '# Security Observation Week 1 Report',
    '',
    `Generated at (UTC): ${new Date().toISOString()}`,
    '',
    '## Summary',
    `- Observation range: ${first.date} to ${last.date}`,
    `- Days observed: ${totalDays}`,
    `- Success rate: ${percent(passDays, totalDays)}% (${passDays}/${totalDays})`,
    `- Failed days: ${failDays === 0 ? 'none' : failedDates.join(', ')}`,
    '',
    '## Failure Breakdown (Top 3)',
  ];

  if (failureTop.length === 0) {
    reportLines.push('- No command failures detected.');
  } else {
    for (const item of failureTop) {
      reportLines.push(`- ${item.name}: ${item.count} day(s)`);
    }
  }

  reportLines.push(
    '',
    '## First vs Last Comparison',
    `- security:all duration: ${formatDurationMs(firstSecurityDuration)} -> ${formatDurationMs(lastSecurityDuration)}`,
    `- test:security duration: ${formatDurationMs(firstTestDuration)} -> ${formatDurationMs(lastTestDuration)}`,
    `- SQL scanned files: ${compareValue(asNumberOrNull(first.metrics?.sql?.scanned), asNumberOrNull(last.metrics?.sql?.scanned))}`,
    `- Secrets scanned files: ${compareValue(asNumberOrNull(first.metrics?.secrets?.scanned), asNumberOrNull(last.metrics?.secrets?.scanned))}`,
    `- Deps high count: ${compareValue(asNumberOrNull(first.metrics?.deps?.high), asNumberOrNull(last.metrics?.deps?.high))}`,
    `- Deps critical count: ${compareValue(asNumberOrNull(first.metrics?.deps?.critical), asNumberOrNull(last.metrics?.deps?.critical))}`,
    '',
    '## Priority Actions (Next Week)',
  );

  for (const action of actions) {
    reportLines.push(`- ${action}`);
  }

  reportLines.push('');

  await writeReport(repoRoot, `${reportLines.join('\n')}\n`);
  console.log(`Observation summary written: ${OUTPUT_REPORT_RELATIVE}`);
}

await main();
