import { randomUUID } from 'node:crypto';
import express from 'express';
import { NotionDbInvestigationWriter } from './notion.js';
import { resolveProviderFromEnv } from './providers/factory.js';
import { detectDbRelatedChanges } from './rules/db-rules.js';
import { investigationRequestSchema } from './schema.js';
import { extractSafeRequestMetadata, requireBearerToken } from './security/auth.js';

const app = express();
app.use(express.json({ limit: '2mb' }));

const authToken = process.env.WEBHOOK_AUTH_TOKEN?.trim() || '';
if (!authToken) {
  throw new Error('WEBHOOK_AUTH_TOKEN is required');
}

const provider = resolveProviderFromEnv(process.env);
const notionWriter = new NotionDbInvestigationWriter({
  apiKey: process.env.NOTION_API_KEY,
  databaseId: process.env.NOTION_DATABASE_ID,
});

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    provider: provider.name,
    notionConfigured: Boolean(process.env.NOTION_API_KEY && process.env.NOTION_DATABASE_ID),
  });
});

app.post('/investigate', async (req, res) => {
  const requestId = req.headers['x-request-id']?.toString() || randomUUID();
  const meta = extractSafeRequestMetadata(req);

  if (!requireBearerToken(req, authToken)) {
    res.status(401).json({ requestId, success: false, error: 'Unauthorized' });
    return;
  }

  const parsed = investigationRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      requestId,
      success: false,
      error: 'Invalid payload',
      issues: parsed.error.issues,
    });
    return;
  }

  const request = parsed.data;
  const detection = detectDbRelatedChanges(request.changedFiles);

  if (!detection.isDbRelated) {
    res.json({
      requestId,
      success: true,
      skipped: true,
      reason: 'No DB-related changes detected',
      metadata: meta,
      detection,
    });
    return;
  }

  try {
    const assessment = await provider.assess({ request, detection });
    const notion = await notionWriter.write({ request, detection, assessment });

    res.json({
      requestId,
      success: true,
      skipped: false,
      metadata: meta,
      detection,
      assessment,
      notion,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[investigate] requestId=${requestId} failed: ${message}`);
    res.status(500).json({
      requestId,
      success: false,
      error: message,
    });
  }
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`DB investigation service listening on port ${port}`);
  console.log(`Provider: ${provider.name}`);
});
