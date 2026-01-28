-- OTP認証リクエスト管理テーブル
CREATE TABLE IF NOT EXISTS otp_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  otp_code TEXT NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  attempts INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '10 minutes')
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_requests(email);
CREATE INDEX IF NOT EXISTS idx_otp_expires ON otp_requests(expires_at);

-- 古いOTPを定期的に削除するための関数（オプション）
CREATE OR REPLACE FUNCTION cleanup_expired_otps()
RETURNS void AS $$
BEGIN
  DELETE FROM otp_requests WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- RLS有効化（Service Role Keyでのみアクセス）
ALTER TABLE otp_requests ENABLE ROW LEVEL SECURITY;

-- Service Roleのみフルアクセス（一般ユーザーはアクセス不可）
-- APIルートからはService Role Keyを使用するため問題なし
