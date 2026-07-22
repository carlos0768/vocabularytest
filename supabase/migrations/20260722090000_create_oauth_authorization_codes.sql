-- ChatGPT Custom GPT (GPT Actions) OAuth 2.0 認可コード管理テーブル
-- authorization code flow の一時コードを保持する。コードは平文では保存せず
-- SHA-256 ハッシュのみを保存する。otp_requests と同じ「service-role 専用の
-- 内部テーブル」パターン (20260209000500 参照)。
CREATE TABLE IF NOT EXISTS oauth_authorization_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash TEXT UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  scope TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
  used_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_oauth_authorization_codes_expires
  ON oauth_authorization_codes(expires_at);

-- 期限切れコードの掃除用（cleanup_expired_otps と同じ運用イメージ）
CREATE OR REPLACE FUNCTION cleanup_expired_oauth_authorization_codes()
RETURNS void AS $$
BEGIN
  DELETE FROM oauth_authorization_codes WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- RLS: service_role のみフルアクセス。anon / authenticated は明示 deny。
-- API ルートからは service role client 経由でのみ読み書きする。
ALTER TABLE oauth_authorization_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access to oauth_authorization_codes"
  ON public.oauth_authorization_codes
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "No direct access to oauth_authorization_codes"
  ON public.oauth_authorization_codes
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);
