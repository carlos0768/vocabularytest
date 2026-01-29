/**
 * ScanVocab AI Gateway - Cloud Run Service
 *
 * Vertex AI (Gemini) と OpenAI へのリクエストを中継するゲートウェイ。
 * Vercel の API Routes からのみ呼び出される。
 */

import express from 'express';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';

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

// OpenAI - for 2-step modes (eiken, wrong answers, grammar analysis)
const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// ============================================
// Health check
// ============================================
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
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
}

app.post('/generate', async (req, res) => {
  const startTime = Date.now();
  const body = req.body as GenerateRequest;
  const { provider, model, prompt, systemPrompt, image, temperature, maxOutputTokens, responseFormat } = body;

  console.log(`[generate] provider=${provider} model=${model} hasImage=${!!image} format=${responseFormat}`);

  try {
    if (provider === 'gemini') {
      // --- Vertex AI (Gemini) ---
      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

      const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
      parts.push({ text: fullPrompt });

      if (image) {
        parts.push({
          inlineData: {
            mimeType: image.mimeType,
            data: image.base64,
          },
        });
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const generateConfig: any = {
        temperature,
        maxOutputTokens,
      };

      if (responseFormat === 'json') {
        generateConfig.responseMimeType = 'application/json';
      }

      const response = await geminiClient.models.generateContent({
        model,
        contents: [{ role: 'user', parts }],
        config: generateConfig,
      });

      const content = response.text;
      const elapsed = Date.now() - startTime;
      console.log(`[generate] gemini completed in ${elapsed}ms`);

      if (!content) {
        res.json({ success: false, error: '画像を読み取れませんでした' });
        return;
      }

      res.json({ success: true, content });

    } else if (provider === 'openai') {
      // --- OpenAI ---
      if (!openaiClient) {
        res.status(500).json({ success: false, error: 'OpenAI not configured' });
        return;
      }

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

      if (image) {
        messages.push({
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:${image.mimeType};base64,${image.base64}`,
              },
            },
          ],
        });
      } else {
        messages.push({ role: 'user', content: prompt });
      }

      const response = await openaiClient.chat.completions.create({
        model,
        messages,
        temperature,
        max_tokens: maxOutputTokens,
      });

      const content = response.choices[0]?.message?.content;
      const elapsed = Date.now() - startTime;
      console.log(`[generate] openai completed in ${elapsed}ms`);

      if (!content) {
        res.json({ success: false, error: '画像を読み取れませんでした' });
        return;
      }

      res.json({ success: true, content });

    } else {
      res.status(400).json({ success: false, error: `Unknown provider: ${provider}` });
    }
  } catch (error: unknown) {
    const elapsed = Date.now() - startTime;
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[generate] error after ${elapsed}ms:`, errMsg);

    // Forward error details so Vercel-side can classify them
    res.status(500).json({
      success: false,
      error: errMsg,
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
  console.log(`  OpenAI: ${openaiClient ? 'configured' : 'not configured'}`);
});
