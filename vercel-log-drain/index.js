const express = require('express');
const { WebClient } = require('@slack/web-api');

const app = express();
app.use(express.json({ limit: '2mb' }));

const PORT = Number(process.env.PORT) || 8080;
const VERCEL_WEBHOOK_SECRET = process.env.VERCEL_WEBHOOK_SECRET || '';
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || '';
const SLACK_CHANNEL_ID = process.env.SLACK_CHANNEL_ID || 'C0AH493Q61J';

const slackClient = new WebClient(SLACK_BOT_TOKEN);

function formatJst(timestamp) {
  if (!timestamp) return '(不明)';
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return String(timestamp);
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).format(date) + ' JST';
}

// Vercel Webhook events:
// deployment.created, deployment.succeeded, deployment.error, deployment.canceled
// deployment.ready, deployment.check-rerequested
async function handleWebhook(payload) {
  const type = payload.type || '';
  const deployment = payload.payload?.deployment || {};
  const name = deployment.name || payload.payload?.name || '-';
  const url = deployment.url ? `https://${deployment.url}` : '-';
  const meta = deployment.meta || {};
  const commit = meta.githubCommitSha?.substring(0, 7) || '-';
  const branch = meta.githubCommitRef || '-';
  const createdAt = formatJst(payload.createdAt || deployment.createdAt);

  if (type === 'deployment.error' || type === 'deployment.canceled') {
    const errorMessage = payload.payload?.deploymentError?.message 
      || payload.payload?.error?.message 
      || '詳細不明';

    const text = [
      '🚨 デプロイ失敗',
      `プロジェクト: ${name}`,
      `ブランチ: \`${branch}\``,
      `Commit: \`${commit}\``,
      `エラー: ${errorMessage}`,
      `時刻: ${createdAt}`,
      url !== '-' ? `URL: ${url}` : '',
    ].filter(Boolean).join('\n');

    await slackClient.chat.postMessage({ channel: SLACK_CHANNEL_ID, text });
    return { notified: true, type };
  }

  // deployment.succeeded / deployment.ready — optional success log
  if (type === 'deployment.succeeded' || type === 'deployment.ready') {
    return { notified: false, type, reason: 'success event, no notification needed' };
  }

  return { notified: false, type, reason: 'unhandled event type' };
}

app.get('/', (_req, res) => {
  res.status(200).send('ok');
});

app.post('/', async (req, res) => {
  try {
    const result = await handleWebhook(req.body);
    console.log(`Webhook processed: type=${result.type}, notified=${result.notified}`);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Webhook handling error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`vercel-webhook service listening on port ${PORT}`);
});
