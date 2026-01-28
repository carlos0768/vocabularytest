// Brevo (Sendinblue) API Client for sending OTP emails

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

interface SendOtpEmailParams {
  to: string;
  otpCode: string;
}

interface BrevoResponse {
  messageId?: string;
  error?: string;
}

export async function sendOtpEmail({ to, otpCode }: SendOtpEmailParams): Promise<BrevoResponse> {
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    console.error('BREVO_API_KEY is not set');
    return { error: 'メール送信の設定エラーです' };
  }

  const emailContent = {
    sender: {
      name: 'ScanVocab',
      email: 'carlosking1208@gmail.com',
    },
    to: [{ email: to }],
    subject: '【ScanVocab】認証コード',
    htmlContent: `
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
          <p>ScanVocabへのログインに以下のコードを入力してください。</p>
          <div class="code">${otpCode}</div>
          <p>このコードは<strong>10分間</strong>有効です。</p>
          <div class="footer">
            <p>このメールに心当たりがない場合は、無視してください。</p>
            <p>ScanVocab - 単語学習アプリ</p>
          </div>
        </div>
      </body>
      </html>
    `,
    textContent: `ScanVocab 認証コード\n\nログインに以下のコードを入力してください:\n\n${otpCode}\n\nこのコードは10分間有効です。\n\nこのメールに心当たりがない場合は、無視してください。`,
  };

  try {
    const response = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify(emailContent),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Brevo API error:', response.status, errorData);
      return { error: 'メール送信に失敗しました' };
    }

    const data = await response.json();
    return { messageId: data.messageId };
  } catch (error) {
    console.error('Brevo API request failed:', error);
    return { error: 'メール送信に失敗しました' };
  }
}

// 6桁のOTPコードを生成
export function generateOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
