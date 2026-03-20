import { NextRequest, NextResponse } from 'next/server';

const DEFAULT_FEEDBACK_BACKEND_URL =
  'https://merken-feedback.weallmartians.workers.dev/feedback';

function getFeedbackBackendUrl(): string {
  const raw = process.env.FEEDBACK_BACKEND_URL?.trim();
  return raw && raw.length > 0 ? raw : DEFAULT_FEEDBACK_BACKEND_URL;
}

export async function POST(request: NextRequest) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!payload || typeof payload !== 'object') {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const input = payload as Record<string, unknown>;
  const message =
    typeof input.message === 'string' ? input.message.trim() : '';

  if (!message) {
    return NextResponse.json(
      { error: 'message is required' },
      { status: 400 }
    );
  }

  const forwardPayload: Record<string, string> = { message };
  if (typeof input.user_id === 'string' && input.user_id.trim()) {
    forwardPayload.user_id = input.user_id.trim();
  }
  if (typeof input.page === 'string' && input.page.trim()) {
    forwardPayload.page = input.page.trim();
  }

  try {
    const response = await fetch(getFeedbackBackendUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(forwardPayload),
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Upstream feedback service error' },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error('Feedback forward failed:', error);
    return NextResponse.json(
      { error: 'Failed to submit feedback' },
      { status: 502 }
    );
  }
}
