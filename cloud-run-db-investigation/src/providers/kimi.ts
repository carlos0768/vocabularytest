import type { RiskAssessmentProvider } from './types.js';
import type { DbDetectionResult, InvestigationRequest, IoRiskAssessment, RiskLevel } from '../types.js';

interface KimiConfig {
  endpoint: string;
  apiKey: string;
  model: string;
}

interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

interface ToolMessage {
  role: 'tool';
  tool_call_id: string;
  content: string;
}

interface AssistantMessage {
  role: 'assistant';
  content?: string;
  tool_calls?: ToolCall[];
}

type Message = 
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | AssistantMessage
  | ToolMessage;

// Tool definitions for DB risk assessment
const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'analyze_file_risk',
      description: 'Analyze a changed file for DB-related risks based on path and patch content',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'File path',
          },
          changeType: {
            type: 'string',
            enum: ['added', 'modified', 'removed', 'renamed'],
            description: 'Type of change',
          },
          additions: {
            type: 'number',
            description: 'Number of lines added',
          },
          deletions: {
            type: 'number',
            description: 'Number of lines deleted',
          },
          patch: {
            type: 'string',
            description: 'The diff patch content (truncated if very long)',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'calculate_risk_metrics',
      description: 'Calculate aggregated risk metrics based on individual file analyses',
      parameters: {
        type: 'object',
        properties: {
          fileRisks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                riskWeight: { type: 'number', description: 'Risk weight 0-100' },
                isDbRelated: { type: 'boolean' },
                concerns: { type: 'array', items: { type: 'string' } },
              },
              required: ['path', 'riskWeight', 'isDbRelated'],
            },
          },
          totalFiles: {
            type: 'number',
            description: 'Total number of changed files',
          },
        },
        required: ['fileRisks', 'totalFiles'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'generate_assessment_output',
      description: 'Generate the final structured risk assessment output',
      parameters: {
        type: 'object',
        properties: {
          summary: {
            type: 'string',
            description: 'Brief summary of the assessment',
          },
          riskScore: {
            type: 'number',
            description: 'Overall risk score 0-100',
          },
          riskLevel: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'critical'],
            description: 'Risk level based on score',
          },
          ioBudgetExhaustionRisk: {
            type: 'number',
            description: 'IO budget exhaustion risk 0-100',
          },
          factors: {
            type: 'array',
            items: { type: 'string' },
            description: 'Key risk factors identified',
          },
          recommendations: {
            type: 'array',
            items: { type: 'string' },
            description: 'Actionable recommendations',
          },
        },
        required: ['summary', 'riskScore', 'riskLevel', 'ioBudgetExhaustionRisk', 'factors', 'recommendations'],
      },
    },
  },
];

export class KimiProvider implements RiskAssessmentProvider {
  readonly name = 'kimi';

  constructor(private readonly config: KimiConfig) {}

  async assess(input: { request: InvestigationRequest; detection: DbDetectionResult }): Promise<IoRiskAssessment> {
    try {
      return await this.performAssessment(input);
    } catch (error) {
      console.error('[KimiProvider] Assessment failed, using fallback:', error instanceof Error ? error.message : String(error));
      return this.fallbackAssessment(input.detection);
    }
  }

  private async performAssessment(input: { request: InvestigationRequest; detection: DbDetectionResult }): Promise<IoRiskAssessment> {
    const { request, detection } = input;
    
    const messages: Message[] = [
      {
        role: 'system',
        content: `You are a database risk assessment specialist. Analyze code changes for potential database IO risks.

Your task is to:
1. Analyze each changed file for DB-related risks using the analyze_file_risk tool
2. Calculate aggregated risk metrics using calculate_risk_metrics
3. Generate a final assessment using generate_assessment_output

Risk factors to consider:
- Migration files (high risk)
- Schema changes (high risk)
- Index operations (medium-high risk)
- Query pattern changes (medium risk)
- RLS/policy changes (medium risk)

Always use the tools provided to complete your assessment. Do not respond with raw text - always use the tools.`,
      },
      {
        role: 'user',
        content: this.buildUserPrompt(request, detection),
      },
    ];

    // Execute tool calling loop
    const maxIterations = 10;
    for (let i = 0; i < maxIterations; i++) {
      const response = await this.callChatApi(messages);
      
      if (response.finish_reason === 'stop' || !response.message.tool_calls) {
        // Try to parse final response if no tool calls
        if (response.message.content) {
          const parsed = this.tryParseAssessment(response.message.content);
          if (parsed) return parsed;
        }
        break;
      }

      if (response.finish_reason === 'tool_calls' && response.message.tool_calls) {
        // Add assistant message with tool calls
        messages.push({
          role: 'assistant',
          content: response.message.content,
          tool_calls: response.message.tool_calls,
        });

        // Execute each tool call and add results
        for (const toolCall of response.message.tool_calls) {
          const result = await this.executeTool(toolCall, detection);
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify(result),
          });
        }
      }
    }

    // If we didn't get a valid assessment from tool calls, fall back to heuristic
    return await this.fallbackAssessment(input.detection);
  }

  private buildUserPrompt(request: InvestigationRequest, detection: DbDetectionResult): string {
    const filesInfo = detection.matches.map(m => 
      `- ${m.path} (${m.rule}: ${m.reason}, weight: ${m.weight})`
    ).join('\n');

    const changedFilesDetails = request.changedFiles
      .filter(f => detection.matches.some(m => m.path === f.path))
      .map(f => {
        const patchPreview = f.patch ? f.patch.substring(0, 500) : '[no patch]';
        return `File: ${f.path}
Change type: ${f.changeType || 'unknown'}
Additions: ${f.additions || 0}, Deletions: ${f.deletions || 0}
Patch preview:\n${patchPreview}${f.patch && f.patch.length > 500 ? '\n... (truncated)' : ''}`;
      }).join('\n\n---\n\n');

    return `Repository: ${request.repository}
PR: ${request.prNumber || 'N/A'} (${request.prUrl || 'N/A'})
Commit: ${request.commitSha || 'N/A'}
Actor: ${request.actor || 'unknown'}
Source: ${request.source || 'unknown'}

DB-related matches (${detection.dbChangedFileCount}/${detection.changedFileCount} files):
${filesInfo}

Changed files details:
${changedFilesDetails}

Please analyze these changes and provide a risk assessment using the available tools.`;
  }

  private async callChatApi(messages: Message[]): Promise<{
    finish_reason: string;
    message: {
      content?: string;
      tool_calls?: ToolCall[];
    };
  }> {
    const url = `${this.config.endpoint.replace(/\/$/, '')}/chat/completions`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        tools: TOOLS,
        tool_choice: 'auto',
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Kimi API error: ${response.status} ${text}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    
    if (!choice) {
      throw new Error('No choices in Kimi API response');
    }

    return {
      finish_reason: choice.finish_reason,
      message: choice.message,
    };
  }

  private async executeTool(toolCall: ToolCall, detection: DbDetectionResult): Promise<unknown> {
    const args = JSON.parse(toolCall.function.arguments);
    
    switch (toolCall.function.name) {
      case 'analyze_file_risk':
        return this.toolAnalyzeFileRisk(args, detection);
      case 'calculate_risk_metrics':
        return this.toolCalculateRiskMetrics(args);
      case 'generate_assessment_output':
        return this.toolGenerateAssessmentOutput(args);
      default:
        return { error: `Unknown tool: ${toolCall.function.name}` };
    }
  }

  private toolAnalyzeFileRisk(args: {
    path: string;
    changeType?: string;
    additions?: number;
    deletions?: number;
    patch?: string;
  }, detection: DbDetectionResult): {
    path: string;
    riskWeight: number;
    isDbRelated: boolean;
    concerns: string[];
  } {
    const matches = detection.matches.filter(m => m.path === args.path);
    const totalWeight = matches.reduce((sum, m) => sum + m.weight, 0);
    
    const concerns: string[] = [];
    for (const match of matches) {
      concerns.push(`${match.rule}: ${match.reason}`);
    }

    // Additional concerns based on patch analysis
    if (args.patch) {
      if (/\b(create|alter|drop)\s+(table|index|policy|view)\b/i.test(args.patch)) {
        concerns.push('DDL statement detected');
      }
      if (/\b(create|drop)\s+index\b/i.test(args.patch)) {
        concerns.push('Index modification detected');
      }
      if (/\bselect\s+\*/i.test(args.patch)) {
        concerns.push('SELECT * pattern may impact performance');
      }
      if (/\b(rpc\(|service_role|supabase\.from)\b/i.test(args.patch)) {
        concerns.push('Direct DB/RPC access detected');
      }
    }

    return {
      path: args.path,
      riskWeight: Math.min(100, totalWeight + (concerns.length * 5)),
      isDbRelated: matches.length > 0,
      concerns: concerns.slice(0, 10), // Limit concerns
    };
  }

  private toolCalculateRiskMetrics(args: {
    fileRisks: Array<{
      path: string;
      riskWeight: number;
      isDbRelated: boolean;
      concerns?: string[];
    }>;
    totalFiles: number;
  }): {
    aggregatedScore: number;
    dbFileCount: number;
    maxRiskWeight: number;
    totalConcerns: number;
    adjustedScore: number;
  } {
    const dbFiles = args.fileRisks.filter(f => f.isDbRelated);
    const baseScore = dbFiles.reduce((sum, f) => sum + f.riskWeight, 0);
    const maxRiskWeight = Math.max(0, ...args.fileRisks.map(f => f.riskWeight));
    const totalConcerns = args.fileRisks.reduce((sum, f) => sum + (f.concerns?.length || 0), 0);
    
    // File spread bonus
    const spreadBonus = Math.min(20, dbFiles.length * 3);
    const adjustedScore = Math.min(100, baseScore + spreadBonus);

    return {
      aggregatedScore: Math.min(100, baseScore),
      dbFileCount: dbFiles.length,
      maxRiskWeight,
      totalConcerns,
      adjustedScore,
    };
  }

  private toolGenerateAssessmentOutput(args: {
    summary: string;
    riskScore: number;
    riskLevel: RiskLevel;
    ioBudgetExhaustionRisk: number;
    factors: string[];
    recommendations: string[];
  }): IoRiskAssessment {
    return {
      provider: 'kimi',
      summary: args.summary,
      riskScore: Math.max(0, Math.min(100, args.riskScore)),
      riskLevel: args.riskLevel,
      ioBudgetExhaustionRisk: Math.max(0, Math.min(100, args.ioBudgetExhaustionRisk)),
      factors: args.factors.slice(0, 20),
      recommendations: args.recommendations.slice(0, 10),
    };
  }

  private tryParseAssessment(content: string): IoRiskAssessment | null {
    try {
      // Try to extract JSON from markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      const parsed = JSON.parse(jsonStr);
      
      if (parsed.riskScore !== undefined && parsed.riskLevel) {
        return {
          provider: 'kimi',
          summary: parsed.summary || 'AI-generated assessment',
          riskScore: Math.max(0, Math.min(100, parsed.riskScore)),
          riskLevel: parsed.riskLevel,
          ioBudgetExhaustionRisk: Math.max(0, Math.min(100, parsed.ioBudgetExhaustionRisk || parsed.riskScore)),
          factors: parsed.factors || [],
          recommendations: parsed.recommendations || [],
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  private async fallbackAssessment(detection: DbDetectionResult): Promise<IoRiskAssessment> {
    // Import dynamically to avoid circular dependency
    const { buildHeuristicAssessment } = await import('../risk-scorer.js');
    const result = buildHeuristicAssessment(detection);
    return { ...result, provider: 'kimi-fallback' };
  }
}
