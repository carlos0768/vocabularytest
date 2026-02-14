#!/usr/bin/env node

import process from 'node:process';
import { spawnSync } from 'node:child_process';

function parseAuditJson(rawText) {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function extractSeverityCounts(report) {
  const counts = {
    info: 0,
    low: 0,
    moderate: 0,
    high: 0,
    critical: 0,
  };

  if (report?.metadata?.vulnerabilities) {
    Object.assign(counts, report.metadata.vulnerabilities);
    return counts;
  }

  if (report?.advisories && typeof report.advisories === 'object') {
    for (const advisory of Object.values(report.advisories)) {
      const severity = advisory?.severity;
      if (severity && Object.prototype.hasOwnProperty.call(counts, severity)) {
        counts[severity] += 1;
      }
    }
  }
  return counts;
}

function runAudit() {
  const cmdResult = spawnSync(
    'npm',
    ['audit', '--omit=dev', '--audit-level=high', '--json'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    },
  );

  const stdoutJson = parseAuditJson(cmdResult.stdout ?? '');
  const stderrJson = parseAuditJson(cmdResult.stderr ?? '');
  const report = stdoutJson ?? stderrJson;

  if (!report) {
    console.error('Failed to parse npm audit JSON output.');
    if (cmdResult.stdout) console.error(cmdResult.stdout.trim());
    if (cmdResult.stderr) console.error(cmdResult.stderr.trim());
    return 1;
  }

  const counts = extractSeverityCounts(report);
  const highCount = Number(counts.high ?? 0);
  const criticalCount = Number(counts.critical ?? 0);

  if (highCount > 0 || criticalCount > 0) {
    console.error(
      `Dependency audit failed: high=${highCount}, critical=${criticalCount}.`,
    );
    return 1;
  }

  console.log(
    `Dependency audit passed: high=${highCount}, critical=${criticalCount}.`,
  );
  return 0;
}

const exitCode = runAudit();
process.exit(exitCode);
