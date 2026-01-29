// Resend API Client for sending OTP emails

const RESEND_API_URL = 'https://api.resend.com/emails';

interface SendOtpEmailParams {
  to: string;
  otpCode: string;
}

interface ResendResponse {
  messageId?: string;
  error?: string;
}

export async function sendOtpEmail({ to, otpCode }: SendOtpEmailParams): Promise<ResendResponse> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.error('RESEND_API_KEY is not set');
    return { error: 'メール送信の設定エラーです' };
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Merken <noreply@merken.jp>',
        to: [to],
        subject: '【Merken】認証コード',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
              .container { max-width: 480px; margin: 0 auto; padding: 40px 20px; }
              .code {
                font-size: 32px;
                font-weight: bold;
                letter-spacing: 8px;
                background: #f3f4f6;
                padding: 20px;
                text-align: center;
                border-radius: 8px;
                margin: 24px 0;
              }
              .footer { color: #6b7280; font-size: 14px; margin-top: 32px; }
            </style>
          </head>
          <body>
            <div class="container">
              <h2>認証コード</h2>
              <p>Merkenへのログインに以下のコードを入力してください。</p>
              <div class="code">${otpCode}</div>
              <p>このコードは<strong>10分間</strong>有効です。</p>
              <div class="footer">
                <p>このメールに心当たりがない場合は、無視してください。</p>
                <p>Merken - 単語学習アプリ</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `Merken 認証コード\n\nログインに以下のコードを入力してください:\n\n${otpCode}\n\nこのコードは10分間有効です。\n\nこのメールに心当たりがない場合は、無視してください。`,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Resend API error:', response.status, errorData);
      return { error: 'メール送信に失敗しました' };
    }

    const data = await response.json();
    return { messageId: data.id };
  } catch (error) {
    console.error('Resend API request failed:', error);
    return { error: 'メール送信に失敗しました' };
  }
}

// 6桁のOTPコードを生成
export function generateOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
