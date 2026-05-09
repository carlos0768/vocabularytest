export interface HomeScanJobNotificationJob {
  id: string;
  project_id: string | null;
  project_title?: string | null;
  status: string;
  result: string | null;
}

export interface HomeScanJobLocalNotification {
  title: string;
  body: string;
  tag: string;
}

interface GroupedScanJobNotification {
  projectTitle: string;
  wordCount: number;
  hasFailed: boolean;
  hasGrammarWarning: boolean;
}

const GRAMMAR_NOT_FOUND_WARNING = 'grammar_not_found';

export function buildHomeScanJobLocalNotifications(
  jobs: readonly HomeScanJobNotificationJob[],
): HomeScanJobLocalNotification[] {
  const grouped = new Map<string, GroupedScanJobNotification>();

  for (const job of jobs) {
    const key = getHomeScanJobNotificationKey(job);
    const parsedResult = parseHomeScanJobResult(job.result);
    const existing = grouped.get(key);

    if (existing) {
      existing.wordCount += parsedResult.wordCount;
      existing.hasFailed = existing.hasFailed || job.status === 'failed';
      existing.hasGrammarWarning = existing.hasGrammarWarning || parsedResult.hasGrammarWarning;
      continue;
    }

    grouped.set(key, {
      projectTitle: job.project_title || '単語帳',
      wordCount: parsedResult.wordCount,
      hasFailed: job.status === 'failed',
      hasGrammarWarning: parsedResult.hasGrammarWarning,
    });
  }

  return Array.from(grouped.entries()).map(([key, entry]) => {
    const content = buildHomeScanJobNotificationContent(entry);
    return {
      title: content.title,
      body: content.body,
      tag: `scan-job-${key}`,
    };
  });
}

function getHomeScanJobNotificationKey(job: HomeScanJobNotificationJob): string {
  return job.project_id || job.project_title || job.id;
}

function parseHomeScanJobResult(result: string | null): {
  wordCount: number;
  hasGrammarWarning: boolean;
} {
  if (!result) {
    return { wordCount: 0, hasGrammarWarning: false };
  }

  try {
    const parsed = JSON.parse(result) as unknown;
    if (!isRecord(parsed)) {
      return { wordCount: 0, hasGrammarWarning: false };
    }

    return {
      wordCount: typeof parsed.wordCount === 'number' ? parsed.wordCount : 0,
      hasGrammarWarning: Array.isArray(parsed.warnings)
        && parsed.warnings.includes(GRAMMAR_NOT_FOUND_WARNING),
    };
  } catch {
    return { wordCount: 0, hasGrammarWarning: false };
  }
}

function buildHomeScanJobNotificationContent(
  entry: GroupedScanJobNotification,
): Pick<HomeScanJobLocalNotification, 'title' | 'body'> {
  if (entry.hasFailed) {
    return {
      title: 'MERKEN: スキャン失敗',
      body: `「${entry.projectTitle}」のスキャンに失敗しました`,
    };
  }

  if (entry.hasGrammarWarning) {
    return {
      title: 'MERKEN: 文法抽出なし',
      body: `「${entry.projectTitle}」で文法抽出が見つからなかったため、通常抽出に切り替えました`,
    };
  }

  return {
    title: 'MERKEN: スキャン完了',
    body: `「${entry.projectTitle}」に${entry.wordCount}語追加されました`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
