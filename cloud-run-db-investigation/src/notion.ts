import type { DbDetectionResult, InvestigationRequest, IoRiskAssessment, NotionWriteResult } from './types.js';

const NOTION_VERSION = '2022-06-28';

interface NotionClientConfig {
  apiKey?: string;
  databaseId?: string;
}

function truncate(value: string, max = 1900): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
}

export class NotionDbInvestigationWriter {
  constructor(private readonly config: NotionClientConfig) {}

  async write(input: {
    request: InvestigationRequest;
    detection: DbDetectionResult;
    assessment: IoRiskAssessment;
  }): Promise<NotionWriteResult> {
    const apiKey = this.config.apiKey?.trim();
    const databaseId = this.config.databaseId?.trim();

    if (!apiKey || !databaseId) {
      return {
        attempted: false,
        written: false,
        skippedReason: 'NOTION_API_KEY or NOTION_DATABASE_ID is missing',
      };
    }

    const body = {
      parent: { database_id: databaseId },
      properties: {
        Name: {
          title: [
            {
              text: {
                content: truncate(
                  `[DB IO Risk] ${input.request.repository}#${input.request.prNumber ?? 'manual'}`,
                  120,
                ),
              },
            },
          ],
        },
        Repository: {
          rich_text: [{ text: { content: input.request.repository } }],
        },
        PR: {
          number: input.request.prNumber ?? null,
        },
        CommitSHA: {
          rich_text: [{ text: { content: input.request.commitSha ?? '' } }],
        },
        Source: {
          select: { name: input.request.source ?? 'manual' },
        },
        TriggeredAt: {
          date: {
            start: input.request.triggeredAt || new Date().toISOString(),
          },
        },
        RiskLevel: {
          select: { name: input.assessment.riskLevel },
        },
        RiskScore: {
          number: input.assessment.riskScore,
        },
        IOBudgetExhaustionRisk: {
          number: input.assessment.ioBudgetExhaustionRisk,
        },
        Provider: {
          select: { name: input.assessment.provider },
        },
        Summary: {
          rich_text: [{ text: { content: truncate(input.assessment.summary) } }],
        },
        DBChangedFiles: {
          number: input.detection.dbChangedFileCount,
        },
        ChangedFiles: {
          number: input.detection.changedFileCount,
        },
        PRUrl: {
          url: input.request.prUrl ?? null,
        },
        RuleMatches: {
          rich_text: [
            {
              text: {
                content: truncate(
                  input.detection.matches
                    .slice(0, 15)
                    .map((m) => `${m.rule}:${m.path}`)
                    .join(' | ') || 'none',
                ),
              },
            },
          ],
        },
        Recommendations: {
          rich_text: [
            {
              text: {
                content: truncate(input.assessment.recommendations.join(' | ')),
              },
            },
          ],
        },
      },
    };

    const response = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Notion write failed (${response.status}): ${truncate(text, 400)}`);
    }

    const payload = (await response.json()) as { id?: string };
    return {
      attempted: true,
      written: true,
      pageId: payload.id,
    };
  }
}
