import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAiCompatibleProvider } from './openai-compatible.js';
import type { InvestigationRequest, DbDetectionResult } from '../types.js';

// Mock fetch for testing
global.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
  const [url, init] = args;
  const body = init?.body ? JSON.parse(init.body as string) : {};
  
  // Check if this is a tool call response request
  const hasToolResults = body.messages?.some((m: { role: string }) => m.role === 'tool');
  
  if (hasToolResults) {
    // Return final assessment after tool execution
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{
          finish_reason: 'stop',
          message: {
            content: JSON.stringify({
              summary: 'テスト評価',
              riskScore: 65,
              riskLevel: 'high',
              ioBudgetExhaustionRisk: 60,
              factors: ['要因1', '要因2'],
              recommendations: ['推奨事項1'],
            }),
          },
        }],
      }),
    } as Response;
  }
  
  // First call - return tool_calls
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{
        finish_reason: 'tool_calls',
        message: {
          content: null,
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: {
                name: 'analyze_file_risk',
                arguments: JSON.stringify({
                  path: 'supabase/migrations/test.sql',
                  changeType: 'added',
                }),
              },
            },
            {
              id: 'call_2',
              type: 'function',
              function: {
                name: 'calculate_risk_metrics',
                arguments: JSON.stringify({
                  fileRisks: [
                    { path: 'supabase/migrations/test.sql', riskWeight: 35, isDbRelated: true },
                  ],
                  totalFiles: 1,
                }),
              },
            },
            {
              id: 'call_3',
              type: 'function',
              function: {
                name: 'generate_assessment_output',
                arguments: JSON.stringify({
                  summary: 'テスト評価',
                  riskScore: 65,
                  riskLevel: 'high',
                  ioBudgetExhaustionRisk: 60,
                  factors: ['要因1', '要因2'],
                  recommendations: ['推奨事項1'],
                }),
              },
            },
          ],
        },
      }],
    }),
  } as Response;
};

test('OpenAiCompatibleProvider has correct name', () => {
  const provider = new OpenAiCompatibleProvider({
    endpoint: 'https://api.test.com',
    apiKey: 'test-key',
    model: 'gpt-4o',
  });
  
  assert.equal(provider.name, 'openai-compatible');
});

test('OpenAiCompatibleProvider assess returns assessment from tool calls', async () => {
  const provider = new OpenAiCompatibleProvider({
    endpoint: 'https://api.test.com',
    apiKey: 'test-key',
    model: 'gpt-4o',
  });
  
  const request: InvestigationRequest = {
    repository: 'test/repo',
    prNumber: 123,
    changedFiles: [
      {
        path: 'supabase/migrations/test.sql',
        changeType: 'added',
        additions: 10,
        patch: 'CREATE INDEX idx_test ON users(email);',
      },
    ],
  };
  
  const detection: DbDetectionResult = {
    isDbRelated: true,
    changedFileCount: 1,
    dbChangedFileCount: 1,
    matches: [
      {
        path: 'supabase/migrations/test.sql',
        rule: 'supabase-migrations',
        reason: 'Supabase migration changed',
        weight: 35,
      },
    ],
  };
  
  const result = await provider.assess({ request, detection });
  
  assert.equal(result.provider, 'openai-compatible');
  assert.equal(result.riskLevel, 'high');
  assert.equal(result.riskScore, 65);
  assert.equal(result.ioBudgetExhaustionRisk, 60);
  assert.ok(Array.isArray(result.factors));
  assert.ok(Array.isArray(result.recommendations));
});

test('OpenAiCompatibleProvider handles API errors gracefully', async () => {
  // Override fetch to simulate error
  const originalFetch = global.fetch;
  global.fetch = async (): Promise<Response> => {
    throw new Error('Network error');
  };
  
  const provider = new OpenAiCompatibleProvider({
    endpoint: 'https://api.test.com',
    apiKey: 'test-key',
    model: 'gpt-4o',
  });
  
  const request: InvestigationRequest = {
    repository: 'test/repo',
    changedFiles: [
      {
        path: 'supabase/migrations/test.sql',
        changeType: 'added',
      },
    ],
  };
  
  const detection: DbDetectionResult = {
    isDbRelated: true,
    changedFileCount: 1,
    dbChangedFileCount: 1,
    matches: [
      {
        path: 'supabase/migrations/test.sql',
        rule: 'supabase-migrations',
        reason: 'Supabase migration changed',
        weight: 35,
      },
    ],
  };
  
  // Should fall back to heuristic on error
  try {
    const result = await provider.assess({ request, detection });
    // Should return fallback assessment
    assert.ok(result.riskScore >= 0);
    assert.ok(result.riskScore <= 100);
    assert.ok(['low', 'medium', 'high', 'critical'].includes(result.riskLevel));
  } finally {
    global.fetch = originalFetch;
  }
});
