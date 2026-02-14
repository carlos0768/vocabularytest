#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const TARGET_ROOTS = ['src', 'shared'];
const TARGET_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const EXCLUDED_TOP_LEVEL = new Set([
  'node_modules',
  '.next',
  'vocabularytest',
  'vocabularytest-clone',
  'mobile',
  'cloud-run-scan',
]);
const EXCLUDED_PATH_PREFIXES = ['supabase/migrations'];

const ALLOWLIST_RELATIVE_PATH = 'security/sql-allowlist.json';

const SQL_STATEMENT_START_RE = /^\s*(SELECT|INSERT|UPDATE|DELETE|WITH|BEGIN|CREATE|ALTER|DROP)\b\s+/i;
const SQL_STATEMENT_SHAPE_RE = /\b(SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+\S+\s+SET|DELETE\s+FROM)\b/i;

const RULE_IDS = new Set(['SQL001', 'SQL002', 'SQL003', 'SQL004']);

function normalizeRelativePath(inputPath) {
  return inputPath.replace(/\\/g, '/').replace(/^\.\//, '');
}

function parseYmdDate(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utcDate = new Date(Date.UTC(year, month - 1, day));

  if (
    utcDate.getUTCFullYear() !== year ||
    utcDate.getUTCMonth() !== month - 1 ||
    utcDate.getUTCDate() !== day
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

function isExcludedPath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  const topLevel = normalized.split('/')[0];
  if (EXCLUDED_TOP_LEVEL.has(topLevel)) {
    return true;
  }

  return EXCLUDED_PATH_PREFIXES.some((prefix) => (
    normalized === prefix || normalized.startsWith(`${prefix}/`)
  ));
}

async function pathExists(absPath) {
  try {
    await fs.access(absPath);
    return true;
  } catch {
    return false;
  }
}

async function walkTargetFiles(absDir, relativeDir, outFiles) {
  const entries = await fs.readdir(absDir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const relativePath = normalizeRelativePath(path.posix.join(relativeDir, entry.name));
    if (isExcludedPath(relativePath)) {
      continue;
    }

    const absPath = path.join(absDir, entry.name);
    if (entry.isDirectory()) {
      await walkTargetFiles(absPath, relativePath, outFiles);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (!TARGET_EXTENSIONS.has(path.extname(entry.name))) {
      continue;
    }

    outFiles.push(relativePath);
  }
}

async function collectTargetFiles(repoRoot) {
  const outFiles = [];

  for (const targetRoot of TARGET_ROOTS) {
    const absRoot = path.join(repoRoot, targetRoot);
    if (!(await pathExists(absRoot))) {
      continue;
    }
    await walkTargetFiles(absRoot, targetRoot, outFiles);
  }

  outFiles.sort();
  return outFiles;
}

function getScriptKind(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.tsx') return ts.ScriptKind.TSX;
  if (ext === '.jsx') return ts.ScriptKind.JSX;
  if (ext === '.js' || ext === '.cjs' || ext === '.mjs') return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function getTemplateStaticText(node) {
  let text = node.head.text;
  for (const span of node.templateSpans) {
    text += span.literal.text;
  }
  return text;
}

function collectPlusChainStringFragments(node, outFragments) {
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    collectPlusChainStringFragments(node.left, outFragments);
    collectPlusChainStringFragments(node.right, outFragments);
    return;
  }

  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    outFragments.push(node.text);
    return;
  }

  if (ts.isTemplateExpression(node)) {
    outFragments.push(getTemplateStaticText(node));
  }
}

function isLikelySqlText(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return false;
  }

  const normalized = rawText
    .replace(/`/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.length === 0) {
    return false;
  }

  return SQL_STATEMENT_START_RE.test(normalized) || SQL_STATEMENT_SHAPE_RE.test(normalized);
}

function extractSqlHintText(node, sourceFile) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }

  if (ts.isTemplateExpression(node)) {
    return getTemplateStaticText(node);
  }

  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const fragments = [];
    collectPlusChainStringFragments(node, fragments);
    return fragments.join(' ');
  }

  return node.getText(sourceFile);
}

function getCallExpressionName(expression) {
  if (ts.isPropertyAccessExpression(expression)) {
    return expression.name.text;
  }

  if (ts.isElementAccessExpression(expression) && ts.isStringLiteralLike(expression.argumentExpression)) {
    return expression.argumentExpression.text;
  }

  if (ts.isIdentifier(expression)) {
    return expression.text;
  }

  return null;
}

function isUnsafeRawMethod(name) {
  if (!name) return false;
  const normalized = name.startsWith('$') ? name.slice(1) : name;
  return normalized === 'queryRawUnsafe' || normalized === 'executeRawUnsafe';
}

function isQueryMethod(expression) {
  const calleeName = getCallExpressionName(expression);
  return calleeName === 'query';
}

function isStringLikeNode(node) {
  return (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateExpression(node)
  );
}

function plusChainContainsStringNode(node) {
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    return plusChainContainsStringNode(node.left) || plusChainContainsStringNode(node.right);
  }
  return isStringLikeNode(node);
}

function isTopLevelPlusChain(node) {
  return !(
    ts.isBinaryExpression(node.parent) &&
    node.parent.operatorToken.kind === ts.SyntaxKind.PlusToken
  );
}

function isRawSqlQueryArg(node, sourceFile) {
  return isLikelySqlText(extractSqlHintText(node, sourceFile));
}

export function analyzeSourceText(sourceText, relativePath) {
  const sourceFile = ts.createSourceFile(
    relativePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(relativePath),
  );

  const findings = [];
  const seen = new Set();
  const normalizedPath = normalizeRelativePath(relativePath);

  function addFinding(rule, node, message) {
    const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const finding = {
      rule,
      file: normalizedPath,
      line: position.line + 1,
      column: position.character + 1,
      message,
    };
    const findingKey = `${finding.rule}|${finding.file}|${finding.line}|${finding.column}|${finding.message}`;
    if (!seen.has(findingKey)) {
      seen.add(findingKey);
      findings.push(finding);
    }
  }

  function visit(node) {
    if (ts.isCallExpression(node)) {
      const calleeName = getCallExpressionName(node.expression);
      if (isUnsafeRawMethod(calleeName)) {
        addFinding(
          'SQL001',
          node.expression,
          `Unsafe raw SQL API "${calleeName}" is forbidden.`,
        );
      }

      if (isQueryMethod(node.expression) && node.arguments.length > 0) {
        const firstArg = node.arguments[0];
        if (isRawSqlQueryArg(firstArg, sourceFile)) {
          addFinding(
            'SQL004',
            firstArg,
            'Raw SQL passed to .query(...) is forbidden in this repository.',
          );
        }
      }
    }

    if (ts.isTemplateExpression(node)) {
      if (
        node.templateSpans.length > 0 &&
        isLikelySqlText(getTemplateStaticText(node))
      ) {
        addFinding(
          'SQL002',
          node,
          'SQL template interpolation detected. Use parameterized APIs instead.',
        );
      }
    }

    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
      isTopLevelPlusChain(node) &&
      plusChainContainsStringNode(node) &&
      isLikelySqlText(extractSqlHintText(node, sourceFile))
    ) {
      addFinding(
        'SQL003',
        node,
        'SQL string concatenation detected. Avoid building SQL with "+".',
      );
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
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

export function validateAllowlistDocument(document, today = new Date()) {
  const errors = [];

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
  document.entries.forEach((entry, index) => {
    const result = validateAllowlistEntry(entry, index, today);
    errors.push(...result.errors);
    if (result.normalized) {
      entries.push(result.normalized);
    }
  });

  return { entries, errors };
}

export function applyAllowlist(findings, entries) {
  const allowKeys = new Set(entries.map((entry) => `${entry.path}|${entry.rule}`));
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

  const allowlist = await loadAllowlist(repoRoot, today);
  const files = await collectTargetFiles(repoRoot);

  const rawFindings = [];
  for (const relativeFile of files) {
    const absFile = path.join(repoRoot, relativeFile);
    const sourceText = await fs.readFile(absFile, 'utf8');
    rawFindings.push(...analyzeSourceText(sourceText, relativeFile));
  }

  const allowApplied = applyAllowlist(rawFindings, allowlist.entries);

  return {
    repoRoot,
    scannedFiles: files.length,
    configErrors: allowlist.errors,
    findings: allowApplied.findings,
    suppressedCount: allowApplied.suppressedCount,
  };
}

export async function runCli() {
  const result = await runGuard();

  result.configErrors.forEach((error) => {
    console.error(error);
  });

  result.findings.forEach((finding) => {
    console.error(formatFinding(finding));
  });

  if (result.configErrors.length > 0 || result.findings.length > 0) {
    if (result.findings.length > 0) {
      console.error(`Found ${result.findings.length} SQL guard violation(s).`);
    }
    if (result.configErrors.length > 0) {
      console.error(`Found ${result.configErrors.length} allowlist configuration issue(s).`);
    }
    return 1;
  }

  console.log(`SQL guard passed (scanned ${result.scannedFiles} files, violations 0).`);
  return 0;
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === thisFile) {
  const exitCode = await runCli();
  process.exit(exitCode);
}
