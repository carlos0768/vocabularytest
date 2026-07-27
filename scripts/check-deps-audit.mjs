#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ALLOWLIST_RELATIVE_PATH = 'security/deps-audit-allowlist.json';
const BLOCKING_SEVERITIES = new Set(['high', 'critical']);
const ADVISORY_ID_RE = /GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i;

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

function parseYmdDate(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function toDateNumber(parts) {
  return (parts.year * 10000) + (parts.month * 100) + parts.day;
}

function todayDateNumber(today = new Date()) {
  return (today.getFullYear() * 10000) + ((today.getMonth() + 1) * 100) + today.getDate();
}

export function extractAdvisoryId(via) {
  if (!via || typeof via !== 'object') return null;
  const url = typeof via.url === 'string' ? via.url : '';
  const match = ADVISORY_ID_RE.exec(url);
  return match ? match[0].toLowerCase() : null;
}

/**
 * Turns an `npm audit --json` report into one finding per vulnerable package
 * whose severity blocks the build (high/critical).
 *
 * `advisories` holds the GHSA ids behind the finding. When a package is only
 * vulnerable through another package (`via` holds package names), or an advisory
 * carries no recognisable GHSA id, the finding is marked `hasUnknownAdvisory` so
 * the allowlist can never suppress it.
 */
export function collectFindings(report) {
  const findings = [];

  const vulnerabilities = report?.vulnerabilities;
  if (vulnerabilities && typeof vulnerabilities === 'object') {
    for (const [packageName, vulnerability] of Object.entries(vulnerabilities)) {
      const severity = vulnerability?.severity;
      if (!BLOCKING_SEVERITIES.has(severity)) {
        continue;
      }

      const advisories = new Set();
      let hasUnknownAdvisory = false;
      const via = Array.isArray(vulnerability.via) ? vulnerability.via : [];
      for (const entry of via) {
        const advisoryId = extractAdvisoryId(entry);
        if (advisoryId) {
          advisories.add(advisoryId);
        } else {
          hasUnknownAdvisory = true;
        }
      }

      findings.push({
        package: packageName,
        severity,
        range: typeof vulnerability.range === 'string' ? vulnerability.range : '',
        advisories: Array.from(advisories).sort(),
        hasUnknownAdvisory: hasUnknownAdvisory || advisories.size === 0,
      });
    }

    return findings.sort((a, b) => a.package.localeCompare(b.package));
  }

  // npm v6 style report.
  const advisories = report?.advisories;
  if (advisories && typeof advisories === 'object') {
    for (const advisory of Object.values(advisories)) {
      const severity = advisory?.severity;
      if (!BLOCKING_SEVERITIES.has(severity)) {
        continue;
      }
      const advisoryId = extractAdvisoryId(advisory);
      findings.push({
        package: typeof advisory.module_name === 'string' ? advisory.module_name : 'unknown',
        severity,
        range: typeof advisory.vulnerable_versions === 'string' ? advisory.vulnerable_versions : '',
        advisories: advisoryId ? [advisoryId] : [],
        hasUnknownAdvisory: !advisoryId,
      });
    }
  }

  return findings.sort((a, b) => a.package.localeCompare(b.package));
}

function validateAllowlistEntry(entry, index, today) {
  const errors = [];
  const prefix = `entries[${index}]`;
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    errors.push(`${prefix} must be an object.`);
    return { normalized: null, errors };
  }

  const requiredFields = ['package', 'advisory', 'reason', 'expires_on'];
  for (const field of requiredFields) {
    if (typeof entry[field] !== 'string' || entry[field].trim() === '') {
      errors.push(`${prefix}.${field} must be a non-empty string.`);
    }
  }

  if (errors.length > 0) {
    return { normalized: null, errors };
  }

  const normalized = {
    package: entry.package.trim(),
    advisory: entry.advisory.trim().toLowerCase(),
    reason: entry.reason.trim(),
    expires_on: entry.expires_on.trim(),
  };

  if (!ADVISORY_ID_RE.test(normalized.advisory)) {
    errors.push(`${prefix}.advisory must be a GHSA id (e.g. GHSA-xxxx-xxxx-xxxx).`);
  }

  const parsedDate = parseYmdDate(normalized.expires_on);
  if (!parsedDate) {
    errors.push(`${prefix}.expires_on must be YYYY-MM-DD.`);
  } else if (toDateNumber(parsedDate) < todayDateNumber(today)) {
    errors.push(
      `${prefix}.expires_on (${normalized.expires_on}) is in the past relative to ${today.toISOString().slice(0, 10)}.`,
    );
  }

  return { normalized, errors };
}

export function validateAllowlistDocument(document, today = new Date()) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    return {
      entries: [],
      errors: ['allowlist root must be an object with an "entries" array.'],
    };
  }
  if (!Array.isArray(document.entries)) {
    return {
      entries: [],
      errors: ['allowlist root must include "entries" as an array.'],
    };
  }

  const entries = [];
  const errors = [];
  document.entries.forEach((entry, index) => {
    const result = validateAllowlistEntry(entry, index, today);
    errors.push(...result.errors);
    if (result.normalized) {
      entries.push(result.normalized);
    }
  });

  return { entries, errors };
}

/**
 * A finding is suppressed only when every advisory behind it is allowlisted for
 * that package, so a newly published advisory on an allowlisted package still
 * fails the check.
 */
export function applyAllowlist(findings, allowlistEntries) {
  const allowKeys = new Set(
    allowlistEntries.map((entry) => `${entry.package}|${entry.advisory}`),
  );

  const blocking = [];
  const suppressed = [];

  for (const finding of findings) {
    const suppressible =
      !finding.hasUnknownAdvisory &&
      finding.advisories.length > 0 &&
      finding.advisories.every((advisory) => allowKeys.has(`${finding.package}|${advisory}`));

    if (suppressible) {
      suppressed.push(finding);
    } else {
      blocking.push(finding);
    }
  }

  return { blocking, suppressed };
}

async function loadAllowlist(repoRoot, today) {
  const allowlistPath = path.join(repoRoot, ALLOWLIST_RELATIVE_PATH);
  let raw;
  try {
    raw = await fs.readFile(allowlistPath, 'utf8');
  } catch (error) {
    return {
      entries: [],
      errors: [
        `ALLOWLIST ${ALLOWLIST_RELATIVE_PATH}: failed to read file (${error.message}).`,
      ],
    };
  }

  let document;
  try {
    document = JSON.parse(raw);
  } catch (error) {
    return {
      entries: [],
      errors: [
        `ALLOWLIST ${ALLOWLIST_RELATIVE_PATH}: invalid JSON (${error.message}).`,
      ],
    };
  }

  const validation = validateAllowlistDocument(document, today);
  return {
    entries: validation.entries,
    errors: validation.errors.map((error) => `ALLOWLIST ${ALLOWLIST_RELATIVE_PATH}: ${error}`),
  };
}

function runNpmAudit(repoRoot) {
  const cmdResult = spawnSync(
    'npm',
    ['audit', '--omit=dev', '--audit-level=high', '--json'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );

  const stdoutJson = parseAuditJson(cmdResult.stdout ?? '');
  const stderrJson = parseAuditJson(cmdResult.stderr ?? '');
  return {
    report: stdoutJson ?? stderrJson,
    stdout: cmdResult.stdout ?? '',
    stderr: cmdResult.stderr ?? '',
  };
}

function formatFinding(finding) {
  const advisories = finding.advisories.length > 0 ? finding.advisories.join(', ') : 'via dependency';
  return `${finding.severity} ${finding.package}@${finding.range || '*'} (${advisories})`;
}

export async function runCli(options = {}) {
  const repoRoot = options.repoRoot ? path.resolve(options.repoRoot) : process.cwd();
  const today = options.today ?? new Date();

  const { report, stdout, stderr } = runNpmAudit(repoRoot);
  if (!report) {
    console.error('Failed to parse npm audit JSON output.');
    if (stdout) console.error(stdout.trim());
    if (stderr) console.error(stderr.trim());
    return 1;
  }

  const allowlist = await loadAllowlist(repoRoot, today);
  const findings = collectFindings(report);
  const { blocking, suppressed } = applyAllowlist(findings, allowlist.entries);

  for (const error of allowlist.errors) {
    console.error(error);
  }
  for (const finding of suppressed) {
    console.log(`Allowlisted (not blocking): ${formatFinding(finding)}`);
  }
  for (const finding of blocking) {
    console.error(`Blocking advisory: ${formatFinding(finding)}`);
  }

  if (allowlist.errors.length > 0) {
    console.error(`Found ${allowlist.errors.length} allowlist configuration issue(s).`);
    return 1;
  }

  if (blocking.length > 0) {
    const highCount = blocking.filter((finding) => finding.severity === 'high').length;
    const criticalCount = blocking.filter((finding) => finding.severity === 'critical').length;
    console.error(
      `Dependency audit failed: high=${highCount}, critical=${criticalCount}.`,
    );
    return 1;
  }

  console.log(
    `Dependency audit passed: high=0, critical=0 (allowlisted ${suppressed.length}).`,
  );
  return 0;
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  const exitCode = await runCli();
  process.exit(exitCode);
}
