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

interface SendProUpgradeEmailParams {
  to: string;
}

export async function sendProUpgradeEmail({ to }: SendProUpgradeEmailParams): Promise<ResendResponse> {
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
        subject: '【Merken】Proプランへのアップグレード完了',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; }
              .container { max-width: 480px; margin: 0 auto; padding: 40px 20px; }
              .badge {
                display: inline-block;
                background: linear-gradient(135deg, #6366f1, #8b5cf6);
                color: #fff;
                font-weight: bold;
                font-size: 14px;
                padding: 6px 16px;
                border-radius: 20px;
                margin-bottom: 16px;
              }
              .features {
                background: #f9fafb;
                border-radius: 12px;
                padding: 20px 24px;
                margin: 24px 0;
              }
              .features ul { margin: 0; padding-left: 20px; }
              .features li { margin-bottom: 8px; line-height: 1.6; }
              .cta {
                display: inline-block;
                background: #6366f1;
                color: #fff !important;
                text-decoration: none;
                font-weight: bold;
                padding: 12px 32px;
                border-radius: 8px;
                margin: 16px 0;
              }
              .footer { color: #6b7280; font-size: 14px; margin-top: 32px; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="badge">PRO</div>
              <h2>Proプランへようこそ！</h2>
              <p>Merken Proプランへのアップグレードが完了しました。以下の機能がご利用いただけます。</p>
              <div class="features">
                <ul>
                  <li><strong>無制限スキャン</strong> — 1日の制限なし</li>
                  <li><strong>無制限単語登録</strong> — 100語の制限なし</li>
                  <li><strong>クラウド同期</strong> — 複数デバイスで学習</li>
                  <li><strong>高度なスキャンモード</strong> — 丸囲み・マーカー・英検・熟語・間違い抽出</li>
                </ul>
              </div>
              <a href="https://www.merken.jp" class="cta">Merkenを開く</a>
              <div class="footer">
                <p>ご不明な点がございましたら、お気軽にお問い合わせください。</p>
                <p>Merken - 単語学習アプリ</p>
              </div>
            </div>
          </body>
          </html>
        `,
        text: `Proプランへようこそ！\n\nMerken Proプランへのアップグレードが完了しました。\n\n以下の機能がご利用いただけます：\n- 無制限スキャン（1日の制限なし）\n- 無制限単語登録（100語の制限なし）\n- クラウド同期（複数デバイスで学習）\n- 高度なスキャンモード（丸囲み・マーカー・英検・熟語・間違い抽出）\n\nhttps://www.merken.jp\n\nMerken - 単語学習アプリ`,
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
