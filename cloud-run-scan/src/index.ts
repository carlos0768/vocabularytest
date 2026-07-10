/**
 * ScanVocab AI Gateway - Cloud Run Service
 *
 * Vertex AI (Gemini) と OpenAI へのリクエストを中継するゲートウェイ。
 * Vercel の API Routes からのみ呼び出される。
 */

import { randomUUID } from 'node:crypto';
import express from 'express';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import {
  GeminiFallbackRunner,
  loadFallbackConfigFromEnv,
} from './fallback/runner.js';
import {
  DailyGatewayLimiter,
  loadGatewayLimiterConfigFromEnv,
} from './gateway-limiter.js';
import {
  createGatewayBudgetGuard,
  loadGatewayFirestoreGuardConfigFromEnv,
} from './gateway-firestore-guard.js';
import { normalizeGeminiModel } from './gemini-model.js';
import type { AppEnv, ProviderGenerateResult, ProviderUsage } from './fallback/types.js';

const app = express();
app.use(express.json({ limit: '10mb' }));

// ============================================
// Auth middleware - shared secret
// ============================================
const AUTH_TOKEN = process.env.AUTH_TOKEN;

app.use((req, res, next) => {
  if (req.path === '/health') return next();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!AUTH_TOKEN || token !== AUTH_TOKEN) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  next();
});

// ============================================
// AI Clients
// ============================================

// Vertex AI (Gemini) - uses service account ADC on Cloud Run
const geminiClient = new GoogleGenAI({
  vertexai: true,
  project: process.env.GCP_PROJECT_ID!,
  location: process.env.GCP_LOCATION || 'asia-northeast1',
});

const openaiApiKey = process.env.OPENAI_API_KEY?.trim();
if (!openaiApiKey) {
  throw new Error('OPENAI_API_KEY is required for Cloud Run fallback');
}

const openaiClient = new OpenAI({ apiKey: openaiApiKey });

const fallbackConfig = loadFallbackConfigFromEnv(process.env);
const fallbackRunner = new GeminiFallbackRunner(fallbackConfig);
const gatewayLimiterConfig = loadGatewayLimiterConfigFromEnv(process.env);
const gatewayLimiter = new DailyGatewayLimiter(gatewayLimiterConfig);
const gatewayFirestoreGuardConfig = loadGatewayFirestoreGuardConfigFromEnv(process.env);
const gatewayFirestoreGuard = createGatewayBudgetGuard(gatewayFirestoreGuardConfig, gatewayLimiterConfig);

// ============================================
// Health check
// ============================================
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    fallbackModel: fallbackConfig.fallbackOpenAIModel,
    breakerOpenMs: fallbackConfig.breakerOpenMs,
    gatewayCallsDailyCap: gatewayLimiterConfig.callsDailyCap,
    gatewayCostDailyCapYen: gatewayLimiterConfig.costDailyCapYen,
    gatewayGuardStore: gatewayFirestoreGuard.store,
    gatewayGuardStateDoc: gatewayFirestoreGuardConfig.stateDocPath,
  });
});

// ============================================
// POST /generate - AI Gateway endpoint
// ============================================
interface GenerateRequest {
  provider: 'gemini' | 'openai';
  model: string;
  prompt: string;
  systemPrompt?: string;
  image?: {
    base64: string;
    mimeType: string;
  };
  temperature: number;
  maxOutputTokens: number;
  responseFormat?: 'json' | 'text';
  // Gemini Controlled Generation schema forwarded from the web app. Only honored for Gemini + json.
  responseSchema?: Record<string, unknown>;
  requestId?: string;
  feature?: string;
  env?: AppEnv;
}

function buildTimingPayload(startedAtMs: number) {
  const endedAt = new Date();
  return {
    startedAt: new Date(startedAtMs).toISOString(),
    endedAt: endedAt.toISOString(),
    elapsedMs: endedAt.getTime() - startedAtMs,
  };
}

function normalizeAppEnv(value: string | undefined, fallback: AppEnv): AppEnv {
  return value === 'stg' || value === 'prod' ? value : fallback;
}

function asProviderUsage(raw: unknown): ProviderUsage | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const value = raw as Record<string, unknown>;
  const input = typeof value.inputTokens === 'number' ? value.inputTokens : undefined;
  const output = typeof value.outputTokens === 'number' ? value.outputTokens : undefined;
  const total = typeof value.totalTokens === 'number' ? value.totalTokens : undefined;
  if (input === undefined && output === undefined && total === undefined) {
    return undefined;
  }
  return { inputTokens: input, outputTokens: output, totalTokens: total };
}

async function runGeminiRequest(body: GenerateRequest): Promise<ProviderGenerateResult> {
  const model = normalizeGeminiModel(body.model);
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];
  const fullPrompt = body.systemPrompt ? `${body.systemPrompt}\n\n${body.prompt}` : body.prompt;
  parts.push({ text: fullPrompt });

  if (body.image) {
    parts.push({
      inlineData: {
        mimeType: body.image.mimeType,
        data: body.image.base64,
      },
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const generateConfig: any = {
    temperature: body.temperature,
    maxOutputTokens: body.maxOutputTokens,
  };

  // Gemini 2.5 models have "thinking" enabled by default.
  // 検証用: 2.5 Flashはthinkingを完全オフにする（thinkingBudget: 0）。
  // 抽出品質への影響を確認したら、恒久化するか従来の25%キャップに戻す。
  // 2.5 Proはthinkingを無効化できないため従来のキャップ(25% / max 1024)を維持。
  if (model.includes('2.5')) {
    const thinkingBudget = model.includes('flash')
      ? 0
      : Math.min(
          Math.floor(body.maxOutputTokens * 0.25),
          1024,
        );
    generateConfig.thinkingConfig = { thinkingBudget };
  }

  if (body.responseFormat === 'json') {
    generateConfig.responseMimeType = 'application/json';
    // Controlled Generation: constrain output to the shape the web app requested.
    if (body.responseSchema) {
      generateConfig.responseSchema = body.responseSchema;
    }
  }

  const response = await geminiClient.models.generateContent({
    model,
    contents: [{ role: 'user', parts }],
    config: generateConfig,
  });

  const content = response.text?.trim();
  if (!content) {
    const candidate = response.candidates?.[0];
    const diagnostics = {
      finishReason: candidate?.finishReason,
      partCount: candidate?.content?.parts?.length ?? 0,
      partKeys: candidate?.content?.parts?.map((part) => Object.keys(part)),
      promptBlockReason: response.promptFeedback?.blockReason,
      promptSafetyRatings: response.promptFeedback?.safetyRatings,
      usageMetadata: response.usageMetadata,
    };
    console.warn('[gemini-empty-content]', JSON.stringify(diagnostics));
    const reasonSuffix = diagnostics.finishReason ? `: ${diagnostics.finishReason}` : '';
    throw new Error(`Gemini returned empty content${reasonSuffix}`);
  }

  const usage = asProviderUsage({
    inputTokens: response.usageMetadata?.promptTokenCount,
    outputTokens: response.usageMetadata?.candidatesTokenCount,
    totalTokens: response.usageMetadata?.totalTokenCount,
  });

  return {
    content,
    modelUsed: response.modelVersion || model,
    usage,
  };
}

async function runOpenAIRequest(body: GenerateRequest, modelOverride?: string): Promise<ProviderGenerateResult> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  if (body.systemPrompt) {
    messages.push({
      role: 'system',
      content: body.systemPrompt,
    });
  }

  if (body.image) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: body.prompt },
        {
          type: 'image_url',
          image_url: {
            url: `data:${body.image.mimeType};base64,${body.image.base64}`,
          },
        },
      ],
    });
  } else {
    messages.push({ role: 'user', content: body.prompt });
  }

  const response = await openaiClient.chat.completions.create({
    model: modelOverride || body.model,
    messages,
    temperature: body.temperature,
    max_tokens: body.maxOutputTokens,
    ...(body.responseFormat === 'json' && { response_format: { type: 'json_object' } }),
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('OpenAI returned empty content');
  }

  const usage = asProviderUsage({
    inputTokens: response.usage?.prompt_tokens,
    outputTokens: response.usage?.completion_tokens,
    totalTokens: response.usage?.total_tokens,
  });

  return {
    content,
    modelUsed: response.model || modelOverride || body.model,
    usage,
  };
}

app.post('/generate', async (req, res) => {
  const startTime = Date.now();
  const body = req.body as GenerateRequest;
  const { provider, model, image, responseFormat } = body;

  const requestId =
    req.headers['x-request-id']?.toString() ||
    body.requestId ||
    randomUUID();

  try {
    if (provider === 'gemini' || provider === 'openai') {
      if (!gatewayLimiter.canStart()) {
        const timing = buildTimingPayload(startTime);
        const summary = gatewayLimiter.getTodaySummary();
        console.warn('[gateway-cap-reached]', {
          requestId,
          calls: summary.calls,
          callsDailyCap: summary.callsDailyCap,
          yen: summary.yen,
          costDailyCapYen: summary.costDailyCapYen,
        });
        res.status(429).json({
          success: false,
          error: 'Gateway daily cap reached',
          timing,
        });
        return;
      }

      const firestoreGuardReservation = await gatewayFirestoreGuard.reserveStart(startTime);
      if (!firestoreGuardReservation.allowed) {
        const timing = buildTimingPayload(startTime);
        console.warn('[gateway-budget-guard-blocked]', {
          requestId,
          reason: firestoreGuardReservation.reason,
          disabledReason: firestoreGuardReservation.disabledReason,
          calls: firestoreGuardReservation.calls,
          callsDailyCap: firestoreGuardReservation.callsDailyCap,
          yen: firestoreGuardReservation.yen,
          costDailyCapYen: firestoreGuardReservation.costDailyCapYen,
        });
        res.status(429).json({
          success: false,
          error: 'Gateway budget guard blocked this request',
          reason: firestoreGuardReservation.reason,
          timing,
        });
        return;
      }

      const gatewaySummary = gatewayLimiter.recordStart();
      console.log(
        `[generate] id=${requestId} provider=${provider} model=${model} hasImage=${!!image} format=${responseFormat}` +
          ` gatewayCalls=${gatewaySummary.calls}/${gatewaySummary.callsDailyCap}` +
          ` globalGatewayCalls=${firestoreGuardReservation.calls}/${firestoreGuardReservation.callsDailyCap}`,
      );
    }

    if (provider === 'gemini') {
      const ctx = {
        env: normalizeAppEnv(body.env, fallbackConfig.appEnv),
        feature: body.feature || 'scan_extraction',
        requestId,
      };

      const result = await fallbackRunner.execute(
        {
          ctx,
        },
        {
          runGemini: () => runGeminiRequest(body),
          runOpenAI: (fallbackModel) => runOpenAIRequest(body, fallbackModel),
        },
      );

      const timing = buildTimingPayload(startTime);
      console.log(
        `[generate] id=${requestId} provider=${result.provider} completed in ${timing.elapsedMs}ms` +
          (result.fallbackReason ? ` reason=${result.fallbackReason}` : ''),
      );

      res.json({
        success: true,
        content: result.content,
        providerUsed: result.provider,
        modelUsed: result.modelUsed,
        usage: result.usage,
        fallbackReason: result.fallbackReason,
        timing,
      });
      return;
    }

    if (provider === 'openai') {
      const result = await runOpenAIRequest(body);
      const timing = buildTimingPayload(startTime);
      console.log(`[generate] id=${requestId} provider=openai completed in ${timing.elapsedMs}ms`);
      res.json({
        success: true,
        content: result.content,
        providerUsed: 'openai',
        modelUsed: result.modelUsed,
        usage: result.usage,
        timing,
      });
      return;
    }

    res.status(400).json({
      success: false,
      error: `Unknown provider: ${provider}`,
      timing: buildTimingPayload(startTime),
    });
  } catch (error: unknown) {
    const timing = buildTimingPayload(startTime);
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[generate] id=${requestId} error after ${timing.elapsedMs}ms:`, errMsg);

    // Forward error details so Vercel-side can classify them
    res.status(500).json({
      success: false,
      error: errMsg,
      timing,
    });
  }
});

// ============================================
// Start server
// ============================================
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`ScanVocab AI Gateway listening on port ${PORT}`);
  console.log(`  GCP Project: ${process.env.GCP_PROJECT_ID}`);
  console.log(`  Location: ${process.env.GCP_LOCATION || 'asia-northeast1'}`);
  console.log(`  OpenAI: configured`);
  console.log(`  Fallback model: ${fallbackRunner.getConfig().fallbackOpenAIModel}`);
  console.log(`  Fallback calls cap/day: ${fallbackRunner.getConfig().fallbackCallsDailyCap}`);
  console.log(`  Fallback cost cap/day: ${fallbackRunner.getConfig().fallbackCostDailyCapYen}`);
  console.log(`  Gateway calls cap/day: ${gatewayLimiterConfig.callsDailyCap}`);
  console.log(`  Gateway cost cap/day: ${gatewayLimiterConfig.costDailyCapYen}`);
  console.log(`  Gateway guard store: ${gatewayFirestoreGuard.store}`);
});
