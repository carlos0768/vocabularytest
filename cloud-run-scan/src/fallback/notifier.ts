import type {
  FallbackNotificationPayload,
  FallbackSeverity,
  FallbackSlackEvent,
} from './types.js';

const COOLDOWN_MS: Record<FallbackSlackEvent, number> = {
  QUOTA_EXHAUSTED: 24 * 60 * 60 * 1000,
  BREAKER_OPEN: 0,
  FALLBACK_CAP_REACHED: 0,
  FALLBACK_RATE_HIGH: 10 * 60 * 1000,
  AUTH_OR_PERMISSION: 0,
};

export class SlackFallbackNotifier {
  private readonly webhookUrl?: string;
  private readonly lastSent = new Map<string, number>();

  constructor(webhookUrl?: string) {
    this.webhookUrl = webhookUrl?.trim() || undefined;
  }

  async notify(
    event: FallbackSlackEvent,
    severity: FallbackSeverity,
    payload: FallbackNotificationPayload,
  ): Promise<void> {
    const now = Date.now();
    const cooldown = COOLDOWN_MS[event] ?? 0;
    const key = `${payload.env}:${event}`;

    if (cooldown > 0) {
      const last = this.lastSent.get(key);
      if (last && now - last < cooldown) {
        return;
      }
    }

    const text = this.buildMessage(event, severity, payload);

    if (!this.webhookUrl) {
      console.warn('[fallback-notify] webhook not configured:', text);
      this.lastSent.set(key, now);
      return;
    }

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text }),
      });

      if (!response.ok) {
        const body = await response.text().catch(() => '');
        console.error('[fallback-notify] Slack webhook failed:', response.status, body);
        return;
      }

      this.lastSent.set(key, now);
    } catch (error) {
      console.error('[fallback-notify] Slack notify error:', error);
    }
  }

  private buildMessage(
    event: FallbackSlackEvent,
    severity: FallbackSeverity,
    payload: FallbackNotificationPayload,
  ): string {
    const lines: string[] = [
      `[scan-fallback][${severity}] ${event}`,
      `env=${payload.env} feature=${payload.feature} request_id=${payload.request_id}`,
      `from=${payload.from} to=${payload.to} reason=${payload.reason}`,
      `breaker_state=${payload.breaker_state}`,
      `fallback_today_calls=${payload.fallback_today_calls} fallback_today_yen=${payload.fallback_today_yen}`,
    ];

    if (payload.window_stats) {
      lines.push(
        `window_stats total=${payload.window_stats.totalRequests} 429=${payload.window_stats.count429} 5xx=${payload.window_stats.count5xx} eligible=${payload.window_stats.eligibleErrors} error_rate=${payload.window_stats.errorRate.toFixed(3)}`,
      );
    }

    if (payload.sample_error) {
      lines.push(`sample_error=${payload.sample_error.slice(0, 300)}`);
    }

    if (payload.extra) {
      lines.push(`extra=${JSON.stringify(payload.extra)}`);
    }

    return lines.join('\n');
  }
}
