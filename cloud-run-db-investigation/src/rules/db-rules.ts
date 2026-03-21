import type { ChangedFile, DbDetectionResult, DetectionMatch } from '../types.js';

interface PathRule {
  name: string;
  reason: string;
  weight: number;
  pattern: RegExp;
}

interface ContentRule {
  name: string;
  reason: string;
  weight: number;
  pattern: RegExp;
}

const PATH_RULES: PathRule[] = [
  {
    name: 'supabase-migrations',
    reason: 'Supabase migration changed',
    weight: 35,
    pattern: /(^|\\|\/)supabase(\\|\/)migrations(\\|\/).+\.sql$/i,
  },
  {
    name: 'db-layer-source',
    reason: 'Application DB layer source changed',
    weight: 20,
    pattern: /(^|\\|\/)src(\\|\/)lib(\\|\/)db(\\|\/).+\.(ts|tsx|js|mjs)$/i,
  },
  {
    name: 'db-api-route',
    reason: 'Server route likely touching DB changed',
    weight: 15,
    pattern: /(^|\\|\/)src(\\|\/)app(\\|\/)api(\\|\/).+\.(ts|tsx|js|mjs)$/i,
  },
  {
    name: 'sql-doc-or-script',
    reason: 'SQL script or DB operation doc changed',
    weight: 10,
    pattern: /(^|\\|\/)(scripts|docs|security)(\\|\/).+\.(sql|md)$/i,
  },
  {
    name: 'prisma-or-schema',
    reason: 'DB schema definition file changed',
    weight: 25,
    pattern: /(schema\.prisma|drizzle|typeorm|knex|sequelize|sqlc)/i,
  },
];

const CONTENT_RULES: ContentRule[] = [
  {
    name: 'ddl-statement',
    reason: 'DDL keyword found in patch',
    weight: 35,
    pattern: /\b(create|alter|drop)\s+(table|index|policy|view)\b/i,
  },
  {
    name: 'index-change',
    reason: 'Index operation found in patch',
    weight: 25,
    pattern: /\b(create|drop)\s+index\b|\busing\s+(btree|gin|gist|hash)\b/i,
  },
  {
    name: 'query-shape-risk',
    reason: 'High IO query pattern found in patch',
    weight: 20,
    pattern: /\b(select\s+\*|order\s+by|group\s+by|join|ilike|offset\s+\d+)\b/i,
  },
  {
    name: 'supabase-rpc',
    reason: 'Supabase RPC/raw SQL usage changed',
    weight: 20,
    pattern: /\b(rpc\(|from\(|.eq\(|service_role|supabase\.from|supabase\.rpc)\b/i,
  },
  {
    name: 'rls-or-policy',
    reason: 'RLS or policy statement changed',
    weight: 15,
    pattern: /\b(row\s+level\s+security|enable\s+rls|policy)\b/i,
  },
];

// Threshold: at least one rule match required to flag change as DB-related
const DB_DETECTION_MIN_MATCHES = 1;

export function detectDbRelatedChanges(changedFiles: ChangedFile[]): DbDetectionResult {
  const matches: DetectionMatch[] = [];

  for (const file of changedFiles) {
    for (const rule of PATH_RULES) {
      if (rule.pattern.test(file.path)) {
        matches.push({
          path: file.path,
          rule: rule.name,
          reason: rule.reason,
          weight: rule.weight,
        });
      }
    }

    if (!file.patch) continue;
    for (const rule of CONTENT_RULES) {
      if (rule.pattern.test(file.patch)) {
        matches.push({
          path: file.path,
          rule: rule.name,
          reason: rule.reason,
          weight: rule.weight,
        });
      }
    }
  }

  const uniqueDbPaths = new Set(matches.map((m) => m.path));
  return {
    isDbRelated: matches.length >= DB_DETECTION_MIN_MATCHES,
    matches,
    changedFileCount: changedFiles.length,
    dbChangedFileCount: uniqueDbPaths.size,
  };
}
