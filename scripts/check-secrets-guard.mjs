#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ALLOWLIST_RELATIVE_PATH = 'security/secrets-allowlist.json';
const RULE_IDS = new Set(['SECRET001', 'SECRET002', 'SECRET003']);

const EXCLUDED_TOP_LEVEL = new Set([
  'node_modules',
  '.next',
  'vocabularytest',
  'vocabularytest-clone',
  'mobile',
  'cloud-run-scan',
]);

const EXCLUDED_PATHS = new Set([
  ALLOWLIST_RELATIVE_PATH,
]);

const PLACEHOLDER_RE =
  /\b(your[-_]|example|dummy|sample|placeholder|changeme|xxxx|fake)\b|sk_test_|pk_test_|re_test_/i;

const SECRET_PATTERNS = [
  {
    rule: 'SECRET001',
    message: 'Potential API key or secret literal detected.',
    regexes: [
      /\bsk-[A-Za-z0-9]{20,}\b/g,
      /\bre_[A-Za-z0-9_-]{20,}\b/g,
      /\bAIza[0-9A-Za-z\-_]{20,}\b/g,
      /\b(?:OPENAI_API_KEY|RESEND_API_KEY|KOMOJU_SECRET_KEY|KOMOJU_WEBHOOK_SECRET|SUPABASE_SERVICE_ROLE_KEY|ADMIN_SECRET)\b\s*[:=]\s*["'`]?[A-Za-z0-9._-]{12,}["'`]?/gi,
    ],
  },
  {
    rule: 'SECRET002',
    message: 'Potential JWT-like or long secret assignment detected.',
    regexes: [
      /\b(?:secret|token|api[_-]?key|service[_-]?role[_-]?key)\b\s*[:=]\s*["'`][^"'`\n]{20,}["'`]/gi,
      /\b(?:secret|token|api[_-]?key)\b\s*=\s*[A-Za-z0-9._-]{24,}/gi,
    ],
  },
  {
    rule: 'SECRET003',
    message: 'Private key block detected.',
    regexes: [
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    ],
  },
];

function normalizeRelativePath(inputPath) {
  return inputPath.replace(/\\/g, '/').replace(/^\.\//, '');
}

function isExcludedPath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const topLevel = normalized.split('/')[0];
  if (EXCLUDED_TOP_LEVEL.has(topLevel)) {
    return true;
  }
  return EXCLUDED_PATHS.has(normalized);
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

function computeLineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 10) {
      starts.push(i + 1);
    }
  }
  return starts;
}

function getLineColumnFromIndex(lineStarts, index) {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= index) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  const line = high + 1;
  const column = index - lineStarts[high] + 1;
  return { line, column };
}

function getLineText(content, index) {
  const start = content.lastIndexOf('\n', index) + 1;
  const endPos = content.indexOf('\n', index);
  const end = endPos === -1 ? content.length : endPos;
  return content.slice(start, end);
}

function isPlaceholderMatch(matchText, lineText) {
  if (PLACEHOLDER_RE.test(matchText)) return true;
  if (PLACEHOLDER_RE.test(lineText)) return true;
  return false;
}

function shouldIgnoreMatch(relativePath, rule, matchText, lineText) {
  if (relativePath === '.env.example') {
    return true;
  }
  if (rule === 'SECRET001' && /\bprocess\.env\./.test(lineText)) {
    return true;
  }
  if (rule !== 'SECRET003' && isPlaceholderMatch(matchText, lineText)) {
    return true;
  }
  if (rule === 'SECRET002' && /\bprocess\.env\./.test(lineText)) {
    return true;
  }
  return false;
}

async function collectTrackedFiles(repoRoot) {
  let output;
  try {
    output = execFileSync('git', ['ls-files', '-z'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    throw new Error(`failed to list tracked files via git ls-files: ${error.message}`);
  }

  return output
    .split('\u0000')
    .filter(Boolean)
    .map((filePath) => normalizeRelativePath(filePath))
    .filter((filePath) => !isExcludedPath(filePath))
    .sort();
}

function findSecretFindings(content, relativePath) {
  const findings = [];
  const seen = new Set();
  const lineStarts = computeLineStarts(content);

  for (const pattern of SECRET_PATTERNS) {
    for (const regex of pattern.regexes) {
      const localRe = new RegExp(regex.source, regex.flags);
      let match;
      while ((match = localRe.exec(content)) !== null) {
        const matchText = match[0];
        const matchIndex = match.index;
        const lineText = getLineText(content, matchIndex);
        if (shouldIgnoreMatch(relativePath, pattern.rule, matchText, lineText)) {
          continue;
        }

        const { line, column } = getLineColumnFromIndex(lineStarts, matchIndex);
        const finding = {
          rule: pattern.rule,
          file: relativePath,
          line,
          column,
          message: pattern.message,
        };
        const key = `${finding.rule}|${finding.file}|${finding.line}|${finding.column}`;
        if (!seen.has(key)) {
          seen.add(key);
          findings.push(finding);
        }

        if (match.index === localRe.lastIndex) {
          localRe.lastIndex += 1;
        }
      }
    }
  }

  return findings;
}

function validateAllowlistEntry(entry, index, today) {
  const errors = [];
  const prefix = `entries[${index}]`;
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    errors.push(`${prefix} must be an object.`);
    return { normalized: null, errors };
  }

  const requiredFields = ['path', 'rule', 'reason', 'expires_on'];
  for (const field of requiredFields) {
    if (typeof entry[field] !== 'string' || entry[field].trim() === '') {
      errors.push(`${prefix}.${field} must be a non-empty string.`);
    }
  }

  if (errors.length > 0) {
    return { normalized: null, errors };
  }

  const normalized = {
    path: normalizeRelativePath(entry.path),
    rule: entry.rule.trim(),
    reason: entry.reason.trim(),
    expires_on: entry.expires_on.trim(),
  };

  if (!RULE_IDS.has(normalized.rule)) {
    errors.push(`${prefix}.rule must be one of ${Array.from(RULE_IDS).join(', ')}.`);
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

function validateAllowlistDocument(document, today = new Date()) {
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

function applyAllowlist(findings, allowlistEntries) {
  const allowKeys = new Set(allowlistEntries.map((entry) => `${entry.path}|${entry.rule}`));
  const filteredFindings = [];
  let suppressedCount = 0;

  for (const finding of findings) {
    const key = `${finding.file}|${finding.rule}`;
    if (allowKeys.has(key)) {
      suppressedCount += 1;
      continue;
    }
    filteredFindings.push(finding);
  }

  return { findings: filteredFindings, suppressedCount };
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

function formatFinding(finding) {
  return `${finding.rule} ${finding.file}:${finding.line}:${finding.column} ${finding.message}`;
}

export async function runGuard(options = {}) {
  const repoRoot = options.repoRoot ? path.resolve(options.repoRoot) : process.cwd();
  const today = options.today ?? new Date();

  const files = await collectTrackedFiles(repoRoot);
  const allowlist = await loadAllowlist(repoRoot, today);

  const rawFindings = [];
  for (const relativeFile of files) {
    const absFile = path.join(repoRoot, relativeFile);
    let content;
    try {
      content = await fs.readFile(absFile, 'utf8');
    } catch {
      continue;
    }

    if (content.includes('\u0000')) {
      continue;
    }

    rawFindings.push(...findSecretFindings(content, relativeFile));
  }

  const allowApplied = applyAllowlist(rawFindings, allowlist.entries);
  return {
    scannedFiles: files.length,
    findings: allowApplied.findings,
    suppressedCount: allowApplied.suppressedCount,
    configErrors: allowlist.errors,
  };
}

export async function runCli() {
  const result = await runGuard();
  result.configErrors.forEach((error) => console.error(error));
  result.findings.forEach((finding) => console.error(formatFinding(finding)));

  if (result.configErrors.length > 0 || result.findings.length > 0) {
    if (result.findings.length > 0) {
      console.error(`Found ${result.findings.length} secrets guard violation(s).`);
    }
    if (result.configErrors.length > 0) {
      console.error(`Found ${result.configErrors.length} allowlist configuration issue(s).`);
    }
    return 1;
  }

  console.log(`Secrets guard passed (scanned ${result.scannedFiles} files, violations 0).`);
  return 0;
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  const exitCode = await runCli();
  process.exit(exitCode);
}
